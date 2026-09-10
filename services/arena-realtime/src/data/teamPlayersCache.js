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
import historicalStats from "./historical_player_stats.json" with { type: "json" };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DISK_CACHE_DIR = path.join(__dirname, "teamCache");

const FASTAPI_BASE_URL = process.env.HOOPIQ_API_URL || "http://localhost:8001";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // re-fetch a team once its data is over a week old
const FETCH_ABORT_MS = 20 * 60 * 1000; // safety ceiling for a single team's live fetch
const SEASON_RETRY_GAP_MS = 3_000; // background re-checks of unconfirmed seasons
const PRELOAD_TEAM_GAP_MS = 3_000; // gap between starting each preloaded team's request
const PRELOAD_SEASON_DELAY_SEC = 1.0;
const FIRST_NBA_STATS_YEAR = 1996; // leaguedashplayerstats serves nothing earlier // gentler per-season pacing during preload

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

// ---------------------------------------------------------------------------
// Pre-1996 stats overlay
// ---------------------------------------------------------------------------
// stats.nba.com serves no player stats before 1996-97, so every earlier season
// arrives ppg_confirmed:false with null numbers and the game logic (which
// filters on ppg_confirmed) drops it -- the 1980s wheel in 82-0 showed nobody,
// for every franchise. The rosters were never the problem; the three per-game
// numbers were. historical_player_stats.json supplies them from
// Basketball-Reference (see scripts/generate-historical-stats.mjs).
//
// This is applied as an overlay when data enters the in-memory cache, NOT
// baked into what gets written to disk. Two reasons: the disk cache stays a
// faithful record of what the API actually returned, and a later refresh can
// never silently drop the overlay the way it would if this were merged into
// the stored payload.
//
// It only ever fills seasons NBA left unconfirmed, so live data always wins.

// Mirrors normName in scripts/generate-historical-stats.mjs -- both sides of
// the join have to normalise identically or nothing matches.
function normName(name) {
  return (name || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[ðĐđ]/gi, "d")
    .replace(/[øØ]/g, "o")
    .replace(/[þÞ]/gi, "th")
    .replace(/[^A-Za-z ]/g, "")
    .toLowerCase()
    .replace(/\s+(jr|sr|ii|iii|iv|v)$/, "")
    .trim();
}

