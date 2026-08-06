// Mirrors services/arena-realtime/src/game-logic/overUnder.js's STAT_CATEGORIES.
// Duplicated here (not imported) because the frontend and the realtime
// server are separate packages with no shared workspace — same pattern
// already used for nba_players.json.
export const STAT_CATEGORIES = {
  career_ppg: { label: "PPG", group: "per-game", format: "decimal1" },
  career_rpg: { label: "RPG", group: "per-game", format: "decimal1" },
  career_apg: { label: "APG", group: "per-game", format: "decimal1" },
  career_spg: { label: "SPG", group: "per-game", format: "decimal1" },
  career_bpg: { label: "BPG", group: "per-game", format: "decimal1" },
  career_3pm: { label: "3PM", group: "per-game", format: "decimal1" },
  career_fg_pct: { label: "FG%", group: "per-game", format: "percent" },
  career_3p_pct: { label: "3P%", group: "per-game", format: "percent" },
  career_ft_pct: { label: "FT%", group: "per-game", format: "percent" },
  career_mpg: { label: "MPG", group: "per-game", format: "decimal1" },
  career_tov: { label: "TOV", group: "per-game", format: "decimal1" },
  career_pf: { label: "PF", group: "per-game", format: "decimal1" },
  career_per: { label: "PER", group: "efficiency", format: "decimal1" },
  career_ts_pct: { label: "TS%", group: "efficiency", format: "percent" },
  career_ws_per_48: { label: "WS/48", group: "efficiency", format: "decimal3" },
  career_bpm: { label: "BPM", group: "efficiency", format: "decimal1" },
  career_vorp: { label: "VORP", group: "efficiency", format: "integer" },
  career_usg_pct: { label: "USG%", group: "efficiency", format: "percent" },
  total_points: { label: "Total Career Points", group: "career-totals", format: "adaptive-integer" },
  total_rebounds: { label: "Total Career Rebounds", group: "career-totals", format: "adaptive-integer" },
  total_assists: { label: "Total Career Assists", group: "career-totals", format: "adaptive-integer" },
  total_steals: { label: "Total Career Steals", group: "career-totals", format: "adaptive-integer" },
  total_blocks: { label: "Total Career Blocks", group: "career-totals", format: "adaptive-integer" },
  total_games_played: { label: "Total Games Played", group: "career-totals", format: "adaptive-integer" },
  total_games_started: { label: "Total Games Started", group: "career-totals", format: "adaptive-integer" },
  total_three_pointers_made: { label: "Total Three Pointers Made", group: "career-totals", format: "adaptive-integer" },
  total_win_shares: { label: "Total Win Shares", group: "career-totals", format: "adaptive-decimal" },
  total_seasons: { label: "Total Seasons Played", group: "career-totals", format: "integer" },
};

export const STAT_GROUP_ORDER = ["per-game", "efficiency", "career-totals"];
export const STAT_GROUP_LABELS = {
  "per-game": "Per Game Stats",
  efficiency: "Efficiency Stats",
  "career-totals": "Career Totals",
};

export function formatStatValue(value, format) {
  if (value === undefined || value === null) return "—";
  switch (format) {
    case "percent":
      return `${value.toFixed(1)}%`;
    case "decimal1":
      return value.toFixed(1);
    case "decimal3":
      return value.toFixed(3);
    case "integer":
      return Math.round(value).toLocaleString();
    case "adaptive-integer":
      return Math.round(value).toLocaleString();
    case "adaptive-decimal":
      return value.toFixed(1);
    default:
      return String(value);
  }
}
