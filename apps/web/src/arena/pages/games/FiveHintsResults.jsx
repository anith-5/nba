import OverUnderLeaderboard from "./OverUnderLeaderboard.jsx";

// Lower average hint number = better at the game (they needed fewer hints
// to get there). Players with zero correct rounds show "—" rather than a
// misleading number.
function averageHintNumber(playerSocketId, roundHistory) {
  const hits = roundHistory
    .flatMap((r) => r.winners)
    .filter((w) => w.socketId === playerSocketId)
    .map((w) => w.hintNumber);
  if (hits.length === 0) return null;
  return hits.reduce((sum, h) => sum + h, 0) / hits.length;
}

function shareText(gameState, players) {
  const ranked = [...players].sort((a, b) => (gameState.scores[b.socketId] || 0) - (gameState.scores[a.socketId] || 0));
  const lines = [
    `HoopIQ Arena — Five Hints results (${gameState.roundHistory.length} rounds)`,
    ...ranked.map((p, i) => `#${i + 1} ${p.name}: ${gameState.scores[p.socketId] || 0} pts`),
    "",
    ...gameState.roundHistory.map((r, i) => {
      const winner = r.winners[0];
      const winnerName = winner ? players.find((p) => p.socketId === winner.socketId)?.name : null;
      return winner
        ? `Round ${i + 1}: ${r.playerName} — guessed by ${winnerName} on hint ${winner.hintNumber}`
        : `Round ${i + 1}: ${r.playerName} — nobody guessed it`;
    }),
  ];
  navigator.clipboard?.writeText(lines.join("\n"));
}

export function FiveHintsFinalResults({ gameState, players }) {
  return (
    <div className="animate-fade-in mx-auto max-w-2xl space-y-6 text-center">
      <h1 className="text-3xl font-bold text-ink">Final Results</h1>

      <div className="mx-auto max-w-sm text-left">
        <OverUnderLeaderboard players={players} scores={gameState.scores} />
      </div>

      <div className="space-y-2 text-left">
        <p className="hoop-stat-label">Average hint number when correct (lower is better)</p>
        {players.map((p) => {
          const avg = averageHintNumber(p.socketId, gameState.roundHistory);
          return (
            <div key={p.socketId} className="hoop-card-outline flex items-center justify-between px-4 py-2 text-sm">
              <span className="text-ink">{p.name}</span>
              <span className="hoop-stat-value text-base">{avg === null ? "—" : avg.toFixed(1)}</span>
            </div>
          );
        })}
      </div>

      <div className="space-y-2 text-left">
        <p className="hoop-stat-label">Round by round</p>
        {gameState.roundHistory.map((r, i) => {
          const winner = r.winners[0];
          const winnerName = winner ? players.find((p) => p.socketId === winner.socketId)?.name : null;
          return (
            <div key={i} className="hoop-card-outline px-4 py-2 text-sm text-ink">
              Round {i + 1}: {r.playerName} —{" "}
              {winner ? (
                <span className="text-terracotta">
                  {winnerName} got it on hint {winner.hintNumber} (+{winner.points})
                </span>
              ) : (
                <span className="text-basketball">nobody guessed it</span>
              )}
            </div>
          );
        })}
      </div>

      <button onClick={() => shareText(gameState, players)} className="hoop-btn-primary">
        Share Results
      </button>
    </div>
  );
}
