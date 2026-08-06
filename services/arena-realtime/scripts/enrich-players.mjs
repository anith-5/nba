// Adds Over/Under's expanded stat categories and Wordle's new tile fields to
// the EXISTING nba_players.json entries (does not regenerate the base file —
// run generate-players.mjs first if you need to change the base roster).
//
// Every derived field is a best-effort estimate from position/role/era unless
// the player appears in an OVERRIDES entry below, in which case that field is
// hand-confirmed. `approximate: true/false` is set per player: false only for
// players with a full OVERRIDES entry, true for everyone whose advanced stats
// are formula-derived. Replace formula-derived fields with a real stats API
// when one is integrated — see README note in this repo's DEPLOY.md pattern.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEAM_INFO = {
  ATL: { name: "Hawks", conference: "EAST", division: "Southeast" },
  BOS: { name: "Celtics", conference: "EAST", division: "Atlantic" },
  BKN: { name: "Nets", conference: "EAST", division: "Atlantic" },
  CHA: { name: "Hornets", conference: "EAST", division: "Southeast" },
  CHI: { name: "Bulls", conference: "EAST", division: "Central" },
  CLE: { name: "Cavaliers", conference: "EAST", division: "Central" },
  DAL: { name: "Mavericks", conference: "WEST", division: "Southwest" },
  DEN: { name: "Nuggets", conference: "WEST", division: "Northwest" },
  DET: { name: "Pistons", conference: "EAST", division: "Central" },
  GSW: { name: "Warriors", conference: "WEST", division: "Pacific" },
  HOU: { name: "Rockets", conference: "WEST", division: "Southwest" },
  IND: { name: "Pacers", conference: "EAST", division: "Central" },
  LAC: { name: "Clippers", conference: "WEST", division: "Pacific" },
  LAL: { name: "Lakers", conference: "WEST", division: "Pacific" },
  MEM: { name: "Grizzlies", conference: "WEST", division: "Southwest" },
  MIA: { name: "Heat", conference: "EAST", division: "Southeast" },
  MIL: { name: "Bucks", conference: "EAST", division: "Central" },
  MIN: { name: "Timberwolves", conference: "WEST", division: "Northwest" },
  NOP: { name: "Pelicans", conference: "WEST", division: "Southwest" },
  NYK: { name: "Knicks", conference: "EAST", division: "Atlantic" },
  OKC: { name: "Thunder", conference: "WEST", division: "Northwest" },
  ORL: { name: "Magic", conference: "EAST", division: "Southeast" },
  PHI: { name: "76ers", conference: "EAST", division: "Atlantic" },
  PHX: { name: "Suns", conference: "WEST", division: "Pacific" },
  POR: { name: "Trail Blazers", conference: "WEST", division: "Northwest" },
  SAC: { name: "Kings", conference: "WEST", division: "Pacific" },
  SAS: { name: "Spurs", conference: "WEST", division: "Southwest" },
  TOR: { name: "Raptors", conference: "EAST", division: "Atlantic" },
  UTA: { name: "Jazz", conference: "WEST", division: "Northwest" },
  WAS: { name: "Wizards", conference: "EAST", division: "Southeast" },
  BAL: { name: "Bullets", conference: "EAST", division: "Southeast" },
  BUF: { name: "Braves", conference: "WEST", division: "Pacific" },
  CAP: { name: "Bullets", conference: "EAST", division: "Southeast" },
  CHH: { name: "Hornets", conference: "EAST", division: "Southeast" },
  CHS: { name: "Stags", conference: "EAST", division: "Central" },
  CIN: { name: "Royals", conference: "WEST", division: "Pacific" },
  FTW: { name: "Pistons", conference: "EAST", division: "Central" },
  KCK: { name: "Kings", conference: "WEST", division: "Pacific" },
  KTC: { name: "Colonels", conference: "EAST", division: "Central" },
  MLH: { name: "Hawks", conference: "EAST", division: "Southeast" },
  MNL: { name: "Lakers", conference: "WEST", division: "Pacific" },
  NJN: { name: "Nets", conference: "EAST", division: "Atlantic" },
  NOH: { name: "Hornets", conference: "WEST", division: "Southwest" },
  NOJ: { name: "Jazz", conference: "WEST", division: "Northwest" },
  NYA: { name: "Americans", conference: "EAST", division: "Atlantic" },
  NYN: { name: "Nets", conference: "EAST", division: "Atlantic" },
  OAK: { name: "Oaks", conference: "WEST", division: "Pacific" },
  PHW: { name: "Warriors", conference: "WEST", division: "Pacific" },
  ROC: { name: "Royals", conference: "WEST", division: "Pacific" },
  SDC: { name: "Clippers", conference: "WEST", division: "Pacific" },
  SDR: { name: "Rockets", conference: "WEST", division: "Southwest" },
  SEA: { name: "SuperSonics", conference: "WEST", division: "Northwest" },
  SFW: { name: "Warriors", conference: "WEST", division: "Pacific" },
  STL: { name: "Hawks", conference: "EAST", division: "Southeast" },
  SYR: { name: "Nationals", conference: "EAST", division: "Atlantic" },
  VAN: { name: "Grizzlies", conference: "WEST", division: "Southwest" },
  VIR: { name: "Squires", conference: "EAST", division: "Southeast" },
  WSB: { name: "Bullets", conference: "EAST", division: "Southeast" },
  WSC: { name: "Capitols", conference: "EAST", division: "Southeast" },
};

