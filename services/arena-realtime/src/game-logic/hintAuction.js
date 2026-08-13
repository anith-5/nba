// Server-authoritative game logic for Hint Auction — a live ascending-bid
// player draft. A shared mystery player is revealed through progressive
// hints each round (no buzzing/guessing, unlike Five Hints -- the hints
// exist purely to inform the auction), everyone bids in real time from a
// shared starting budget, the winner permanently spends their bid and the
// player auto-fills into an open roster slot, and this repeats until every
// connected player's roster is full. Bid state is PUBLIC the whole time
// (unlike Five Hints' hidden guesses) -- see sanitize.js's
// sanitizeHintAuction, which only ever redacts the mystery player's
// identity/stats and not-yet-revealed hints.
//
// Reuses Five Hints' hint-writing tables/helpers directly (same package,
// server-to-server -- unlike the deliberate client/server duplication
// elsewhere in this codebase, which exists only because apps/web and
// services/arena-realtime are separate deployments with no shared
// workspace).
import {
  POSITION_NAMES,
  KNOWN_NICKNAMES,
  STAT_RANK_CALLOUTS,
  heightPhrase,
  approximateWeight,
  seasonsPlayed,
  hint2Text,
  secondaryTeamName,
  hint4StatLine,
  majorAwardHint,
  draftNotabilityHint,
  primaryTeamWithContext,
} from "./fiveHints.js";
import { ALL_TIME_PLAYERS_WITH_TIER } from "./auctionTiers.js";
import { getCachedRosterData } from "../data/rosterSync.js";

export const ROSTER_SLOTS = ["PG", "SG", "SF", "PF", "C"];
export const BENCH_SLOT = "BENCH";
const FLEX_COMPATIBLE = { PG: ["SG"], SG: ["PG"], SF: ["PF"], PF: ["SF"], C: ["PF"] };
const FORCED_FILL_ORDER = ["PG", "SG", "SF", "PF", "C", BENCH_SLOT];

// Elite/Star/Role Player/Deep Bench at ~20/35/30/15 -- see auctionTiers.js
// (All-Time) and rosters.py's _auction_tier_pass (Current) for how each
// player actually gets bucketed. This is only the *draw* weighting.
const TIER_WEIGHTS = { Elite: 0.2, Star: 0.35, "Role Player": 0.3, "Deep Bench": 0.15 };

export const MIN_BID_INCREMENT = 1;

const DEFAULT_CONFIG = {
  budget: 100,
  benchEnabled: false,
  hintMode: "standard", // "standard" (fixed 7 hints) | "obscure" (host-chosen 3-5)
  hintCount: 7,
  auctionTimerSeconds: 20,
  extensionsEnabled: true,
  extensionSeconds: 5,
  maxExtensions: 5,
  poolFilter: "all", // "all" | "legends" | "position"
  position: null,
  era: "all-time", // "all-time" | "current"
};

// How long each pre-auction hint stays up before auto-advancing to the
// next one -- there's no buzz/guess to wait on, so this is purely a
// steady reveal pace rather than a race-to-answer window like Five Hints'
// HINT_TIMER_SECONDS.
const HINT_REVEAL_SECONDS = 6;

export const TIMERS = {
  HINT_REVEAL_SECONDS,
};

