// Keeps Wordle's player pool current without hardcoding any roster data.
// On startup (and every 24h after) this pulls live rosters from the FastAPI
// backend's /api/arena/current-players endpoint (services/api/app/routers/rosters.py,
// which itself calls nba_api directly — nothing about who's on which team
// lives in this repo). The result is cached in memory here and written to
// apps/web/src/data/current_nba_players.json so the frontend has something
// to read even when this Node server isn't running.
//
// Fallback chain if the live pull fails (FastAPI down, nba_api timeout, etc):
//   1. Keep serving whatever is already cached on disk — don't clobber good
//      data with a failed sync -- UNLESS that cached data is stamped with a
//      season that no longer matches the real current season (see
//      isCacheForCurrentSeason below), in which case a season rollover has
//      made it wrong by definition, not just old, so it's treated as if no
//      cache existed at all rather than served.
//   2. If there's no cached file at all yet (or it just got invalidated by
//      the season check above), write a small best-effort dataset so the
//      game still works, clearly marked source: "fallback" with a note to
//      run /api/arena/sync-rosters for live data.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCurrentNbaSeason } from "../utils/currentSeason.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FASTAPI_BASE_URL = process.env.HOOPIQ_API_URL || "http://localhost:8001";
const CURRENT_PLAYERS_ENDPOINT = `${FASTAPI_BASE_URL}/api/arena/current-players`;
const FETCH_TIMEOUT_MS = 90_000; // 30 sequential team-roster calls server-side
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

const CACHE_FILE = path.resolve(__dirname, "../../../../apps/web/src/data/current_nba_players.json");

let cachedRosterData = null;

// A season rollover makes last season's roster data wrong, not merely old --
// so this is checked instead of (not in addition to) any age-based TTL.
function isCacheForCurrentSeason(entry) {
  return !!entry && entry.season === getCurrentNbaSeason();
}