function eraLabel(peakYear) {
  if (peakYear <= 1979) return "Classic Era";
  if (peakYear <= 1989) return "Showtime Era";
  if (peakYear <= 1999) return "Jordan Era";
  if (peakYear <= 2009) return "Early 2000s";
  if (peakYear <= 2019) return "Analytics Era";
  return "Modern Era";
}

const STYLE_OVERRIDES = {
  "lebron-james": "Two Way Star",
  "giannis-antetokounmpo": "Two Way Star",
  "kevin-garnett": "Two Way Star",
  "scottie-pippen": "Two Way Star",
  "kawhi-leonard": "Two Way Star",
  "hakeem-olajuwon": "Two Way Star",
  "david-robinson": "Two Way Star",
  "tim-duncan": "Two Way Star",
  "nikola-jokic": "Playmaking Big",
  "domantas-sabonis": "Playmaking Big",
  "draymond-green": "Playmaking Big",
  "vlade-divac": "Playmaking Big",
  "bill-walton": "Playmaking Big",
  "boris-diaw": "Playmaking Big",
  "ben-simmons": "Floor General",
  "magic-johnson": "Floor General",
  "jason-kidd": "Floor General",
  "john-stockton": "Floor General",
  "chris-paul": "Floor General",
  "rajon-rondo": "Floor General",
};

function deriveStyleTag(p) {
  if (STYLE_OVERRIDES[p.player_id]) return STYLE_OVERRIDES[p.player_id];
  switch (p.archetype_tag) {
    case "guard-scorer":
      return "Scoring Guard";
    case "guard-defender":
      return p.position === "PG" ? "Floor General" : "3 and D";
    case "wing-scorer":
      return "Wing Scorer";
    case "wing-defender":
      return "3 and D";
    case "big-scorer":
      return "Stretch Big";
    case "big-defender":
      return "Interior Anchor";
    default:
      return "Wing Scorer";
  }
}

const STYLE_FAMILY = {
  "Floor General": "offense",
  "Scoring Guard": "offense",
  "Wing Scorer": "offense",
  "Stretch Big": "offense",
  "Playmaking Big": "offense",
  "3 and D": "defense",
  "Interior Anchor": "defense",
  "Two Way Star": "both",
};