export function initGameState(settings) {
  const budget = Math.max(10, Math.min(1000, Number(settings.budget) || DEFAULT_CONFIG.budget));
  const benchEnabled = !!settings.benchEnabled;
  const hintMode = settings.hintMode === "obscure" ? "obscure" : "standard";
  const hintCount = hintMode === "obscure" ? Math.max(3, Math.min(5, Number(settings.hintCount) || 4)) : 7;
  const auctionTimerSeconds = Math.max(5, Math.min(60, Number(settings.auctionTimerSeconds) || DEFAULT_CONFIG.auctionTimerSeconds));
  const extensionsEnabled = settings.extensionsEnabled !== false;
  const extensionSeconds = Math.max(1, Math.min(15, Number(settings.extensionSeconds) || DEFAULT_CONFIG.extensionSeconds));
  // Number(undefined) is NaN, and NaN ?? fallback does NOT fall back (?? only
  // treats null/undefined as nullish) -- so an explicit finite-number check
  // is required here, unlike the `|| default` shorthand used above, to avoid
  // maxExtensions silently resolving to NaN (which would make every
  // `extensionsUsed < maxExtensions` check false and disable extensions
  // outright) whenever the host doesn't set it. This also correctly
  // preserves an intentional maxExtensions: 0 (extensions on, zero allowed),
  // which `|| default` would have overridden.
  const maxExtensionsRaw = Number(settings.maxExtensions);
  const maxExtensions = Number.isFinite(maxExtensionsRaw) ? Math.max(0, Math.min(20, maxExtensionsRaw)) : DEFAULT_CONFIG.maxExtensions;
  const era = settings.era === "current" ? "current" : "all-time";
  const poolFilter = ["all", "legends", "position"].includes(settings.poolFilter) ? settings.poolFilter : "all";

  return {
    config: {
      ...DEFAULT_CONFIG,
      budget,
      benchEnabled,
      hintMode,
      hintCount,
      auctionTimerSeconds,
      extensionsEnabled,
      extensionSeconds,
      maxExtensions,
      era,
      poolFilter,
      position: settings.position || null,
    },
    phase: "awaiting_configure", // awaiting_configure | round_active | game_over
    roundNumber: 0,
    totalRounds: null, // set by beginGame, once the connected player count is known
    rosters: {}, // socketId -> { PG, SG, SF, PF, C, [BENCH] }
    budgets: {}, // socketId -> remaining budget
    usedPlayerIds: [],
    roundHistory: [],
    currentRound: null,
  };
}

function emptyRoster(config) {
  const roster = {};
  for (const slot of ROSTER_SLOTS) roster[slot] = null;
  if (config.benchEnabled) roster[BENCH_SLOT] = null;
  return roster;
}

function getRoster(gameState, socketId) {
  if (!gameState.rosters[socketId]) gameState.rosters[socketId] = emptyRoster(gameState.config);
  return gameState.rosters[socketId];
}

function getBudget(gameState, socketId) {
  if (!(socketId in gameState.budgets)) gameState.budgets[socketId] = gameState.config.budget;
  return gameState.budgets[socketId];
}

function openSlots(roster) {
  return Object.keys(roster).filter((slot) => !roster[slot]);
}

// Sets up every connected player's roster/budget and computes the total
// round count for this game: one shared mystery player is auctioned per
// round, so filling every player's roster to `slotsPerPlayer` takes
// `players * slotsPerPlayer` total rounds, not a flat number independent of
// lobby size (standard fantasy-auction-draft convention).
export function beginGame(gameState, socketIds) {
  const slotsPerPlayer = ROSTER_SLOTS.length + (gameState.config.benchEnabled ? 1 : 0);
  gameState.totalRounds = Math.max(1, socketIds.length) * slotsPerPlayer;
  for (const socketId of socketIds) {
    gameState.rosters[socketId] = emptyRoster(gameState.config);
    gameState.budgets[socketId] = gameState.config.budget;
  }
  gameState.roundNumber = 1;
  startRound(gameState);
}

// --- Pool selection ---

// current_nba_players.json/its in-memory cache (see rosterSync.js) is
// refreshed live every 24h; a static import would freeze it at process
// start, so this always reads through the shared accessor instead. Falls
// back to the All-Time pool (and reports which era was actually used, since
// the caller needs the real shape to generate matching hints) if no live
// data has ever been cached yet.
function poolForEra(config) {
  if (config.era === "current") {
    const currentPlayers = getCachedRosterData()?.players || [];
    if (currentPlayers.length > 0) return { pool: currentPlayers, era: "current" };
    console.warn("[hintAuction] no current-player data cached yet -- falling back to the all-time pool for this round");
  }
  return { pool: ALL_TIME_PLAYERS_WITH_TIER, era: "all-time" };
}

// Graceful degradation for current-player records fetched before
// rosters.py started returning auction_tier (e.g. a disk cache that
// predates this feature) -- falls back to the coarser 3-value
// recognition_tier Wordle already relies on rather than requiring an
// immediate live resync before Current-era Hint Auction is playable.
function currentPlayerTier(player) {
  if (player.auction_tier) return player.auction_tier;
  if (player.recognition_tier === "Star") return "Star";
  if (player.recognition_tier === "Role Player") return "Role Player";
  return "Deep Bench";
}

function tierOf(player) {
  return player.auction_tier || currentPlayerTier(player);
}

function filterPool(pool, config) {
  switch (config.poolFilter) {
    case "legends":
      return pool.filter((p) => (config.era === "current" ? tierOf(p) === "Elite" : p.is_hall_of_fame || p.all_star_appearances >= 10));
    case "position":
      return pool.filter((p) => p.position === config.position);
    default:
      return pool;
  }
}

