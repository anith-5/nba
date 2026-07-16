// Per-team full-franchise-history cache for Closest To's player-selection
// panel. The live source (services/api/app/routers/team_players.py) walks
// every season since a franchise's founding via nba_api -- real-world timing
// came back at over 2 minutes for a ~30-season team, far too slow to make a
// player wait on synchronously after clicking Accept on the wheel. So this
// module races a short wait against the live fetch: if the live fetch hasn't
// finished within WAIT_BUDGET_MS, the caller gets the static-file fallback
// immediately, but the live fetch is NOT cancelled -- it keeps running in the
// background and populates the cache whenever it does finish, so the next
// time that team gets spun (by anyone, within the 24h TTL) it's instant and
// complete.
//
// PPG accuracy: stats.nba.com throttles under sustained load, which used to
// show up as false 0 PPG values for real players. The live endpoint now
// marks any season it couldn't confirm real stats for as ppg_confirmed:
// false (ppg: null) instead. This module keeps a background retry loop
// (scheduleUnavailableSeasonRetries) that re-checks those specific seasons
// slowly (one call every 3s) and patches the cache + notifies connected
// clients via a "cache_updated" broadcast as real data comes in.
import staticData from "./nba_player_seasons.json" with { type: "json" };

const FASTAPI_BASE_URL = process.env.HOOPIQ_API_URL || "http://localhost:8001";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const WAIT_BUDGET_MS = 20_000; // how long a player will wait before falling back
const FETCH_ABORT_MS = 20 * 60 * 1000; // let the background fetch run long after that
const SEASON_RETRY_GAP_MS = 3_000; // background re-checks of unconfirmed seasons
const PRELOAD_TEAM_GAP_MS = 2_000; // gap between starting each preloaded team
const PRELOAD_SEASON_DELAY_SEC = 1.0; // gentler per-season pacing during preload
const PRELOAD_TEAMS = ["LAL", "BOS", "GSW", "CHI", "SAS", "MIA", "NYK", "OKC", "DEN", "MIL"];

const cache = new Map(); // abbr -> { data, expiresAt }
const inFlight = new Map(); // abbr -> Promise<data> (still running live fetches)
let ioInstance = null;

export function setIo(io) {
  ioInstance = io;
}

function staticFallback(abbr) {
  const team = staticData[abbr];
  const note = "Showing limited player data";
  if (!team) {
    return { team_name: abbr, data_complete: false, source: "static-fallback", note, players: [] };
  }
  return {
    team_name: team.team_name,
    data_complete: team.data_complete ?? false,
    source: "static-fallback",
    note,
    // Hand-authored static entries are real values, not throttle artifacts.
    players: team.players.map((p) => ({
      ...p,
      seasons: p.seasons.map((s) => ({ ...s, ppg_confirmed: true })),
    })),
  };
}

