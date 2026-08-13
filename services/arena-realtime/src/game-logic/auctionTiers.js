// Hint Auction's 4-tier pool classifier (Elite/Star/Role Player/Deep Bench)
// for the All-Time era. nba_players.json has no tier field of its own, so
// this derives a composite prestige score from real fields already on each
// player (HOF flag, major awards, All-Star count, championships, career
// efficiency, draft position) and percentile-ranks the whole 504-player
// pool into the target ~20/35/30/15% split — the same self-calibrating
// approach as rosters.py's _auction_tier_pass for the Current era, and for
// the same reason: nba_players.json is a curated "notable players" list
// (roughly a quarter of it is Hall of Famers), not a random cross-section,
// so hand-picked absolute thresholds would badly overshoot Elite/Star and
// starve Deep Bench. Computed once at module load since the dataset is
// static for the life of the process.
import players from "../data/nba_players.json" with { type: "json" };

const PERCENTILE_CUTS = { Elite: 0.2, Star: 0.55, "Role Player": 0.85 };

function auctionScore(player) {
  const awards = player.awards || {};
  let score = player.is_hall_of_fame ? 50 : 0;
  score += Math.min(awards.mvp || 0, 2) * 30;
  score += Math.min(awards.finals_mvp || 0, 2) * 20;
  score += Math.min(awards.dpoy || 0, 2) * 15;
  score += awards.roy ? 10 : 0;
  score += Math.min(awards.sixth_man || 0, 2) * 8;
  score += Math.min(player.all_star_appearances || 0, 15) * 3;
  score += Math.min(player.championships || 0, 4) * 4;
  score += Math.max(0, (player.career_per || 0) - 10) * 2;
  score += Math.max(0, (player.career_ws_per_48 || 0) - 0.08) * 150;
  score += (player.career_ppg || 0) * 0.8;
  if (player.draft_round === 1 && player.draft_pick === 1) score += 8;
  else if (player.draft_round === 1 && player.draft_pick <= 3) score += 4;
  else if (player.draft_round === 1) score += 1;
  return score;
}

function buildTierMap() {
  const ranked = [...players].sort((a, b) => auctionScore(b) - auctionScore(a));
  const total = ranked.length;
  const map = new Map();
  ranked.forEach((player, i) => {
    const percentile = total ? i / total : 0;
    let tier;
    if (percentile < PERCENTILE_CUTS.Elite) tier = "Elite";
    else if (percentile < PERCENTILE_CUTS.Star) tier = "Star";
    else if (percentile < PERCENTILE_CUTS["Role Player"]) tier = "Role Player";
    else tier = "Deep Bench";
    map.set(player.player_id, tier);
  });
  return map;
}

const TIER_BY_PLAYER_ID = buildTierMap();

export function getAllTimeTier(playerId) {
  return TIER_BY_PLAYER_ID.get(playerId) || "Role Player";
}

// For pool selection: every all-time player annotated with its tier, so
// callers can group/filter without re-deriving anything.
export const ALL_TIME_PLAYERS_WITH_TIER = players.map((player) => ({
  ...player,
  auction_tier: getAllTimeTier(player.player_id),
}));

export function auctionTierDistribution() {
  const counts = { Elite: 0, Star: 0, "Role Player": 0, "Deep Bench": 0 };
  for (const tier of TIER_BY_PLAYER_ID.values()) counts[tier] += 1;
  return counts;
}