// Tier-weighted draw (mirrors apps/web/src/arena/utils/rosterPool.js's
// pickWeightedAnswer): groups the candidate pool by tier, weighted-picks a
// tier, then picks uniformly within it. If a tier is empty its weight is
// redistributed across whichever tiers do have players.
function pickWeightedMysteryPlayer(pool, usedPlayerIds) {
  const usedSet = new Set(usedPlayerIds);
  const unused = pool.filter((p) => !usedSet.has(String(p.player_id)));
  const candidatePool = unused.length > 0 ? unused : pool;

  const byTier = { Elite: [], Star: [], "Role Player": [], "Deep Bench": [] };
  for (const p of candidatePool) byTier[tierOf(p)].push(p);

  const availableTiers = Object.keys(TIER_WEIGHTS).filter((t) => byTier[t].length > 0);
  const totalWeight = availableTiers.reduce((sum, t) => sum + TIER_WEIGHTS[t], 0);
  let roll = Math.random() * totalWeight;
  for (const t of availableTiers) {
    roll -= TIER_WEIGHTS[t];
    if (roll <= 0) {
      const options = byTier[t];
      return { player: options[Math.floor(Math.random() * options.length)], tier: t };
    }
  }
  const fallback = candidatePool[Math.floor(Math.random() * candidatePool.length)];
  return { player: fallback, tier: tierOf(fallback) };
}

// --- Hint generation ---
// One 7-hint set per era; "Obscure" mode is just a truncation to the host's
// chosen count (3-5), same as Five Hints' own maxHints truncation. All-Time
// and Current player records have essentially no fields in common (career
// totals/awards/draft info vs. this-season per-game stats/team), so each
// era gets its own generator -- but both follow the same vague-to-specific
// curve and never reveal team/identity before the final hint.

function allTimeDraftFactHint(player) {
  const notable = draftNotabilityHint(player);
  if (notable) return notable;
  if (!player.draft_year) return "Entered the NBA as an undrafted free agent.";
  if (player.draft_round) return `Selected in Round ${player.draft_round} of the ${player.draft_year} NBA Draft.`;
  return `Entered the league in ${player.draft_year}.`;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function accoladeTallyHint(player) {
  const allStars = player.all_star_appearances || 0;
  const champs = player.championships || 0;
  const allStarPhrase = allStars > 0 ? `made the All-Star team ${allStars} time${allStars === 1 ? "" : "s"}` : "never made an All-Star team";
  const champPhrase = champs > 0 ? ` and won ${champs} championship${champs === 1 ? "" : "s"}` : "";
  return `${capitalize(allStarPhrase)}${champPhrase}.`;
}

function allTimeBigReveal(player) {
  const nickname = KNOWN_NICKNAMES[player.player_id];
  if (nickname) return `Known by the nickname ${nickname}.`;
  const awardLine = majorAwardHint(player);
  if (awardLine) return awardLine;
  const statLine = STAT_RANK_CALLOUTS[player.player_id];
  if (statLine) return statLine;
  return primaryTeamWithContext(player);
}

function generateAllTimeHints(player) {
  const positionName = POSITION_NAMES[player.position] || "forward";
  const other = secondaryTeamName(player);
  return [
    `A ${heightPhrase(player)} ${positionName} weighing approximately ${approximateWeight(player)} pounds.`,
    allTimeDraftFactHint(player),
    hint2Text(player),
    other ? `During their career spent time with the ${other}.` : "Spent their entire career with a single franchise.",
    hint4StatLine(player),
    accoladeTallyHint(player),
    allTimeBigReveal(player),
  ];
}

// A rough analog to nba_players.json's slug ids ("nikola-jokic") derived
// from a live nba_api display name, so current-era hints can still surface
// a KNOWN_NICKNAMES entry for the (mostly current) stars covered there.
// Best-effort only -- a miss just falls through to the team-context reveal
// below, never a crash or a blank hint.
function slugifyName(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function ordinal(n) {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]}`;
}

function experienceHint(player) {
  const years = player.years_in_league || 0;
  if (years === 0) return "A rookie, playing their first NBA season.";
  return `Entering their ${ordinal(years + 1)} NBA season, part of the league's ${player.era_label || "current era"}.`;
}