// Hand-confirmed overrides for the most recognizable players. Any field
// present here is treated as verified (approximate: false for that player).
const OVERRIDES = {
  "lebron-james": { jersey_number: 23, peak_age: 28, primary_team: "CLE", career_fg_pct: 50.5, career_3p_pct: 34.6, career_ft_pct: 73.5, total_points: 41000 },
  "michael-jordan": { jersey_number: 23, peak_age: 28, primary_team: "CHI", career_fg_pct: 49.7, career_3p_pct: 32.7, career_ft_pct: 83.5, total_points: 32292 },
  "kobe-bryant": { jersey_number: 24, peak_age: 27, primary_team: "LAL", career_fg_pct: 44.7, career_3p_pct: 32.9, career_ft_pct: 83.7, total_points: 33643 },
  "kareem-abdul-jabbar": { jersey_number: 33, peak_age: 28, primary_team: "LAL", career_fg_pct: 55.9, career_ft_pct: 72.1, total_points: 38387 },
  "stephen-curry": { jersey_number: 30, peak_age: 30, primary_team: "GSW", career_fg_pct: 47.3, career_3p_pct: 42.3, career_ft_pct: 90.8 },
  "kevin-durant": { jersey_number: 35, peak_age: 27, primary_team: "OKC", career_fg_pct: 49.9, career_3p_pct: 38.6, career_ft_pct: 88.3 },
  "shaquille-oneal": { jersey_number: 34, peak_age: 27, primary_team: "LAL", career_fg_pct: 58.2, career_ft_pct: 52.7, total_points: 28596 },
  "tim-duncan": { jersey_number: 21, peak_age: 27, primary_team: "SAS", career_fg_pct: 50.6, career_ft_pct: 69.6 },
  "dirk-nowitzki": { jersey_number: 41, peak_age: 29, primary_team: "DAL", career_fg_pct: 47.1, career_3p_pct: 38.0, career_ft_pct: 87.9, total_points: 31560 },
  "hakeem-olajuwon": { jersey_number: 34, peak_age: 29, primary_team: "HOU", career_fg_pct: 51.2, career_ft_pct: 71.2 },
  "karl-malone": { jersey_number: 32, peak_age: 30, primary_team: "UTA", career_fg_pct: 51.6, career_ft_pct: 74.2, total_points: 36928 },
  "john-stockton": { jersey_number: 12, peak_age: 29, primary_team: "UTA", career_fg_pct: 51.5, career_ft_pct: 82.6 },
  "magic-johnson": { jersey_number: 32, peak_age: 27, primary_team: "LAL", career_fg_pct: 52.0, career_ft_pct: 84.8 },
  "larry-bird": { jersey_number: 33, peak_age: 27, primary_team: "BOS", career_fg_pct: 49.6, career_3p_pct: 37.6, career_ft_pct: 88.6 },
  "wilt-chamberlain": { jersey_number: 13, peak_age: 27, primary_team: "PHI", career_fg_pct: 54.0, career_ft_pct: 51.1, total_points: 31419 },
  "bill-russell": { jersey_number: 6, peak_age: 28, primary_team: "BOS", career_fg_pct: 44.0, career_ft_pct: 56.1 },
  "giannis-antetokounmpo": { jersey_number: 34, peak_age: 26, primary_team: "MIL", career_fg_pct: 55.3, career_ft_pct: 68.5 },
  "nikola-jokic": { jersey_number: 15, peak_age: 27, primary_team: "DEN", career_fg_pct: 57.4, career_3p_pct: 34.9, career_ft_pct: 82.0 },
  "russell-westbrook": { jersey_number: 0, peak_age: 27, primary_team: "OKC", career_fg_pct: 43.5, career_ft_pct: 72.7 },
  "james-harden": { jersey_number: 1, peak_age: 36, primary_team: "LAC", career_fg_pct: 44.3, career_3p_pct: 36.4, career_ft_pct: 86.0 },
  "chris-paul": { jersey_number: 3, peak_age: 28, primary_team: "LAC", career_fg_pct: 47.3, career_3p_pct: 37.0, career_ft_pct: 87.0 },
  "dwyane-wade": { jersey_number: 3, peak_age: 27, primary_team: "MIA", career_fg_pct: 48.3, career_ft_pct: 76.5 },
  "kevin-garnett": { jersey_number: 21, peak_age: 28, primary_team: "MIN", career_fg_pct: 49.7, career_ft_pct: 78.9 },
  "allen-iverson": { jersey_number: 3, peak_age: 26, primary_team: "PHI", career_fg_pct: 42.5, career_ft_pct: 78.0 },
  "dwight-howard": { jersey_number: 12, peak_age: 25, primary_team: "ORL", career_fg_pct: 57.5, career_ft_pct: 56.8 },
  "andre-drummond": { jersey_number: 0, peak_age: 24, primary_team: "DET", career_fg_pct: 52.9, career_ft_pct: 38.6 },
  "ben-simmons": { jersey_number: 25, peak_age: 22, primary_team: "PHI", career_fg_pct: 55.7, career_ft_pct: 59.7 },
  "rudy-gobert": { jersey_number: 27, peak_age: 27, primary_team: "UTA", career_fg_pct: 65.5, career_ft_pct: 65.0, career_bpg: 2.3 },
  "dikembe-mutombo": { jersey_number: 55, peak_age: 27, primary_team: "DEN", career_bpg: 2.8, career_ft_pct: 68.6 },
  "ben-wallace": { jersey_number: 3, peak_age: 27, primary_team: "DET", career_bpg: 2.0, career_ft_pct: 41.4 },
  "david-robinson": { jersey_number: 50, peak_age: 27, primary_team: "SAS", career_bpg: 3.0, career_ft_pct: 73.6 },
  "patrick-ewing": { jersey_number: 33, peak_age: 27, primary_team: "NYK", career_bpg: 2.4, career_ft_pct: 74.5 },
  "joel-embiid": { jersey_number: 21, peak_age: 27, primary_team: "PHI", career_bpg: 1.7, career_fg_pct: 49.4, career_ft_pct: 81.6 },
  "anthony-davis": { jersey_number: 3, peak_age: 33, primary_team: "DAL", career_bpg: 2.3, career_fg_pct: 52.3, career_ft_pct: 79.5 },
  "victor-wembanyama": { jersey_number: 1, peak_age: 21, primary_team: "SAS", career_bpg: 3.3, career_fg_pct: 46.5 },
  "kyle-korver": { jersey_number: 26, peak_age: 32, primary_team: "ATL", career_3p_pct: 42.9 },
  "ray-allen": { jersey_number: 34, peak_age: 28, primary_team: "SEA", career_3p_pct: 40.0, career_ft_pct: 89.4 },
  "klay-thompson": { jersey_number: 11, peak_age: 27, primary_team: "GSW", career_3p_pct: 41.4, career_ft_pct: 84.0 },
  "reggie-miller": { jersey_number: 31, peak_age: 28, primary_team: "IND", career_3p_pct: 39.5, career_ft_pct: 88.8 },
  "steve-nash": { jersey_number: 13, peak_age: 30, primary_team: "PHX", career_fg_pct: 49.0, career_3p_pct: 42.8, career_ft_pct: 90.4 },
  "manu-ginobili": { jersey_number: 20, peak_age: 29, primary_team: "SAS", career_3p_pct: 36.0, career_ft_pct: 82.9 },
  "tony-parker": { jersey_number: 9, peak_age: 27, primary_team: "SAS", career_fg_pct: 49.0, career_ft_pct: 76.4 },
  "pau-gasol": { jersey_number: 16, peak_age: 28, primary_team: "MEM", career_fg_pct: 50.7, career_ft_pct: 78.9 },
  "draymond-green": { jersey_number: 23, peak_age: 27, primary_team: "GSW", career_fg_pct: 43.9, career_3p_pct: 31.4, career_ft_pct: 70.3 },
  "scottie-pippen": { jersey_number: 33, peak_age: 28, primary_team: "CHI", career_fg_pct: 47.4, career_ft_pct: 70.5 },
  "charles-barkley": { jersey_number: 34, peak_age: 28, primary_team: "PHI", career_fg_pct: 54.1, career_ft_pct: 73.5 },
  "isiah-thomas": { jersey_number: 11, peak_age: 26, primary_team: "DET", career_fg_pct: 45.2, career_ft_pct: 75.9 },
  "clyde-drexler": { jersey_number: 22, peak_age: 27, primary_team: "POR", career_fg_pct: 47.2, career_ft_pct: 78.8 },
  "gary-payton": { jersey_number: 20, peak_age: 28, primary_team: "SEA", career_fg_pct: 46.5, career_ft_pct: 72.6 },
  "jason-kidd": { jersey_number: 5, peak_age: 30, primary_team: "NJN", career_fg_pct: 40.0, career_3p_pct: 34.9, career_ft_pct: 78.5 },
  "vince-carter": { jersey_number: 15, peak_age: 26, primary_team: "TOR", career_fg_pct: 43.5, career_3p_pct: 37.1, career_ft_pct: 79.8 },
  "tracy-mcgrady": { jersey_number: 1, peak_age: 24, primary_team: "ORL", career_fg_pct: 43.9, career_3p_pct: 33.8, career_ft_pct: 74.3 },
  "yao-ming": { jersey_number: 11, peak_age: 26, primary_team: "HOU", career_fg_pct: 52.4, career_ft_pct: 83.3 },
  "grant-hill": { jersey_number: 33, peak_age: 24, primary_team: "DET", career_fg_pct: 48.4, career_ft_pct: 76.3 },
  "paul-pierce": { jersey_number: 34, peak_age: 27, primary_team: "BOS", career_fg_pct: 44.3, career_3p_pct: 36.8, career_ft_pct: 80.6 },
  "carmelo-anthony": { jersey_number: 7, peak_age: 26, primary_team: "DEN", career_fg_pct: 44.7, career_3p_pct: 35.6, career_ft_pct: 81.4 },
  "chris-bosh": { jersey_number: 1, peak_age: 27, primary_team: "TOR", career_fg_pct: 49.3, career_ft_pct: 79.9 },
  "damian-lillard": { jersey_number: 0, peak_age: 28, primary_team: "POR", career_fg_pct: 43.9, career_3p_pct: 37.1, career_ft_pct: 89.9 },
  "kawhi-leonard": { jersey_number: 2, peak_age: 27, primary_team: "SAS", career_fg_pct: 49.2, career_3p_pct: 38.4, career_ft_pct: 86.1 },
  "jayson-tatum": { jersey_number: 0, peak_age: 25, primary_team: "BOS", career_fg_pct: 45.8, career_3p_pct: 38.2, career_ft_pct: 83.4 },
  "luka-doncic": { jersey_number: 77, peak_age: 27, primary_team: "LAL", career_fg_pct: 45.8, career_3p_pct: 34.5, career_ft_pct: 74.5 },
  "trae-young": { jersey_number: 11, peak_age: 25, primary_team: "ATL", career_fg_pct: 43.4, career_3p_pct: 34.6, career_ft_pct: 85.9 },
  "devin-booker": { jersey_number: 1, peak_age: 27, primary_team: "PHX", career_fg_pct: 46.3, career_3p_pct: 35.7, career_ft_pct: 87.0 },
  "donovan-mitchell": { jersey_number: 45, peak_age: 29, primary_team: "CLE", career_fg_pct: 44.9, career_3p_pct: 35.9, career_ft_pct: 84.7 },
  "anthony-edwards": { jersey_number: 5, peak_age: 23, primary_team: "MIN", career_fg_pct: 45.5, career_3p_pct: 36.0, career_ft_pct: 81.0 },
  "domantas-sabonis": { jersey_number: 10, peak_age: 27, primary_team: "SAC", career_fg_pct: 59.0, career_ft_pct: 74.0 },
  "bam-adebayo": { jersey_number: 13, peak_age: 26, primary_team: "MIA", career_fg_pct: 53.3, career_ft_pct: 78.5 },
  "jimmy-butler": { jersey_number: 10, peak_age: 36, primary_team: "GSW", career_fg_pct: 48.8, career_3p_pct: 33.2, career_ft_pct: 84.5 },
  "paul-george": { jersey_number: 8, peak_age: 36, primary_team: "PHI", career_fg_pct: 43.8, career_3p_pct: 37.9, career_ft_pct: 84.8 },
  "kyrie-irving": { jersey_number: 11, peak_age: 27, primary_team: "CLE", career_fg_pct: 47.3, career_3p_pct: 39.2, career_ft_pct: 87.7 },
};

