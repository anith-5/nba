// Strips server-only secrets (the real stat value, other players' individual
// vote choices, and the non-serializable timer handle) from gameState before
// it is broadcast to clients. Everything is revealed only once the round's
// reveal timer/vote-completion fires.
export function sanitizeGameStateForBroadcast(gameState) {
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
function sanitizeClosestTo(gameState) {
  if (gameState.phase !== "building") return gameState;
  const publicLineups = {};
  for (const [socketId, state] of Object.entries(gameState.playerLineups)) {
    publicLineups[socketId] = { done: state.done, filledCount: state.filledCount };
  }
  return { ...gameState, playerLineups: publicLineups };
}