function hint4StatLineCurrent(player) {
  const pts = typeof player.pts_pg === "number" ? player.pts_pg : null;
  const reb = typeof player.reb_pg === "number" ? player.reb_pg : null;
  const ast = typeof player.ast_pg === "number" ? player.ast_pg : null;
  const blk = typeof player.blk_pg === "number" ? player.blk_pg : null;

  if (reb !== null && reb > 8 && ast !== null && ast > 6) {
    return `Averaging ${reb.toFixed(1)} rebounds and ${ast.toFixed(1)} assists per game this season.`;
  }
  if (pts !== null && pts > 20) return `Averaging ${pts.toFixed(1)} points per game this season.`;
  if (pts !== null && pts < 10 && reb !== null && reb > 8) return `Averaging ${reb.toFixed(1)} rebounds per game this season.`;
  if (ast !== null && ast > 7) return `Averaging ${ast.toFixed(1)} assists per game this season.`;
  if (blk !== null && blk > 2.0) return `Averaging ${blk.toFixed(1)} blocks per game this season.`;
  return `Averaging ${(pts ?? 0).toFixed(1)} points per game this season.`;
}

function currentBigReveal(player) {
  const nickname = KNOWN_NICKNAMES[slugifyName(player.name)];
  if (nickname) return `Known by the nickname ${nickname}.`;
  return `Currently suits up for the ${player.team_full_name}.`;
}

function generateCurrentHints(player) {
  const positionName = POSITION_NAMES[player.position] || "forward";
  const weight = typeof player.weight === "number" ? player.weight : 220;
  return [
    `A ${player.height_feet} foot ${player.height_inches ?? 0} ${positionName} weighing approximately ${weight} pounds.`,
    experienceHint(player),
    `Plays for a team in the ${player.conference} Conference, ${player.division} Division.`,
    hint4StatLineCurrent(player),
    `Known around the league for a "${player.style_tag}" playing style.`,
    `Wears #${player.jersey_number ?? "an unlisted number"}${player.age ? ` and is ${player.age} years old` : ""}.`,
    currentBigReveal(player),
  ];
}

export function generateHintAuctionHints(player, era) {
  return era === "current" ? generateCurrentHints(player) : generateAllTimeHints(player);
}

// --- Round flow ---

export function startRound(gameState) {
  const { pool: basePool, era } = poolForEra(gameState.config);
  const pool = filterPool(basePool, { ...gameState.config, era });
  const { player, tier } = pickWeightedMysteryPlayer(pool.length > 0 ? pool : basePool, gameState.usedPlayerIds);
  gameState.usedPlayerIds.push(String(player.player_id));
  gameState.phase = "round_active";

  gameState.currentRound = {
    player,
    tier,
    era,
    hints: generateHintAuctionHints(player, era),
    hintNumber: 1,
    hintRevealedAt: Date.now(),
    subPhase: "hints", // "hints" (revealing) | "auction" (live bidding) | "resolved"
    bids: [], // [{ socketId, amount, at }]
    highBid: 0,
    highBidderSocketId: null,
    auctionDeadlineAt: null,
    extensionsUsed: 0,
    resolved: false,
    winnerSocketId: null,
    winningBid: null,
    assignedSlot: null,
    unsold: false,
  };
  return gameState.currentRound;
}

// Reveals the next hint. Returns false once the configured hint count is
// exhausted (caller should open the auction instead).
export function advanceHint(gameState) {
  const round = gameState.currentRound;
  if (round.hintNumber >= gameState.config.hintCount) return false;
  round.hintNumber += 1;
  round.hintRevealedAt = Date.now();
  return true;
}

export function openAuction(gameState) {
  const round = gameState.currentRound;
  round.subPhase = "auction";
  round.auctionDeadlineAt = Date.now() + gameState.config.auctionTimerSeconds * 1000;
  return round;
}