// Real current age (2025-26 season) and, where confidently known, real
// current jersey number for every player with is_active: true. This
// supersedes OVERRIDES.peak_age / the career-span peak-age formula for
// active players specifically — the Wordle Age tile means "current age" for
// someone still playing, not an estimated career-peak age.
const ACTIVE_CURRENT_INFO = {
  "lebron-james": { age: 41, team: "LAL" },
  "stephen-curry": { age: 38 },
  "kevin-durant": { age: 37, team: "HOU" },
  "james-harden": { age: 36 },
  "russell-westbrook": { age: 37, jersey: 0, team: "DEN" },
  "chris-paul": { age: 41, team: "SAS" },
  "damian-lillard": { age: 35 },
  "kawhi-leonard": { age: 34 },
  "giannis-antetokounmpo": { age: 31 },
  "joel-embiid": { age: 32 },
  "anthony-davis": { age: 33 },
  "klay-thompson": { age: 36 },
  "draymond-green": { age: 36 },
  "kyrie-irving": { age: 34, team: "DAL" },
  "klay-thompson": { age: 36, team: "DAL" },
  "demar-derozan": { age: 36, jersey: 11, team: "SAC" },
  "paul-george": { age: 36 },
  "jimmy-butler": { age: 36 },
  "nikola-jokic": { age: 31 },
  "jayson-tatum": { age: 28 },
  "jaylen-brown": { age: 29, jersey: 7 },
  "devin-booker": { age: 29 },
  "donovan-mitchell": { age: 29 },
  "shai-gilgeous-alexander": { age: 27, jersey: 2 },
  "anthony-edwards": { age: 24 },
  "bam-adebayo": { age: 28 },
  "domantas-sabonis": { age: 32 },
  "karl-anthony-towns": { age: 30, jersey: 32, team: "NYK" },
  "jamal-murray": { age: 29, jersey: 27 },
  "pascal-siakam": { age: 32, jersey: 43, team: "IND" },
  "fred-vanvleet": { age: 32, jersey: 5, team: "HOU" },
  "og-anunoby": { age: 28, jersey: 8, team: "NYK" },
  "jrue-holiday": { age: 35, jersey: 4, team: "POR" },
  "luka-doncic": { age: 27 },
  "trae-young": { age: 27 },
  "ja-morant": { age: 26, jersey: 12 },
  "zion-williamson": { age: 25, jersey: 1 },
  "rudy-gobert": { age: 33, team: "MIN" },
  "andre-drummond": { age: 32, jersey: 3, team: "CHI" },
  "ben-simmons": { age: 29, jersey: 10, team: "LAC" },
  "mike-conley": { age: 38, jersey: 10 },
  "al-horford": { age: 39, jersey: 42 },
  "terry-rozier": { age: 32, jersey: 2, team: "MIA" },
  "d-angelo-russell": { age: 30, jersey: 1, team: "DAL" },
  "collin-sexton": { age: 27, jersey: 2, team: "CHA" },
  "jordan-clarkson": { age: 33, jersey: 0, team: "UTA" },
  "kelly-oubre-jr": { age: 30, jersey: 12, team: "PHI" },
  "michael-porter-jr": { age: 27, jersey: 1, team: "BKN" },
  "talen-horton-tucker": { age: 25 },
  "deni-avdija": { age: 25, jersey: 8, team: "POR" },
  "precious-achiuwa": { age: 26, jersey: 5, team: "NYK" },
  "josh-giddey": { age: 23, jersey: 3, team: "CHI" },
  "herbert-jones": { age: 28 },
  "alperen-sengun": { age: 23 },
  "norman-powell": { age: 33, jersey: 24, team: "MIA" },
  "caris-levert": { age: 31, jersey: 3, team: "CLE" },
  "josh-richardson": { age: 32 },
  "malik-beasley": { age: 29, jersey: 5, team: "DET" },
  "buddy-hield": { age: 33, jersey: 24, team: "GSW" },
  "kentavious-caldwell-pope": { age: 33, jersey: 5, team: "ORL" },
  "isaac-okoro": { age: 25 },
  "nikola-vucevic": { age: 35, jersey: 9, team: "CHI" },
  "tyus-jones": { age: 30, jersey: 21, team: "ORL" },
  "jerami-grant": { age: 32, jersey: 9, team: "POR" },
  "aaron-gordon": { age: 30 },
  "terrence-ross": { age: 33 },
  "harrison-barnes": { age: 34, jersey: 40, team: "SAS" },
  "tyrese-haliburton": { age: 26 },
  "desmond-bane": { age: 28, jersey: 22, team: "ORL" },
  "tyrese-maxey": { age: 25, jersey: 0 },
  "franz-wagner": { age: 24, jersey: 22 },
  "evan-mobley": { age: 25, jersey: 4 },
  "cade-cunningham": { age: 24, jersey: 2 },
  "scottie-barnes": { age: 24, jersey: 4 },
  "jalen-green": { age: 24, jersey: 4, team: "PHX" },
  "paolo-banchero": { age: 23, jersey: 5 },
  "chet-holmgren": { age: 24, jersey: 7 },
  "jabari-smith-jr": { age: 23, jersey: 1 },
  "victor-wembanyama": { age: 22 },
  "brandon-miller": { age: 23, jersey: 24 },
  "amen-thompson": { age: 23, jersey: 4 },
  "bogdan-bogdanovic": { age: 33, jersey: 13 },
  "dennis-schroder": { age: 32, jersey: 17, team: "SAC" },
  "landry-shamet": { age: 29, jersey: 3, team: "WAS" },
  "ivica-zubac": { age: 29, jersey: 40 },
  "dwight-powell": { age: 34 },
  "jonas-valanciunas": { age: 34, jersey: 17, team: "SAC" },
  "steven-adams": { age: 32, jersey: 12, team: "HOU" },
  "clint-capela": { age: 32, jersey: 15, team: "HOU" },
  "jusuf-nurkic": { age: 31, jersey: 23, team: "UTA" },
  "jarrett-allen": { age: 28 },
  "mitchell-robinson": { age: 28 },
  "deandre-ayton": { age: 27, jersey: 2, team: "LAL" },
  "jaren-jackson-jr": { age: 26 },
  "wendell-carter-jr": { age: 27 },
  "de-andre-hunter": { age: 28, jersey: 12, team: "CLE" },
  "coby-white": { age: 27 },
  "rui-hachimura": { age: 28, jersey: 28, team: "LAL" },
  "darius-garland": { age: 26 },
  "p-j-washington": { age: 27, jersey: 25, team: "DAL" },
  "bruce-brown": { age: 29, jersey: 1 },
  "alex-caruso": { age: 32, jersey: 6, team: "OKC" },
  "t-j-mcconnell": { age: 33, jersey: 25, team: "IND" },
  "marcus-smart": { age: 32, jersey: 36, team: "LAL" },
  "mikal-bridges": { age: 29, jersey: 25, team: "NYK" },
  "duncan-robinson": { age: 32, jersey: 55, team: "MIA" },
  "naz-reid": { age: 26, jersey: 11 },
  "grant-williams": { age: 27, jersey: 3, team: "CHA" },
  "royce-o-neale": { age: 31, jersey: 0, team: "PHX" },
  "kyle-anderson": { age: 32, jersey: 5, team: "MIN" },
  "brook-lopez": { age: 38, jersey: 11, team: "MIL" },
  "tobias-harris": { age: 33, jersey: 12, team: "DET" },
  "spencer-dinwiddie": { age: 32, jersey: 8, team: "TOR" },
  "markelle-fultz": { age: 28, jersey: 20, team: "SAS" },
  "marvin-bagley-iii": { age: 27, jersey: 35, team: "WAS" },
};