async function fetchFromApi() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(CURRENT_PLAYERS_ENDPOINT, { signal: controller.signal });
    if (!res.ok) throw new Error(`FastAPI returned ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

function loadCachedFile() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch {
    return null;
  }
}

function writeCacheFile(data) {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2) + "\n");
}

// Minimal emergency dataset used only when there is no cached file AND the
// live FastAPI/nba_api pull fails on the very first sync attempt. Not meant
// to be exhaustive — just enough that the game is playable until a real sync
// succeeds. Real syncs (the normal path) replace this immediately.
function generateFallbackData() {
  const players = [
    { name: "Shai Gilgeous-Alexander", player_id: 1628983, team_full_name: "Oklahoma City Thunder", team_abbreviation: "OKC", conference: "West", division: "Northwest", position: "PG", height_feet: 6, height_inches: 6, height_total_inches: 78, weight: 195, jersey_number: 2, age: 27, years_in_league: 7, country: "Canada", era_label: "Analytics Era", style_tag: "Two Way Star", recognition_tier: "Star", pts_pg: 30.1, ast_pg: 6.2, reb_pg: 5.5, stl_pg: 2.0, blk_pg: 0.9, auction_tier: "Elite" },
    { name: "Nikola Jokic", player_id: 203999, team_full_name: "Denver Nuggets", team_abbreviation: "DEN", conference: "West", division: "Northwest", position: "C", height_feet: 6, height_inches: 11, height_total_inches: 83, weight: 284, jersey_number: 15, age: 31, years_in_league: 10, country: "Serbia", era_label: "Analytics Era", style_tag: "Playmaking Big", recognition_tier: "Star", pts_pg: 29.6, ast_pg: 10.2, reb_pg: 12.9, stl_pg: 1.7, blk_pg: 0.8, auction_tier: "Elite" },
    { name: "LeBron James", player_id: 2544, team_full_name: "Los Angeles Lakers", team_abbreviation: "LAL", conference: "West", division: "Pacific", position: "SF", height_feet: 6, height_inches: 9, height_total_inches: 81, weight: 250, jersey_number: 23, age: 41, years_in_league: 22, country: "USA", era_label: "Analytics Era", style_tag: "Two Way Star", recognition_tier: "Star", pts_pg: 24.4, ast_pg: 8.1, reb_pg: 7.5, stl_pg: 1.1, blk_pg: 0.5, auction_tier: "Elite" },
    { name: "Victor Wembanyama", player_id: 1641705, team_full_name: "San Antonio Spurs", team_abbreviation: "SAS", conference: "West", division: "Southwest", position: "C", height_feet: 7, height_inches: 4, height_total_inches: 88, weight: 235, jersey_number: 1, age: 22, years_in_league: 2, country: "France", era_label: "Modern Era", style_tag: "Two Way Star", recognition_tier: "Star", pts_pg: 24.3, ast_pg: 3.7, reb_pg: 11.0, stl_pg: 1.1, blk_pg: 3.8, auction_tier: "Elite" },
    { name: "Jayson Tatum", player_id: 1628369, team_full_name: "Boston Celtics", team_abbreviation: "BOS", conference: "East", division: "Atlantic", position: "SF", height_feet: 6, height_inches: 8, height_total_inches: 80, weight: 210, jersey_number: 0, age: 28, years_in_league: 8, country: "USA", era_label: "Analytics Era", style_tag: "Wing Scorer", recognition_tier: "Star", pts_pg: 26.9, ast_pg: 4.9, reb_pg: 8.1, stl_pg: 1.0, blk_pg: 0.6, auction_tier: "Star" },
  ];
  return {
    generated_at: new Date().toISOString(),
    source: "fallback",
    season: getCurrentNbaSeason(),
    count: players.length,
    note: "This is a minimal best-effort placeholder, not a full roster sync. Call POST /api/arena/sync-rosters (or restart the arena-realtime server with services/api running) to pull live rosters.",
    players,
  };
}

export async function syncRosters() {
  try {
    const data = await fetchFromApi();
    cachedRosterData = data;
    writeCacheFile(data);
    console.log(`[rosterSync] synced ${data.count} players live from nba_api at ${data.generated_at} (season ${data.season})`);
    return data;
  } catch (err) {
    console.warn(`[rosterSync] live sync failed (${err.message}), falling back to cached data`);
    const cached = loadCachedFile();
    if (isCacheForCurrentSeason(cached)) {
      cachedRosterData = cached;
      return cached;
    }
    if (cached) {
      console.warn(
        `[rosterSync] cached data on disk is for season ${cached.season}, but the current season is ${getCurrentNbaSeason()} -- ` +
          "a season rollover means it's wrong by definition, not just old, so it can't be used even as a fallback"
      );
    }
    const fallback = generateFallbackData();
    cachedRosterData = fallback;
    writeCacheFile(fallback);
    console.warn("[rosterSync] no valid same-season cached file existed — wrote minimal fallback dataset");
    return fallback;
  }
}

export function getCachedRosterData() {
  return cachedRosterData;
}

export function startRosterSync() {
  // Don't block server startup on a ~15-20s roster pull — sync in the
  // background and let whatever was already on disk serve requests until it
  // completes. But only trust that disk cache if it's stamped with the
  // actual current season -- a stale-season cache is treated as if it
  // didn't exist at all (never served, not even briefly) rather than
  // handed out while the live resync races in the background below.
  const cached = loadCachedFile();
  if (isCacheForCurrentSeason(cached)) {
    cachedRosterData = cached;
  } else if (cached) {
    console.warn(
      `[rosterSync] startup: cached data on disk is for season ${cached.season}, but the current season is ${getCurrentNbaSeason()} -- ` +
        "ignoring it and waiting on a fresh pull instead of serving stale-season data"
    );
  }
  syncRosters();
  setInterval(syncRosters, SYNC_INTERVAL_MS);
}
