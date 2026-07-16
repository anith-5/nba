import currentRosterData from "../../data/current_nba_players.json";

export const currentPlayers = currentRosterData.players;
export const rosterMeta = {
  generatedAt: currentRosterData.generated_at,
  source: currentRosterData.source,
  count: currentRosterData.count,
  note: currentRosterData.note || null,
};

// Star players 50%, Role Player 35%, Deep Cut 15% — keeps the answer pool
// from constantly landing on someone nobody recognizes. If a tier happens to
// be empty its weight is redistributed across whichever tiers do have players.
const TIER_WEIGHTS = { Star: 0.5, "Role Player": 0.35, "Deep Cut": 0.15 };

export function pickWeightedAnswer(players = currentPlayers) {
  const byTier = { Star: [], "Role Player": [], "Deep Cut": [] };
  for (const p of players) {
    (byTier[p.recognition_tier] || byTier["Deep Cut"]).push(p);
  }

  const availableTiers = Object.keys(TIER_WEIGHTS).filter((t) => byTier[t].length > 0);
  const totalWeight = availableTiers.reduce((sum, t) => sum + TIER_WEIGHTS[t], 0);
  let roll = Math.random() * totalWeight;
  for (const t of availableTiers) {
    roll -= TIER_WEIGHTS[t];
    if (roll <= 0) {
      const pool = byTier[t];
      return pool[Math.floor(Math.random() * pool.length)];
    }
  }
  return players[Math.floor(Math.random() * players.length)];
}

export function formatRosterFreshness(generatedAtIso) {
  const generated = new Date(generatedAtIso);
  const daysOld = (Date.now() - generated.getTime()) / (1000 * 60 * 60 * 24);
  const dateLabel = generated
    .toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    .replace(",", "");
  return { dateLabel, isStale: daysOld > 7 };
}
