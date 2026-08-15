// Final recap: every derived stat here (spend totals, combined roster PPG,
// cost-per-point, the "Steal of the Draft" callout) is computed at render
// time from the raw roundHistory/budgets the server already broadcast --
// same pattern as FiveHintsResults' averageHintNumber, nothing precomputed
// server-side.
export default function HintAuctionResults({ gameState, players }) {
  const { roundHistory, budgets, config } = gameState;

  const picksByPlayer = {};
  for (const p of players) picksByPlayer[p.socketId] = [];
  for (const entry of roundHistory) {
    if (entry.unsold || !entry.winnerSocketId) continue;
    if (!picksByPlayer[entry.winnerSocketId]) picksByPlayer[entry.winnerSocketId] = [];
    picksByPlayer[entry.winnerSocketId].push(entry);
  }

  const summaries = players.map((player) => {
    const picks = picksByPlayer[player.socketId] || [];
    const totalSpent = picks.reduce((sum, e) => sum + (e.winningBid || 0), 0);
    const statTotal = picks.reduce((sum, e) => sum + (e.statLine || 0), 0);
    const unspent = budgets[player.socketId] ?? 0;
    const costPerPoint = statTotal > 0 ? totalSpent / statTotal : null;
    return { player, picks, totalSpent, statTotal, unspent, costPerPoint };
  });

  const ranked = [...summaries].sort((a, b) => b.statTotal - a.statTotal);

  // Lowest price-per-stat-point across every sold pick in the game. Both
  // price>0 and statLine>0 are required so a token bid on a barely-played
  // scrub doesn't trivially "win" the callout on a technicality.
  const allSoldPicks = roundHistory.filter((e) => !e.unsold && e.winningBid > 0 && e.statLine > 0);
  const steal = allSoldPicks.length
    ? allSoldPicks.reduce((best, e) => (e.winningBid / e.statLine < best.winningBid / best.statLine ? e : best))
    : null;
  const stealOwnerName = steal ? players.find((p) => p.socketId === steal.winnerSocketId)?.name : null;

  const statLabel = config.era === "current" ? "PPG this season" : "career PPG";

  return (
    <div className="animate-fade-in space-y-6">
      <header className="text-center">
        <h1 className="text-2xl font-bold text-ink">Draft Results</h1>
        <p className="mt-1 text-sm text-ink/70">Ranked by combined roster {statLabel}</p>
      </header>

      {steal && (
        <div className="hoop-card-outline mx-auto max-w-lg space-y-1 p-5 text-center">
          <p className="hoop-stat-label">Steal of the Draft</p>
          <p className="text-lg text-ink">
            {stealOwnerName} got <span className="font-semibold text-terracotta">{steal.playerName}</span> for just {steal.winningBid}
          </p>
          <p className="text-xs text-ink/60">
            {steal.statLine.toFixed(1)} {statLabel} at {(steal.winningBid / steal.statLine).toFixed(2)} per point
          </p>
        </div>
      )}

      <div className="mx-auto max-w-2xl space-y-4">
        {ranked.map(({ player, picks, totalSpent, statTotal, unspent, costPerPoint }, i) => (
          <div key={player.socketId} className="hoop-card-outline space-y-3 p-5">
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold text-ink">
                <span className="hoop-stat-label mr-2">#{i + 1}</span>
                {player.name}
              </span>
              <span className="hoop-stat-value">
                {statTotal.toFixed(1)} {statLabel}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink/70">
              <span>Spent: {totalSpent}</span>
              <span>Unspent: {unspent}</span>
              {costPerPoint !== null && <span>Cost/point: {costPerPoint.toFixed(2)}</span>}
            </div>
            <ul className="space-y-1">
              {picks.map((pick) => (
                <li
                  key={pick.round}
                  className="flex items-center justify-between rounded-lg border border-ink/15 bg-paper px-3 py-1.5 text-sm"
                >
                  <span className="text-ink">
                    {pick.playerName} <span className="text-ink/60">({pick.assignedSlot})</span>
                  </span>
                  <span className="text-ink/70">${pick.winningBid}</span>
                </li>
              ))}
              {picks.length === 0 && <li className="text-xs text-ink/50">No players won.</li>}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