async function fetchLive(abbr, { seasonDelay } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_ABORT_MS);
  try {
    const qs = seasonDelay != null ? `?season_delay=${seasonDelay}` : "";
    const res = await fetch(`${FASTAPI_BASE_URL}/api/arena/team-players/${abbr}${qs}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`FastAPI returned ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

// A season needs retrying only if its stats call looks like it totally
// failed (nobody on the roster that season got confirmed). If at least one
// player came back confirmed, the season-level call clearly succeeded --
// any remaining unconfirmed players in that same season (e.g. a rookie who
// missed the whole year to injury and has 0 real games anywhere in the
// stats dataset) aren't throttling victims, they just don't have
// confirmable data, and re-querying the same season won't change that.
function unconfirmedSeasons(data) {
  const bySeasson = new Map(); // season -> { anyConfirmed, anyUnconfirmed }
  for (const player of data.players) {
    for (const s of player.seasons) {
      const entry = bySeasson.get(s.season) || { anyConfirmed: false, anyUnconfirmed: false };
      if (s.ppg_confirmed) entry.anyConfirmed = true;
      else entry.anyUnconfirmed = true;
      bySeasson.set(s.season, entry);
    }
  }
  return [...bySeasson.entries()].filter(([, e]) => e.anyUnconfirmed && !e.anyConfirmed).map(([season]) => season);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(() => resolve(undefined), ms));
}

const MAX_RETRY_ROUNDS = 4;
const ROUND_COOLDOWN_MS = 60_000; // let a still-throttled window pass before trying those seasons again

async function retrySeasonOnce(abbr, season) {
  let rows;
  try {
    const res = await fetch(`${FASTAPI_BASE_URL}/api/arena/team-players/${abbr}/season/${season}`);
    if (!res.ok) return false;
    rows = (await res.json()).players;
  } catch {
    return false; // still throttled/unavailable -- try again next round
  }

  const current = cache.get(abbr);
  if (!current) return false; // cache entry expired/evicted while we were retrying
  let changed = false;
  const playersById = new Map(current.data.players.map((p) => [p.player_id, p]));

  for (const row of rows) {
    if (!row.ppg_confirmed) continue;
    let player = playersById.get(row.player_id);
    if (!player) {
      player = { name: row.name, player_id: row.player_id, seasons: [] };
      current.data.players.push(player);
      playersById.set(row.player_id, player);
    }
    const existing = player.seasons.find((s) => s.season === season);
    const updated = { season, ppg: row.ppg, position: row.position, ppg_confirmed: true };
    if (existing) Object.assign(existing, updated);
    else player.seasons.push(updated);
    changed = true;
  }

  if (changed) {
    console.log(`[teamPlayersCache] ${abbr}: confirmed PPG for ${season}, notifying clients`);
    ioInstance?.emit("cache_updated", { team: abbr, season });
  }
  return changed;
}

// A single pass at 3s between calls isn't always enough -- stats.nba.com's
// throttling window from the initial full-history walk can outlast one
// quick pass through the leftover seasons. So this repeats multiple rounds
// (with a cooldown between rounds) against whatever is STILL unconfirmed,
// stopping as soon as everything is confirmed or a round makes no progress
// after several tries.
async function scheduleUnavailableSeasonRetries(abbr) {
  for (let round = 1; round <= MAX_RETRY_ROUNDS; round++) {
    const cached = cache.get(abbr);
    if (!cached) return;
    const seasons = unconfirmedSeasons(cached.data);
    if (seasons.length === 0) {
      if (round > 1) console.log(`[teamPlayersCache] ${abbr}: all seasons confirmed after ${round - 1} retry round(s)`);
      return;
    }

    console.log(`[teamPlayersCache] ${abbr}: retry round ${round}/${MAX_RETRY_ROUNDS} — ${seasons.length} unconfirmed season(s)`);
    let confirmedThisRound = 0;
    for (const season of seasons) {
      await wait(SEASON_RETRY_GAP_MS);
      if (await retrySeasonOnce(abbr, season)) confirmedThisRound++;
    }
    console.log(`[teamPlayersCache] ${abbr}: round ${round} confirmed ${confirmedThisRound}/${seasons.length}`);

    if (round < MAX_RETRY_ROUNDS) await wait(ROUND_COOLDOWN_MS);
  }
  const stillUnconfirmed = unconfirmedSeasons(cache.get(abbr)?.data || { players: [] });
  if (stillUnconfirmed.length > 0) {
    console.warn(
      `[teamPlayersCache] ${abbr}: giving up after ${MAX_RETRY_ROUNDS} rounds, ${stillUnconfirmed.length} season(s) still unconfirmed (will retry on next cache warm)`
    );
  }
}

function startLiveFetch(abbr, options) {
  const promise = fetchLive(abbr, options)
    .then((data) => {
      cache.set(abbr, { data, expiresAt: Date.now() + CACHE_TTL_MS });
      inFlight.delete(abbr);
      console.log(`[teamPlayersCache] live fetch for ${abbr} completed and cached (${data.players.length} players)`);
      scheduleUnavailableSeasonRetries(abbr).catch((err) =>
        console.warn(`[teamPlayersCache] ${abbr}: background season retry loop errored: ${err.message}`)
      );
      return data;
    })
    .catch((err) => {
      inFlight.delete(abbr);
      console.warn(`[teamPlayersCache] live fetch for ${abbr} failed: ${err.message}`);
      throw err;
    });
  inFlight.set(abbr, promise);
  return promise;
}

export async function getTeamPlayers(abbr) {
  const cached = cache.get(abbr);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const livePromise = inFlight.get(abbr) || startLiveFetch(abbr);
  // Race the live fetch against the wait budget. Swallow a late rejection
  // from the loser so it doesn't surface as an unhandled promise rejection.
  livePromise.catch(() => {});

  const result = await Promise.race([livePromise, wait(WAIT_BUDGET_MS)]);
  if (result) return result;

  return staticFallback(abbr);
}

// Sync accessor used to validate a confirm_pick against whatever data the
// matching list_team_players call actually resolved to (live-if-ready cache
// hit, otherwise the same static fallback that would have been served).
export function getResolvedTeamPlayers(abbr) {
  const cached = cache.get(abbr);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  return staticFallback(abbr);
}

// Warms the top 10 most-likely-to-be-spun franchises on server startup,
// sequentially (never concurrently -- running two full-history fetches at
// once is exactly what triggered stats.nba.com's rate limiting in testing)
// with gaps between teams and a gentler per-season pace within each team.
// This is intentionally slow; it trades preload time for accuracy.
export async function startTeamPlayersPreload() {
  for (const abbr of PRELOAD_TEAMS) {
    try {
      console.log(`[teamPlayersCache] preload: starting ${abbr}`);
      await startLiveFetch(abbr, { seasonDelay: PRELOAD_SEASON_DELAY_SEC });
    } catch (err) {
      console.warn(`[teamPlayersCache] preload: ${abbr} failed (${err.message}), will retry on-demand later`);
    }
    await wait(PRELOAD_TEAM_GAP_MS);
  }
  console.log("[teamPlayersCache] preload: finished top 10 franchises");
}
