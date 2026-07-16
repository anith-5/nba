// Per-team full-franchise-history cache for Closest To's player-selection
// panel. The live source (services/api/app/routers/team_players.py) walks
// every season since a franchise's founding via nba_api -- real-world timing
// came back at over 2 minutes for a ~30-season team, far too slow to make a
// player wait on synchronously after clicking Accept on the wheel. So this
// module preloads every team in the background (see startTeamPlayersPreload)
// and persists each completed fetch to disk (see teamCache/) so a server
// restart doesn't have to re-walk the NBA API for data it already has.
//
// Callers that ask for a team before its data has ever arrived (first-ever
// request for a team, or a still-in-progress preload) simply wait for the
// real fetch to resolve -- there is no silent fallback to a smaller/older
// dataset for a team we've already fetched successfully once, and no
// fallback to partial data. See getTeamPlayers below.
//
// PPG accuracy: stats.nba.com throttles under sustained load, which used to
// show up as false 0 PPG values for real players. The live endpoint now
// marks any season it couldn't confirm real stats for as ppg_confirmed:
// false (ppg: null) instead. This module keeps a background retry loop
// (scheduleUnavailableSeasonRetries) that re-checks those specific seasons
// slowly (one call every 3s) and patches the cache + notifies connected
// clients via a "cache_updated" broadcast as real data comes in.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import staticData from "./nba_player_seasons.json" with { type: "json" };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DISK_CACHE_DIR = path.join(__dirname, "teamCache");

const FASTAPI_BASE_URL = process.env.HOOPIQ_API_URL || "http://localhost:8001";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // re-fetch a team once its data is over a week old
const FETCH_ABORT_MS = 20 * 60 * 1000; // safety ceiling for a single team's live fetch
const SEASON_RETRY_GAP_MS = 3_000; // background re-checks of unconfirmed seasons
const PRELOAD_TEAM_GAP_MS = 3_000; // gap between starting each preloaded team's request
const PRELOAD_SEASON_DELAY_SEC = 1.0; // gentler per-season pacing during preload

// All 30 franchises, ordered most-popular-first. The preload loop below is a
// straight sequential walk through this array, so "tier 2 starts once tier 1
// finishes" falls out naturally from the ordering -- no separate tier logic
// needed.
const PRELOAD_TEAMS = [
  // Tier 1
  "LAL", "BOS", "GSW", "CHI", "SAS", "MIA", "NYK", "OKC", "DEN", "MIL",
  // Tier 2
  "PHX", "DAL", "POR", "UTA", "MEM", "IND", "ORL", "DET", "SAC", "CHA",
  // Tier 3
  "HOU", "ATL", "CLE", "MIN", "NOP", "TOR", "PHI", "BKN", "LAC", "WAS",
];

const cache = new Map(); // abbr -> { data, fetchedAt }
const inFlight = new Map(); // abbr -> Promise<data> (still running live fetches)
let ioInstance = null;

export function setIo(io) {
  ioInstance = io;
}