// Live bid validation: round must be in its auction sub-phase; the bidder
// must have an open roster slot (a full roster can't usefully win, so
// blocking the bid outright prevents spite-bidding purely to drain a
// rival's budget); the amount must clear the current high bid by at least
// MIN_BID_INCREMENT; and it must not exceed the bidder's CURRENT remaining
// budget -- deliberately not reserving anything against future rounds,
// since that would blunt the exact "spend now vs. save for a star" tension
// the game is designed around.
export function placeBid(gameState, socketId, amount) {
  const round = gameState.currentRound;
  if (!round || round.resolved) return { error: "No active round." };
  if (round.subPhase !== "auction") return { error: "The auction hasn't opened yet." };

  const roster = getRoster(gameState, socketId);
  if (openSlots(roster).length === 0) return { error: "Your roster is already full." };

  const bid = Math.floor(Number(amount));
  if (!Number.isFinite(bid) || bid <= 0) return { error: "Enter a valid bid amount." };
  const minValid = round.highBid === 0 ? 1 : round.highBid + MIN_BID_INCREMENT;
  if (bid < minValid) return { error: `Bid must be at least ${minValid}.` };

  const budget = getBudget(gameState, socketId);
  if (bid > budget) return { error: "You don't have enough budget for that bid." };

  round.bids.push({ socketId, amount: bid, at: Date.now() });
  round.highBid = bid;
  round.highBidderSocketId = socketId;

  let extended = false;
  if (gameState.config.extensionsEnabled && round.extensionsUsed < gameState.config.maxExtensions) {
    round.auctionDeadlineAt = Date.now() + gameState.config.extensionSeconds * 1000;
    round.extensionsUsed += 1;
    extended = true;
  }

  return { ok: true, highBid: round.highBid, highBidderSocketId: socketId, auctionDeadlineAt: round.auctionDeadlineAt, extended };
}

// Auto-assigns a won player into an open roster slot: exact position match,
// else a flex-compatible slot, else bench (if enabled), else the first open
// slot in a fixed priority order ("waste the pick"). No player-facing
// choice step -- a per-winner picker (even with a timeout) would add a
// stall point on every single round across a game that can run dozens of
// them, and the spec explicitly calls for a default that never blocks
// progress. Always finds a slot, since bid eligibility above already
// required at least one to be open.
export function assignRosterSlot(gameState, socketId, player, price, tier) {
  const roster = getRoster(gameState, socketId);
  const realPosition = player.position;
  const entry = { playerId: player.player_id, playerName: player.name, position: realPosition, price, tier };

  if (ROSTER_SLOTS.includes(realPosition) && !roster[realPosition]) {
    roster[realPosition] = entry;
    return realPosition;
  }
  for (const flex of FLEX_COMPATIBLE[realPosition] || []) {
    if (!roster[flex]) {
      roster[flex] = entry;
      return flex;
    }
  }
  if (gameState.config.benchEnabled && !roster[BENCH_SLOT]) {
    roster[BENCH_SLOT] = entry;
    return BENCH_SLOT;
  }
  for (const slot of FORCED_FILL_ORDER) {
    if (slot in roster && !roster[slot]) {
      roster[slot] = entry;
      return slot;
    }
  }
  return null; // unreachable given the bid-eligibility check above
}

// Resolves the auction once its timer expires: highest bidder (if any) pays
// and the player auto-fills a roster slot; a round with no bids still
// reveals the player (for recap continuity) but spends/fills nothing --
// final results clearly label any roster slots left unfilled at game end
// rather than blocking the game to force a sale.
export function resolveAuction(gameState) {
  const round = gameState.currentRound;
  round.subPhase = "resolved";
  round.resolved = true;

  if (!round.highBidderSocketId) {
    round.unsold = true;
    return { unsold: true, player: round.player };
  }

  const winnerSocketId = round.highBidderSocketId;
  const price = round.highBid;
  gameState.budgets[winnerSocketId] = getBudget(gameState, winnerSocketId) - price;
  round.winnerSocketId = winnerSocketId;
  round.winningBid = price;
  round.assignedSlot = assignRosterSlot(gameState, winnerSocketId, round.player, price, round.tier);

  return { unsold: false, winnerSocketId, price, assignedSlot: round.assignedSlot, player: round.player };
}

export function finalizeRoundHistory(gameState) {
  const round = gameState.currentRound;
  gameState.roundHistory.push({
    round: gameState.roundNumber,
    playerName: round.player.name,
    playerId: round.player.player_id,
    position: round.player.position,
    tier: round.tier,
    era: round.era,
    winnerSocketId: round.winnerSocketId,
    winningBid: round.winningBid,
    assignedSlot: round.assignedSlot,
    unsold: round.unsold,
    statLine: round.era === "current" ? round.player.pts_pg : round.player.career_ppg,
  });
}

export function goToNextRound(gameState) {
  if (gameState.roundNumber >= gameState.totalRounds) {
    gameState.phase = "game_over";
    return false;
  }
  gameState.roundNumber += 1;
  startRound(gameState);
  return true;
}
