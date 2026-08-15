const POSITION_ORDER = ["PG", "SG", "SF", "PF", "C"];

function LineupCard({ entry, target }) {
  return (
    <div
      className={`hoop-card-outline space-y-3 p-5 ${entry.overTarget ? "border border-stat-down/40" : entry.perfect ? "border border-basketball/50" : ""}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-lg font-bold text-ink">{entry.name}</p>
        {entry.overTarget ? (
          <span className="text-xs font-semibold text-stat-down">Over Target</span>
        ) : entry.perfect ? (
          <span className="text-xs font-semibold text-basketball">Perfect</span>
        ) : null}
      </div>
      <div className="grid grid-cols-5 gap-2 text-center">
        {POSITION_ORDER.map((pos) => (
          <div key={pos} className="rounded-lg border border-ink/20 bg-paper p-2">
            <p className="hoop-stat-label text-xs">{pos}</p>
            <p className="mt-1 truncate text-xs font-semibold text-ink">{entry.lineup[pos]?.name}</p>
            <p className="text-xs text-ink/60">
              {entry.lineup[pos]?.season} · {entry.lineup[pos]?.ppg}
            </p>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between rounded-lg border border-ink/20 px-4 py-2">
        <span className="hoop-stat-label">
          Total <span className="text-ink/60">/ {target}</span>
        </span>
        <span className="hoop-stat-value">{entry.total}</span>
      </div>
      <div className="flex items-center justify-between text-sm text-ink/70">
        <span>Distance: {entry.distance}</span>
        <span className="font-semibold text-terracotta">{entry.points} pts</span>
      </div>
    </div>
  );
}

export function ClosestToRoundResults({ gameState, isHost, onNextRound }) {
  const roundResult = gameState.roundResults[gameState.roundResults.length - 1];
  const isLastRound = gameState.roundNumber >= gameState.totalRounds;

  return (
    <div className="animate-fade-in mx-auto max-w-3xl space-y-6">
      <header className="text-center">
        <h1 className="text-2xl font-bold text-ink">
          Round {gameState.roundNumber} of {gameState.totalRounds} — Results
        </h1>
        <p className="text-ink/70">Target: {gameState.target} PPG</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {roundResult.entries.map((entry) => (
          <LineupCard key={entry.socketId} entry={entry} target={gameState.target} />
        ))}
      </div>

      {isHost && (
        <div className="text-center">
          <button onClick={onNextRound} className="hoop-btn-primary">
            {isLastRound ? "See Final Results" : "Next Round"}
          </button>
        </div>
      )}
      {!isHost && <p className="text-center text-sm text-ink/60">Waiting for the host to continue…</p>}
    </div>
  );
}

function buildShareText(gameState, players) {
  const standings = [...players].sort(
    (a, b) => (gameState.scores[b.socketId] || 0) - (gameState.scores[a.socketId] || 0)
  );
  const lines = [
    `HoopIQ Arena — Closest To results (${gameState.totalRounds} round${gameState.totalRounds > 1 ? "s" : ""}, target ${gameState.target})`,
    ...standings.map((p, i) => `${i + 1}. ${p.name}: ${gameState.scores[p.socketId] || 0} pts`),
  ];
  return lines.join("\n");
}

function bestRoundFor(gameState, socketId) {
  let best = null;
  for (const round of gameState.roundResults) {
    const entry = round.entries.find((e) => e.socketId === socketId);
    if (entry && (!best || entry.points > best.points)) best = entry;
  }
  return best;
}

export function ClosestToFinalResults({ gameState, players }) {
  const standings = [...players].sort(
    (a, b) => (gameState.scores[b.socketId] || 0) - (gameState.scores[a.socketId] || 0)
  );

  return (
    <div className="animate-fade-in mx-auto max-w-3xl space-y-6 text-center">
      <h1 className="text-3xl font-bold text-ink">Final Results</h1>

      <ol className="mx-auto max-w-sm space-y-2 text-left">
        {standings.map((p, i) => (
          <li key={p.socketId} className="hoop-card-outline flex items-center justify-between px-4 py-2">
            <span className="text-ink">
              <span className="hoop-stat-label mr-2">#{i + 1}</span>
              {p.name}
            </span>
            <span className="hoop-stat-value">{gameState.scores[p.socketId] || 0}</span>
          </li>
        ))}
      </ol>

      <div className="space-y-4 text-left">
        <p className="hoop-stat-label text-center">Best Lineup</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {standings.map((p) => {
            const entry = bestRoundFor(gameState, p.socketId);
            return entry ? <LineupCard key={p.socketId} entry={entry} target={gameState.target} /> : null;
          })}
        </div>
      </div>

      <button
        onClick={() => navigator.clipboard?.writeText(buildShareText(gameState, players))}
        className="hoop-btn-primary"
      >
        Share Results
      </button>
    </div>
  );
}
