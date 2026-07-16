// Stat category metadata: label, host-facing group, and the rounding
// precision to apply when generating an Auto-mode line. Precision matters
// because these categories span wildly different scales (a BPG of 2.3 vs a
// career point total of 41000) — rounding every line to the nearest 0.5 like
// a per-game stat would make percentage/efficiency lines nonsensical and
// would produce meaningless "41000.5"-style lines for career totals.
export const STAT_CATEGORIES = {
  // Per game stats
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
  // Efficiency stats
  career_per: { label: "PER", group: "efficiency", format: "decimal1" },
  career_ts_pct: { label: "TS%", group: "efficiency", format: "percent" },
  career_ws_per_48: { label: "WS/48", group: "efficiency", format: "decimal3" },
  career_bpm: { label: "BPM", group: "efficiency", format: "decimal1" },
  career_vorp: { label: "VORP", group: "efficiency", format: "integer" },
  career_usg_pct: { label: "USG%", group: "efficiency", format: "percent" },
  // Career totals
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

export const STAT_GROUP_LABELS = {
  "per-game": "Per Game Stats",
  efficiency: "Efficiency Stats",
  "career-totals": "Career Totals",
};

function filterPool(players, poolFilter) {
  switch (poolFilter) {
    case "all-stars":
      return players.filter((p) => p.all_star_appearances > 0);
    case "champions":
      return players.filter((p) => p.championships > 0);
    case "hall-of-famers":
      return players.filter((p) => p.is_hall_of_fame);
    case "first-round":
      return players.filter((p) => p.draft_round === 1);
    case "undrafted":
      return players.filter((p) => !p.draft_year);
    case "international":
      return players.filter((p) => p.birth_country && p.birth_country !== "USA");
    case "role-players":
      return players.filter((p) => p.career_ppg < 10);
    default:
      return players;
  }
}

// Rounds a generated line to a precision appropriate for its category's
// scale. Fixed-decimal categories (per-game/efficiency/percent stats) round
// to a constant precision since their scale is consistent across players.
// Career totals use "adaptive" rounding keyed off the actual value's own
// magnitude, since the same category (e.g. Total Career Points) can be 800
// for a role player or 40000 for an all-time great — a single fixed
// precision can't serve both.
function roundForFormat(value, format) {
  switch (format) {
    case "percent":
    case "decimal1":
      return Math.max(0, Math.round(value * 2) / 2);
    case "decimal3":
      return Math.max(0, Math.round(value * 200) / 200); // nearest 0.005
    case "integer":
      return Math.max(0, Math.round(value));
    case "adaptive-integer": {
      const step = value >= 5000 ? 50 : value >= 500 ? 10 : value >= 50 ? 5 : 1;
      return Math.max(0, Math.round(value / step) * step);
    }
    case "adaptive-decimal": {
      const step = value >= 50 ? 1 : 0.5;
      return Math.max(0, Math.round(value / step) * step);
    }
    default:
      return Math.round(value * 2) / 2;
  }
}

// A floor for the generated line before rounding, scaled to each format's own
// typical magnitude. A flat 0.5 floor (reasonable for PPG) would badly
// distort a fine-grained stat like WS/48, whose entire realistic range is
// roughly 0-0.3 — every line would get shoved up to at least 0.5.
const MIN_LINE_BY_FORMAT = {
  percent: 1,
  decimal1: 0.1,
  decimal3: 0.005,
  integer: 0,
  "adaptive-integer": 0,
  "adaptive-decimal": 0,
};

function lineForDifficulty(actual, difficulty, format) {
  let spreadPct;
  if (difficulty === "easy") spreadPct = 0.1;
  else if (difficulty === "hard") spreadPct = 0.5;
  else spreadPct = 0.25; // medium
  const spread = actual * spreadPct;
  const delta = (Math.random() * 2 - 1) * spread;
  const line = Math.max(MIN_LINE_BY_FORMAT[format] ?? 0, actual + delta);
  const rounded = roundForFormat(line, format);
  // Percentages are bounded 0-100 regardless of spread math.
  return format === "percent" ? Math.min(100, rounded) : rounded;
}

// Picks the next question, looping back through already-used players with a
// different stat category once the filtered pool is exhausted (per the
// "corner case" rule in the spec) rather than repeating an identical question.
export function buildRound({ pool, poolFilter, statCategory, lineMode, difficulty, manualLine, usedPairs }) {
  const filtered = filterPool(pool, poolFilter);
  if (filtered.length === 0) {
    throw new Error("No players match the selected pool filter");
  }

  const categories = Object.keys(STAT_CATEGORIES);
  let candidate = filtered.find(
    (p) => !usedPairs.has(`${p.player_id}:${statCategory}`)
  );
  let category = statCategory;

  if (!candidate) {
    // Pool of (player, category) pairs exhausted for the primary category —
    // loop back through players using a different stat category.
    outer: for (const altCategory of categories) {
      if (altCategory === statCategory) continue;
      for (const p of filtered) {
        if (!usedPairs.has(`${p.player_id}:${altCategory}`)) {
          candidate = p;
          category = altCategory;
          break outer;
        }
      }
    }
  }

  if (!candidate) {
    // Every (player, category) pair has been used at least once — just
    // pick randomly so the game can keep going indefinitely.
    candidate = filtered[Math.floor(Math.random() * filtered.length)];
    category = statCategory;
  }

  const meta = STAT_CATEGORIES[category];
  const actualValue = candidate[category];
  const line =
    lineMode === "manual" && typeof manualLine === "number"
      ? manualLine
      : lineForDifficulty(actualValue, difficulty || "medium", meta.format);

  return {
    player: {
      player_id: candidate.player_id,
      name: candidate.name,
      position: candidate.position,
      teams: candidate.teams,
    },
    statCategory: category,
    statLabel: meta.label,
    statFormat: meta.format,
    line,
    actualValue,
    pairKey: `${candidate.player_id}:${category}`,
  };
}

// votes: { [socketId]: "over" | "under" }
// Returns { correctSocketIds, soleBonusSocketId, pointsBySocketId }
export function scoreRound(votes, actualValue, line) {
  const correctSocketIds = Object.entries(votes)
    .filter(([, vote]) => {
      if (vote === "over") return actualValue > line;
      if (vote === "under") return actualValue < line;
      return false;
    })
    .map(([socketId]) => socketId);

  const soleBonusSocketId = correctSocketIds.length === 1 ? correctSocketIds[0] : null;

  const pointsBySocketId = {};
  for (const socketId of correctSocketIds) {
    pointsBySocketId[socketId] = 3 + (socketId === soleBonusSocketId ? 1 : 0);
  }

  return { correctSocketIds, soleBonusSocketId, pointsBySocketId };
}