function withHistoricalStats(abbr, data) {
  const history = historicalStats[abbr];
  if (!history || !data?.players) return data;

  let filled = 0;
  const players = data.players.map((p) => {
    const key = normName(p.name);
    let touched = false;
    const seasons = p.seasons.map((s) => {
      if (s.ppg_confirmed) return s; // live data is authoritative
      const hit = history[s.season]?.[key];
      if (!hit) return s;
      touched = true;
      filled++;
      return {
        ...s,
        ppg: hit.ppg,
        ast_pg: hit.ast_pg,
        reb_pg: hit.reb_pg,
        position: s.position || hit.position,
        ppg_confirmed: true,
        stats_source: "bbref",
      };
    });
    return touched ? { ...p, seasons } : p;
  });

  // Filling only works where the roster walk produced a row to fill. Some
  // franchises are missing whole eras -- BKN's cached roster starts at 1996-97
  // and LAC's at 2003-04, so their 1980s had nothing to attach numbers to.
  // For a season the cache covers not at all, the entries are built outright.
  //
  // Restricted to seasons with ZERO cached players on purpose. Adding into a
  // season the walk did cover would double up anyone the two sources spell
  // differently ("Nate" vs "Tiny" Archibald), which is worse than the handful
  // of names that simply stay unconfirmed.
  const seasonsInCache = new Set();
  for (const p of data.players) for (const s of p.seasons) seasonsInCache.add(s.season);

  // Copy-on-write throughout: `data` is the payload startLiveFetch persists to
  // disk, so mutating a player or its seasons array here would quietly write
  // the overlay into the cache file this is deliberately kept out of.
  const patched = players.slice();
  const added = [];
  const atIndex = new Map(); // normalised name -> index into patched
  const atAdded = new Map(); // normalised name -> index into added
  patched.forEach((p, i) => {
    const k = normName(p.name);
    if (!atIndex.has(k)) atIndex.set(k, i); // first wins; duplicates keep their own row
  });

  let addedSeasons = 0;
  for (const [season, roster] of Object.entries(history)) {
    if (seasonsInCache.has(season)) continue;
    for (const [key, h] of Object.entries(roster)) {
      const entry = {
        season,
        ppg: h.ppg,
        ast_pg: h.ast_pg,
        reb_pg: h.reb_pg,
        position: h.position,
        ppg_confirmed: true,
        stats_source: "bbref",
      };
      addedSeasons++;
      if (atIndex.has(key)) {
        const i = atIndex.get(key);
        patched[i] = { ...patched[i], seasons: [...patched[i].seasons, entry] };
      } else if (atAdded.has(key)) {
        const i = atAdded.get(key);
        added[i] = { ...added[i], seasons: [...added[i].seasons, entry] };
      } else {
        atAdded.set(key, added.length);
        added.push({ name: h.name, player_id: h.player_id, seasons: [entry] });
      }
    }
  }

  if (!filled && !addedSeasons) return data;
  return { ...data, players: [...patched, ...added] };
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
      cache.set(abbr, { data: withHistoricalStats(abbr, entry.data), fetchedAt: entry.fetchedAt });
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
// NBA seasons roll over in October, matching app/utils/season.py.
function currentSeasonStartYear() {
  const now = new Date();
  return now.getMonth() + 1 >= 10 ? now.getFullYear() : now.getFullYear() - 1;
}

function seasonStr(startYear) {
  return `${startYear}-${String(startYear + 1).slice(2)}`;
}

// Seasons absent from the data entirely, inferred from the range it does cover.
//
// A franchise plays every season between its first and the current one, so any
// hole in that range is a failed fetch rather than history. This is what finds
// gaps in caches written BEFORE the API started reporting failed_seasons --
// MEM's missing 2019-20..2025-26, for instance.
//
// It can only see holes INSIDE the covered range: a walk that died before its
// earliest season leaves no trace to infer from. Those are all pre-1996 in
// practice, where the Basketball-Reference overlay already covers us.
function missingSeasons(data) {
  const have = new Set();
  for (const p of data.players || []) for (const s of p.seasons || []) have.add(s.season);
  if (have.size === 0) return [];

  const startYears = [...have].map((s) => Number(s.slice(0, 4))).filter(Number.isFinite);
  const from = Math.min(...startYears);
  const to = currentSeasonStartYear();
  const gaps = [];
  for (let y = from; y <= to; y++) {
    const season = seasonStr(y);
    if (!have.has(season)) gaps.push(season);
  }
  return gaps;
}

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
  const unconfirmed = [...bySeasson.entries()]
    .filter(([, e]) => e.anyUnconfirmed && !e.anyConfirmed)
    .map(([season]) => season);

  // Seasons the API's walk could not fetch at all aren't in `players`, so the
  // loop above cannot see them -- which is why a truncated franchise history
  // never repaired itself. team_players.py now reports them explicitly.
  const failed = data.failed_seasons || [];
  const all = [...new Set([...unconfirmed, ...failed, ...missingSeasons(data)])];

  // Never spend a call on a season NBA structurally cannot answer:
  // leaguedashplayerstats returns nothing before 1996-97, so those seasons
  // would come back unconfirmed every round, forever. They are the
  // Basketball-Reference overlay's job, not the retry loop's -- and API calls
  // are the scarce resource that throttling punishes.
  return all.filter((season) => Number(season.slice(0, 4)) >= FIRST_NBA_STATS_YEAR);
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
    const updated = {
      season,
      ppg: row.ppg,
      // ast_pg/reb_pg were dropped here, so a repaired season came back
      // "confirmed" but scored as 0 assists and 0 rebounds in 82-0.
      ast_pg: row.ast_pg,
      reb_pg: row.reb_pg,
      position: row.position,
      ppg_confirmed: true,
    };
    if (existing) Object.assign(existing, updated);
    else player.seasons.push(updated);
    changed = true;
  }

  if (changed) {
    // Drop it from failed_seasons too. That list is what unconfirmedSeasons
    // reads, and it does not shrink on its own -- so without this a repaired
    // season is re-queued every round, and the loop spends its remaining
    // rounds re-fetching work it already finished. API calls are exactly the
    // resource throttling punishes, so burning them twice matters.
    if (Array.isArray(current.data.failed_seasons)) {
      current.data.failed_seasons = current.data.failed_seasons.filter((s) => s !== season);
    }
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

// A live walk is a PARTIAL view, not a replacement. When stats.nba.com
// throttles, failed seasons drop out of the response silently, so a re-fetch
// can easily carry less than the cache it is about to replace -- that is how
// ATL went from a full 2020s to an empty one on a routine staleness refresh.
//
// Merging per season instead of overwriting means a fetch can only ever add:
// a confirmed season beats an unconfirmed one, and between two confirmed the
// fresher wins.
function mergeTeamData(previous, fresh) {
  if (!previous?.players?.length) return fresh;

  const byId = new Map();
  const absorb = (data, preferFresh) => {
    for (const p of data.players || []) {
      let e = byId.get(p.player_id);
      if (!e) byId.set(p.player_id, (e = { name: p.name, player_id: p.player_id, seasons: new Map() }));
      for (const s of p.seasons || []) {
        const have = e.seasons.get(s.season);
        const better =
          !have ||
          (s.ppg_confirmed && !have.ppg_confirmed) ||
          (s.ppg_confirmed && have.ppg_confirmed && preferFresh);
        if (better) e.seasons.set(s.season, s);
      }
    }
  };
  absorb(previous, false);
  absorb(fresh, true);

  const players = [...byId.values()].map((e) => ({
    name: e.name,
    player_id: e.player_id,
    seasons: [...e.seasons.values()].sort((a, b) => b.season.localeCompare(a.season)),
  }));

  // failed_seasons is only meaningful for seasons the merge still lacks.
  const covered = new Set(players.flatMap((p) => p.seasons.filter((s) => s.ppg_confirmed).map((s) => s.season)));
  const failed = (fresh.failed_seasons || []).filter((s) => !covered.has(s));

  return { ...fresh, failed_seasons: failed, data_complete: failed.length === 0, players };
}

function startLiveFetch(abbr, options) {
  const promise = fetchLive(abbr, options)
    .then(async (fetched) => {
      let data = fetched;
      const fetchedAt = Date.now();
      // Merge against what we already had rather than replacing it: a
      // throttled walk must never cost us seasons we have already confirmed.
      const previous = cache.get(abbr)?.data;
      data = mergeTeamData(previous, data);
      cache.set(abbr, { data: withHistoricalStats(abbr, data), fetchedAt });
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
//
// Case 3 is bounded. A full-history fetch runs for MINUTES, and a player
// staring at an empty picker has no way to tell that from a hang -- there was
// previously no ceiling short of FETCH_ABORT_MS (20 minutes), so a team that
// never resolved simply never rendered. Past FIRST_FETCH_WAIT_MS the caller
// gets a rejection it can turn into a visible "try a respin" message.
//
// The underlying fetch is deliberately NOT cancelled: it stays in `inFlight`,
// finishes on its own, and caches as usual -- so the team works on a later
// attempt instead of restarting from nothing every time.
const FIRST_FETCH_WAIT_MS = 25_000;

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
  // Swallow a late rejection on the losing side of the race: without this the
  // fetch's own failure becomes an unhandled rejection once we've timed out.
  livePromise.catch(() => {});

  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Still loading ${abbr} — this team hasn't been cached yet.`)),
      FIRST_FETCH_WAIT_MS,
    );
  });
  try {
    return await Promise.race([livePromise, deadline]);
  } finally {
    clearTimeout(timer);
  }
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
      // Fresh, but not necessarily whole. The repair loop used to run only
      // after a live fetch, so a team already cached with a truncated history
      // stayed truncated until its 7-day TTL expired -- and the next walk was
      // just as likely to be throttled. Repairing here costs one call per
      // missing season instead of re-walking 30+ of them, and it runs inside
      // this same sequential loop so the pacing is unchanged.
      const gaps = unconfirmedSeasons(cache.get(abbr).data);
      if (gaps.length === 0) {
        console.log(`[teamPlayersCache] preload: ${abbr} already fresh from disk cache, skipping API fetch`);
        continue;
      }
      console.log(`[teamPlayersCache] preload: ${abbr} fresh but missing ${gaps.length} season(s) -- repairing`);
      await scheduleUnavailableSeasonRetries(abbr).catch((err) =>
        console.warn(`[teamPlayersCache] ${abbr}: gap repair errored: ${err.message}`)
      );
      await wait(PRELOAD_TEAM_GAP_MS);
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
