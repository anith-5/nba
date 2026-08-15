// Final recap: winning team highlighted, every team's roster and vote tally
// shown ranked -- same "compute everything at render time from the raw
// broadcast state" pattern as HintAuctionResults, nothing precomputed
// server-side beyond the winner/tie itself (resolveVoting).
export default function ThemedDraftResults({ gameState, players }) {
  const { rosters, voteCounts = {}, winnerSocketId, tied, tiedSocketIds = [] } = gameState;

  const totalVotes = Object.values(voteCounts).reduce((sum, c) => sum + c, 0);
  const ranked = [...players].sort((a, b) => (voteCounts[b.socketId] || 0) - (voteCounts[a.socketId] || 0));
  const winner = players.find((p) => p.socketId === winnerSocketId);

  return (
    <div className="animate-fade-in space-y-6">
      <header className="text-center">
        <h1 className="text-2xl font-bold text-ink">Draft Results</h1>
        <p className="mt-1 text-sm text-ink/70">
          {totalVotes} vote{totalVotes === 1 ? "" : "s"} cast
        </p>
      </header>

      {winner && (
        <div className="hoop-card-outline mx-auto max-w-lg space-y-1 p-5 text-center">
          <p className="hoop-stat-label">Winner</p>
          <p className="text-2xl font-bold text-terracotta">{winner.name}</p>
          <p className="text-xs text-ink/60">
            {voteCounts[winnerSocketId] || 0} vote{(voteCounts[winnerSocketId] || 0) === 1 ? "" : "s"}
            {tied &&
              ` — tied with ${tiedSocketIds.length - 1} other team${tiedSocketIds.length - 1 === 1 ? "" : "s"}, winner picked at random`}
          </p>
        </div>
      )}

      <div className="mx-auto max-w-2xl space-y-4">
        {ranked.map((player, i) => {
          const roster = rosters[player.socketId] || [];
          const isWinner = player.socketId === winnerSocketId;
          return (
            <div key={player.socketId} className={`hoop-card-outline space-y-3 p-5 ${isWinner ? "border-terracotta/50" : ""}`}>
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold text-ink">
                  <span className="hoop-stat-label mr-2">#{i + 1}</span>
                  {player.name}
                  {isWinner && <span className="ml-2 text-xs text-terracotta">Winner</span>}
                </span>
                <span className="hoop-stat-value">
                  {voteCounts[player.socketId] || 0} vote{(voteCounts[player.socketId] || 0) === 1 ? "" : "s"}
                </span>
              </div>
              <ul className="flex flex-wrap gap-1.5">
                {roster.map((p, j) => (
                  <li key={j} className="rounded-md border border-ink/15 bg-paper px-2 py-1 text-xs text-ink">
                    {p.name}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