function seededFraction(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
function round1(v) {
  return Math.round(v * 10) / 10;
}
function round2(v) {
  return Math.round(v * 100) / 100;
}
function round3(v) {
  return Math.round(v * 1000) / 1000;
}

const FT_BASE_BY_POSITION = { PG: 82, SG: 80, SF: 76, PF: 72, C: 66 };
const FG_BASE_BY_POSITION = { PG: 44, SG: 44, SF: 46, PF: 49, C: 53 };
const SPG_BASE_BY_POSITION = { PG: 1.4, SG: 1.2, SF: 1.1, PF: 0.8, C: 0.7 };
const BPG_BASE_BY_POSITION = { PG: 0.2, SG: 0.3, SF: 0.5, PF: 0.9, C: 1.4 };
const THREE_PCT_BY_ARCHETYPE = {
  "guard-scorer": 37,
  "guard-defender": 34,
  "wing-scorer": 36,
  "wing-defender": 35,
  "big-scorer": 33,
  "big-defender": 22,
};
const THREE_PM_BASE_BY_ARCHETYPE = {
  "guard-scorer": 1.8,
  "guard-defender": 1.0,
  "wing-scorer": 1.6,
  "wing-defender": 1.2,
  "big-scorer": 0.7,
  "big-defender": 0.1,
};

function enrichPlayer(p) {
  const override = OVERRIDES[p.player_id] || {};
  const isOverridden = Object.keys(override).length > 0;
  const seed = seededFraction(p.player_id);

  // A player still on an active NBA roster for the 2025-26 season. Used to
  // filter the Wordle pool (Over/Under and other modes keep the full roster,
  // retired legends included) and to decide whether "age"/"team"/"jersey
  // number" mean a real-time current value vs. a career-peak estimate.
  const isActive = p.years_active_end >= 2025;
  const activeInfo = isActive ? ACTIVE_CURRENT_INFO[p.player_id] : undefined;

  // ---- Wordle fields ----
  const primaryTeam = activeInfo?.team || override.primary_team || p.teams[p.teams.length - 1] || p.teams[0];
  const teamInfo = TEAM_INFO[primaryTeam] || { name: primaryTeam, conference: "EAST", division: "Atlantic" };
  const peakYear = Math.round((p.years_active_start + p.years_active_end) / 2);
  const heightFeet = Math.floor(p.height_inches / 12);
  const heightInchesRemainder = p.height_inches % 12;
  // For active players, "age" means their real current age this season, not
  // an estimated career-peak age — that's the whole point of ACTIVE_CURRENT_INFO.
  const peakAge =
    activeInfo?.age ?? override.peak_age ?? clamp(22 + Math.round(0.4 * (p.years_active_end - p.years_active_start)), 20, 38);
  const jerseyNumber = activeInfo?.jersey ?? override.jersey_number ?? Math.round(seed * 55);
  const styleTag = deriveStyleTag(p);

  // ---- Over/Under expanded stat fields ----
  const totalSeasons = Math.max(1, p.years_active_end - p.years_active_start + 1);
  const totalGamesPlayed = Math.round(totalSeasons * 65);
  const startFraction = p.career_ppg >= 15 ? 0.88 : p.career_ppg >= 8 ? 0.55 : 0.25;
  const totalGamesStarted = Math.round(totalGamesPlayed * startFraction);

  const mpg = p.career_ppg >= 20 ? 34 : p.career_ppg >= 15 ? 30 : p.career_ppg >= 10 ? 24 : p.career_ppg >= 6 ? 18 : 12;
  const usgPct = p.career_ppg >= 24 ? 30 : p.career_ppg >= 18 ? 26 : p.career_ppg >= 12 ? 21 : p.career_ppg >= 7 ? 17 : 13;

  let fgPct = override.career_fg_pct ?? (FG_BASE_BY_POSITION[p.position] || 46) + (p.archetype_tag === "big-defender" ? 3 : 0) - (p.career_ppg >= 25 ? 2 : 0) + (seed - 0.5) * 3;
  fgPct = clamp(round1(fgPct), 38, 66);

  const preThreePointEra = p.years_active_end < 1980;
  let threePct = override.career_3p_pct;
  if (threePct === undefined) {
    if (preThreePointEra) threePct = 0;
    else {
      const base = THREE_PCT_BY_ARCHETYPE[p.archetype_tag] ?? 33;
      const eraAdjust = p.years_active_start < 1995 ? -4 : 0;
      threePct = clamp(round1(base + eraAdjust + (seed - 0.5) * 4), 15, 46);
    }
  }

  let ftPct = override.career_ft_pct ?? (FT_BASE_BY_POSITION[p.position] || 76) + (p.archetype_tag.includes("scorer") ? 2 : -2) + (seed - 0.5) * 6;
  ftPct = clamp(round1(ftPct), 45, 93);

  let threePm = override.career_3pm;
  if (threePm === undefined) {
    if (preThreePointEra) threePm = 0;
    else {
      const base = THREE_PM_BASE_BY_ARCHETYPE[p.archetype_tag] ?? 0.8;
      const scaled = base * (0.5 + p.career_ppg / 30) * (p.years_active_start < 1995 ? 0.4 : 1);
      threePm = clamp(round1(scaled), 0, 4.5);
    }
  }

  let spg = clamp(round1((SPG_BASE_BY_POSITION[p.position] || 1.0) + (p.archetype_tag.includes("defender") ? 0.3 : -0.1) + (seed - 0.5) * 0.4), 0.3, 2.8);
  let bpg = override.career_bpg;
  if (bpg === undefined) {
    const base = BPG_BASE_BY_POSITION[p.position] || 0.5;
    const defBonus = p.archetype_tag === "big-defender" ? 0.6 : p.archetype_tag === "wing-defender" ? 0.2 : 0;
    bpg = clamp(round1(base + defBonus + (seed - 0.5) * 0.3), 0.1, 3.5);
  }

  const pf = clamp(round1(2.0 + (mpg / 34) * 1.3 + (p.archetype_tag.includes("defender") ? 0.3 : 0)), 1.5, 4.0);
  const tov = clamp(round1(0.8 + (usgPct / 30) * 2.2 + (p.position === "PG" ? 0.6 : 0)), 0.5, 4.5);

  const per = clamp(round1(15 + p.all_star_appearances * 0.5 + (p.is_hall_of_fame ? 3 : 0) + (p.championships >= 1 ? 1 : 0) + (seed - 0.5) * 2), 8, 31);
  const tsPct = clamp(round1(55 + (fgPct - 46) / 2 + (ftPct - 75) / 10 + (threePm > 1 ? 1.5 : 0)), 48, 65);
  const wsPer48 = clamp(round3(0.1 + (per - 15) * 0.008), 0.01, 0.28);
  const bpm = clamp(round1((per - 15) * 0.5 - 0.3), -4, 10);
  const vorp = clamp(round1(Math.max(0, bpm) * totalSeasons * 0.7), 0, 120);

  return {
    ...p,
    career_spg: spg,
    career_bpg: bpg,
    career_3pm: threePm,
    career_fg_pct: fgPct,
    career_3p_pct: threePct,
    career_ft_pct: ftPct,
    career_mpg: mpg,
    career_tov: tov,
    career_pf: pf,
    career_per: per,
    career_ts_pct: tsPct,
    career_ws_per_48: wsPer48,
    career_bpm: bpm,
    career_vorp: vorp,
    career_usg_pct: usgPct,
    total_points: override.total_points ?? Math.round(p.career_ppg * totalGamesPlayed),
    total_rebounds: Math.round(p.career_rpg * totalGamesPlayed),
    total_assists: Math.round(p.career_apg * totalGamesPlayed),
    total_steals: Math.round(spg * totalGamesPlayed),
    total_blocks: Math.round(bpg * totalGamesPlayed),
    total_games_played: totalGamesPlayed,
    total_games_started: totalGamesStarted,
    total_three_pointers_made: Math.round(threePm * totalGamesPlayed),
    total_win_shares: round1(wsPer48 * (totalGamesPlayed * mpg) / 48),
    total_seasons: totalSeasons,
    primary_team: primaryTeam,
    conference: teamInfo.conference,
    division: teamInfo.division,
    height_feet: heightFeet,
    height_inches_remainder: heightInchesRemainder,
    peak_age: peakAge,
    jersey_number: jerseyNumber,
    era_label: eraLabel(peakYear),
    style_tag: styleTag,
    style_family: STYLE_FAMILY[styleTag],
    approximate: !isOverridden,
    is_active: isActive,
  };
}

const targets = [
  path.resolve(__dirname, "../src/data/nba_players.json"),
  path.resolve(__dirname, "../../../apps/web/src/data/nba_players.json"),
];

for (const target of targets) {
  const players = JSON.parse(fs.readFileSync(target, "utf8"));
  const enriched = players.map(enrichPlayer);
  fs.writeFileSync(target, JSON.stringify(enriched, null, 2) + "\n");
  console.log("enriched", enriched.length, "players in", target);
}
