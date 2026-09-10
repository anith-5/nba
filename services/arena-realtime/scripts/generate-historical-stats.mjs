/*
 * Build src/data/historical_player_stats.json — per-game stats for the seasons
 * stats.nba.com will not serve.
 *
 * WHY THIS EXISTS
 * ---------------
 * leaguedashplayerstats returns nothing before 1996-97, so team_players.py
 * marks every earlier season ppg_confirmed:false with null stats, and
 * buildSelectionListForDecade (which filters on ppg_confirmed) drops them.
 * The practical effect was that the entire 1980s wheel in 82-0 showed zero
 * players for all 30 franchises, and 1990-91..1995-96 were missing too.
 * The rosters were always there; only the three per-game numbers were not.
 *
 * SOURCE
 * ------
 * Basketball-Reference via sumitrodatta's dataset, which mirrors to
 * https://github.com/sumitrodatta/bball-reference-datasets (Data/Player Per
 * Game.csv). Positions there are already exactly PG/SG/SF/PF/C, and per-game
 * columns are pre-computed, so nothing is derived or rounded here.
 *
 * USAGE
 *   node scripts/generate-historical-stats.mjs <path-to-Player Per Game.csv>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "src", "data", "historical_player_stats.json");

// Only seasons NBA itself cannot confirm. 1996-97 onward comes from the live
// API, which is authoritative — this file must never shadow it.
const LAST_SEASON_END_YEAR = 1996; // exclusive: keeps 1995-96 and earlier

// Basketball-Reference uses period-correct codes; the cache is keyed by the
// modern franchise abbreviation NBA reports today. Only relocations/renames
// need listing — anything absent already matches.
//
// CHH -> CHA follows NBA's own lineage: when the Bobcats renamed to Hornets in
// 2014 they reclaimed the 1988-2002 Charlotte history, and the New Orleans
// franchise (NOH/NOK) became the Pelicans.
const BR_TO_NBA = {
  KCK: "SAC", KCO: "SAC", CIN: "SAC", ROC: "SAC",
  NJN: "BKN", NYN: "BKN", NJA: "BKN",
  SDC: "LAC", BUF: "LAC",
  SEA: "OKC",
  WSB: "WAS", CAP: "WAS", BAL: "WAS", CHZ: "WAS", CHP: "WAS",
  CHH: "CHA", CHO: "CHA",
  PHO: "PHX",
  VAN: "MEM",
  NOH: "NOP", NOK: "NOP",
  SDR: "HOU",
  SFW: "GSW", PHW: "GSW",
  SYR: "PHI",
  FTW: "DET",
  MNL: "LAL",
  STL: "ATL", MLH: "ATL", TRI: "ATL",
  NOJ: "UTA",
  AND: "AND", CHS: "CHS", DNN: "DNN", INO: "INO", SHE: "SHE",
  WAT: "WAT", STB: "STB", BLB: "BLB", CLR: "CLR", DTF: "DTF",
  INJ: "INJ", PIT: "PIT", PRO: "PRO", TOR: "TOR", WSC: "WSC",
};

// Matches the normaliser in teamPlayersCache.js. Accents are stripped, case and
// punctuation dropped, and a generational suffix removed, so "Pétur
// Guðmundsson" and "Gary Payton II" line up with NBA's spelling of the name.
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

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i]; });
    return row;
  });
}

const csvPath = process.argv[2];
if (!csvPath) {
  console.error("usage: node scripts/generate-historical-stats.mjs <Player Per Game.csv>");
  process.exit(1);
}

const rows = parseCsv(fs.readFileSync(csvPath, "utf-8"));
const out = {};
let kept = 0, skippedMultiTeam = 0;

for (const r of rows) {
  if (r.lg !== "NBA") continue;
  const endYear = Number(r.season);
  if (!endYear || endYear >= LAST_SEASON_END_YEAR) continue;
  // 2TM/3TM/4TM are whole-season aggregates for a traded player; the per-team
  // rows alongside them carry the same games split by franchise, which is what
  // a team-and-decade wheel needs.
  if (/^\d+TM$/.test(r.team)) { skippedMultiTeam++; continue; }

  const team = BR_TO_NBA[r.team] || r.team;
  const season = `${endYear - 1}-${String(endYear).slice(2)}`;
  const key = normName(r.player);
  if (!key) continue;

  const ppg = Number(r.pts_per_game), apg = Number(r.ast_per_game), rpg = Number(r.trb_per_game);
  if (!Number.isFinite(ppg) || !Number.isFinite(apg) || !Number.isFinite(rpg)) continue;

  // name and player_id are kept, not just the stats: a franchise whose roster
  // walk never covered an era (BKN's cache starts at 1996, LAC's at 2003) has
  // no row to attach numbers to, so the overlay has to be able to build the
  // player entry outright. `br:` namespaces the id so it can't collide with an
  // NBA one.
  ((out[team] ||= {})[season] ||= {})[key] = {
    name: r.player,
    player_id: `br:${r.player_id}`,
    ppg, ast_pg: apg, reb_pg: rpg, position: r.pos,
  };
  kept++;
}

fs.writeFileSync(OUT, JSON.stringify(out));
const teams = Object.keys(out).length;
const seasons = Object.values(out).reduce((n, t) => n + Object.keys(t).length, 0);
console.log(`wrote ${path.relative(process.cwd(), OUT)}`);
console.log(`  ${kept} player-seasons across ${teams} franchises, ${seasons} team-seasons`);
console.log(`  skipped ${skippedMultiTeam} multi-team aggregate rows`);
console.log(`  size: ${(fs.statSync(OUT).size / 1024 / 1024).toFixed(2)} MB`);
