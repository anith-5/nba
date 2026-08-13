// Strips server-only secrets (the real stat value, other players' individual
// vote choices, and the non-serializable timer handle) from gameState before
// it is broadcast to clients. Everything is revealed only once the round's
// reveal timer/vote-completion fires.
export function sanitizeGameStateForBroadcast(gameState) {
  // `builds` is unique to Build a Player.
  if (gameState?.builds) return sanitizeBuildAPlayer(gameState);
  // Checked first: Themed Draft also has a top-level `rosters` map (one
  // array per team), which would otherwise collide with Hint Auction's own
  // `rosters` discriminator below -- `pickOrder` is unique to Themed Draft.
  if (gameState?.pickOrder) return sanitizeThemedDraft(gameState);
  // Checked before Five Hints below: both shapes have currentRound.hints,
  // but only Hint Auction has a top-level `rosters` map, so that has to be
  // the discriminator, not the hints array.
  if (gameState?.rosters) return sanitizeHintAuction(gameState);
  if (gameState?.currentRound?.hints) return sanitizeFiveHints(gameState);
  if (gameState?.currentRound) return sanitizeOverUnder(gameState);
  if (gameState?.playerLineups) return sanitizeClosestTo(gameState);
  return gameState;
}

function sanitizeOverUnder(gameState) {
  const { _timeout, votes, actualValue, pairKey, revealed, ...rest } = gameState.currentRound;

  const publicRound = revealed
    ? { ...rest, votes, actualValue, revealed }
    : { ...rest, votedSocketIds: Object.keys(votes || {}), revealed };

  return { ...gameState, currentRound: publicRound };
}

// Closest To's hidden information is each player's in-progress lineup — team
// wheel spins and picks must stay private to that player until everyone has
// finished the round, otherwise opponents could see (and react to) your
// picks while still building their own. While the round is still in the
// "building" phase, every player's lineup is redacted down to just the
// completion status the waiting-screen counter needs; the real picks/PPG
// only ever reach their own owner via the private spin_result/pick_confirmed
// socket events emitted directly in gameHandlers.js.
// Five Hints' hidden information is the mystery player's identity and the
// full hint array (both fully known server-side the instant a round starts
// so the buzzer can be scored instantly) -- clients only ever get hint text
// for hints already revealed, and casual-mode guesses are reduced to a
// yes/no "did they submit" flag until that hint's results are revealed (see
// resolveCasualHint's lastHintReveal snapshot in fiveHints.js, which is
// already-public data by the time it's set and passes through untouched).
// Once the round is resolved, everything -- player identity, every hint,
// every casual guess -- is safe to send in full for the reveal + recap.
function sanitizeFiveHints(gameState) {
  const round = gameState.currentRound;
  if (!round) return gameState;

  if (round.resolved) {
    const { acceptedAnswers, ...publicRound } = round;
    return { ...gameState, currentRound: publicRound };
  }

  const publicSubmissions = {};
  for (const [socketId, sub] of Object.entries(round.casualSubmissions || {})) {
    publicSubmissions[socketId] = { hintNumber: sub.hintNumber, submitted: true };
  }

  const publicRound = {
    hints: round.hints.slice(0, round.hintNumber),
    hintNumber: round.hintNumber,
    hintRevealedAt: round.hintRevealedAt,
    subPhase: round.subPhase,
    activeBuzzerSocketId: round.activeBuzzerSocketId,
    buzzDeadlineAt: round.buzzDeadlineAt,
    lockedOutSocketIds: round.lockedOutSocketIds,
    casualSubmissions: publicSubmissions,
    lastHintReveal: round.lastHintReveal || null,
    resolved: false,
    winners: [],
  };
  return { ...gameState, currentRound: publicRound };
}

// Hint Auction's hidden information is only ever the mystery player's real
// identity/stats and the hints not yet revealed -- unlike Five Hints, bid
// state is meant to be fully public live ("all players can see everyone's
// current highest bid in real time"), so bids/highBid/rosters/budgets all
// pass through untouched. Once the round resolves, the player is revealed
// to everyone, so nothing needs redacting at all.
function sanitizeHintAuction(gameState) {
  const round = gameState.currentRound;
  if (!round || round.resolved) return gameState;

  const publicRound = {
    tier: round.tier,
    era: round.era,
    hints: round.hints.slice(0, round.hintNumber),
    hintNumber: round.hintNumber,
    hintRevealedAt: round.hintRevealedAt,
    subPhase: round.subPhase,
    bids: round.bids,
    highBid: round.highBid,
    highBidderSocketId: round.highBidderSocketId,
    auctionDeadlineAt: round.auctionDeadlineAt,
    extensionsUsed: round.extensionsUsed,
    resolved: false,
    winnerSocketId: null,
    winningBid: null,
    assignedSlot: null,
    unsold: false,
  };
  return { ...gameState, currentRound: publicRound };
}

// Build a Player has no hidden information at all -- the revealed player's
// traits and every player's build-in-progress are public the instant they
// happen (confirmed default, unlike Closest To's Blind Mode), so this only
// ever strips the non-serializable timer handle, same as Over Under's
// `_timeout` and Themed Draft's `_turnTimeout` above.
function sanitizeBuildAPlayer(gameState) {
  const { _pickTimeout, ...publicState } = gameState;
  return publicState;
}

// Themed Draft's hidden information is only ever in-progress vote choices
// during the voting phase -- picks are fully public the instant they're
// made (there's nothing to hide during drafting, unlike Closest To's
// in-progress lineups), and once resolveVoting fires the real votes are
// safe to reveal in full, mirroring Over Under's reveal-then-show-everything
// shape. `_turnTimeout` is a non-serializable Node timer handle (same
// category as Over Under's `_timeout` on currentRound) so it's always
// stripped regardless of phase, not just during voting.
function sanitizeThemedDraft(gameState) {
  const { _turnTimeout, ...publicState } = gameState;
  if (gameState.phase !== "voting") return publicState;
  return { ...publicState, votes: {}, votedSocketIds: Object.keys(gameState.votes || {}) };
}

function sanitizeClosestTo(gameState) {
  if (gameState.phase !== "building") return gameState;
  const publicLineups = {};
  for (const [socketId, state] of Object.entries(gameState.playerLineups)) {
    publicLineups[socketId] = { done: state.done, filledCount: state.filledCount };
  }
  return { ...gameState, playerLineups: publicLineups };
}