function isFresh(entry) {
  return !!entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS;
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

// --- Disk persistence -------------------------------------------------
// Each team's fully-resolved data is written to teamCache/{ABBR}.json as
// { fetchedAt, data }. On startup we load whatever's there before kicking
// off any network calls, so a server restart within the 7-day freshness
// window serves every previously-completed team instantly with zero API
// calls -- see loadDiskCacheOnStartup and startTeamPlayersPreload.
async function ensureDiskCacheDir() {
  await fs.mkdir(DISK_CACHE_DIR, { recursive: true });
}

function diskCachePath(abbr) {
  return path.join(DISK_CACHE_DIR, `${abbr}.json`);
}

async function writeDiskCache(abbr, data, fetchedAt) {
  try {
    await ensureDiskCacheDir();
    await fs.writeFile(diskCachePath(abbr), JSON.stringify({ fetchedAt, data }, null, 2));
  } catch (err) {
    console.warn(`[teamPlayersCache] ${abbr}: failed to write disk cache: ${err.message}`);
  }
}

async function readDiskCache(abbr) {
  try {
    const raw = await fs.readFile(diskCachePath(abbr), "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed?.data || !parsed?.fetchedAt) return null;
    return parsed;
  } catch {
    return null; // no file yet, or unreadable -- treat as "nothing cached"
  }
}

// Loads every team's disk cache (if present) into memory before the server
// starts accepting connections. This is a handful of small local file reads
// so it doesn't meaningfully delay startup -- the slow part (live NBA API
// calls) only happens afterward, in the background, for whatever's missing
// or stale. See server.js.
export async function loadDiskCacheOnStartup() {
  await ensureDiskCacheDir();
  let loaded = 0;
  for (const abbr of PRELOAD_TEAMS) {
    const entry = await readDiskCache(abbr);
    if (entry) {
      cache.set(abbr, { data: entry.data, fetchedAt: entry.fetchedAt });
      loaded++;
    }
  }
  console.log(`[teamPlayersCache] loaded ${loaded}/${PRELOAD_TEAMS.length} team(s) from disk cache on startup`);
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
    await writeDiskCache(abbr, current.data, current.fetchedAt);
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
    .then(async (data) => {
      const fetchedAt = Date.now();
      cache.set(abbr, { data, fetchedAt });
      inFlight.delete(abbr);
      console.log(`[teamPlayersCache] live fetch for ${abbr} completed and cached (${data.players.length} players)`);
      await writeDiskCache(abbr, data, fetchedAt);
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

// Resolves a team's full roster data. Three cases:
//   1. Fresh (< 7 days old) cache entry -> return it immediately.
//   2. Stale cache entry (we have real data, it's just old) -> return it
//      immediately (still far better than nothing) and kick off a background
//      refresh so the next call gets current data.
//   3. Nothing cached yet -> there is no shortcut: await the live fetch and
//      return whatever it resolves to, or let its rejection propagate.
// Callers (gameHandlers.js) are expected to show a loading state while
// waiting on case 3 and an error state if the fetch throws -- never a
// partial or stale-looking substitute for a team we haven't loaded yet.
export async function getTeamPlayers(abbr) {
  const cached = cache.get(abbr);
  if (isFresh(cached)) return cached.data;

  if (cached) {
    if (!inFlight.has(abbr)) {
      startLiveFetch(abbr).catch((err) => {
        console.warn(`[teamPlayersCache] ${abbr}: background refresh of stale cache failed: ${err.message}`);
      });
    }
    return cached.data;
  }

  const livePromise = inFlight.get(abbr) || startLiveFetch(abbr);
  return livePromise; // resolves with data, or rejects -- caller's problem to handle
}

// Sync accessor used to validate a confirm_pick against whatever data the
// matching list_team_players call actually resolved to. Falls back to the
// tiny hand-authored static file only in the (should-be-unreachable) case
// where a pick is being confirmed for a team we have never once
// successfully cached -- confirm_pick can only happen after list_team_players
// already served real data for this team, so this is a last-resort safety
// net, not part of the normal flow.
export function getResolvedTeamPlayers(abbr) {
  const cached = cache.get(abbr);
  if (cached) return cached.data;
  return staticFallback(abbr);
}

export function isTeamCached(abbr) {
  return cache.has(abbr);
}

// Warms all 30 franchises on server startup, sequentially (never
// concurrently -- running two full-history fetches at once is exactly what
// triggered stats.nba.com's rate limiting in testing), most-popular-first,
// with a 3s gap between team requests and gentler per-season pacing within
// each team. Teams already fresh from disk (see loadDiskCacheOnStartup) are
// skipped entirely -- no API call, no gap -- so a same-week restart re-warms
// nothing it doesn't have to. This is intentionally slow for teams that DO
// need fetching; it trades preload time for accuracy, and runs entirely
// after the server is already accepting connections (see server.js).
export async function startTeamPlayersPreload() {
  for (const abbr of PRELOAD_TEAMS) {
    if (isFresh(cache.get(abbr))) {
      console.log(`[teamPlayersCache] preload: ${abbr} already fresh from disk cache, skipping API fetch`);
      continue;
    }
    try {
      console.log(`[teamPlayersCache] preload: starting ${abbr}`);
      await startLiveFetch(abbr, { seasonDelay: PRELOAD_SEASON_DELAY_SEC });
    } catch (err) {
      console.warn(`[teamPlayersCache] preload: ${abbr} failed (${err.message}), will retry on-demand later`);
    }
    await wait(PRELOAD_TEAM_GAP_MS);
  }
  console.log("[teamPlayersCache] preload: finished all 30 franchises");
}
