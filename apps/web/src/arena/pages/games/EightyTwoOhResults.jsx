const SLOT_ORDER = ["PG", "SG", "SF", "PF", "C", "BENCH"];

function pct(n) {
  return `${n >= 0 ? "+" : ""}${n}%`;
}

// Final lineups + records + the full skill/fit/chemistry breakdown -- the
// server already computed everything in computeRecord, this is pure
// display so the record doesn't feel like a black box.
export default function EightyTwoOhResults({ gameState, players }) {
  const results = gameState.results || {};
  const slots = SLOT_ORDER.filter((s) => s !== "BENCH" || gameState.benchEnabled);

  const ranked = [...players]
    .filter((p) => results[p.socketId])
    .sort((a, b) => results[b.socketId].wins - results[a.socketId].wins);

  return (
    <div className="animate-fade-in space-y-6">
      <header className="text-center">
        <h1 className="text-2xl font-bold text-ink">NBA 82-0 Results</h1>
        <p className="mt-1 text-sm text-ink/70">Projected records, ranked</p>
      </header>

      <div className="mx-auto max-w-2xl space-y-4">
        {ranked.map((player, i) => {
          const result = results[player.socketId];
          return (
            <div key={player.socketId} className="hoop-card-outline space-y-3 p-5">
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold text-ink">
                  <span className="hoop-stat-label mr-2">#{i + 1}</span>
                  {player.name}
                </span>
                <span className="hoop-stat-value text-xl">{result.record}</span>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {slots.map((slot) => {
                  const occ = result.lineup[slot];
                  return (
                    <div key={slot} className="rounded-md border border-ink/15 bg-paper px-2 py-1.5 text-center">
                      <p className="text-[10px] uppercase text-ink/60">{slot}</p>
                      {occ ? (
                        <>
                          <p className="truncate text-xs text-ink">{occ.name}</p>
                          <p className="truncate text-[10px] text-ink/60">
                            {occ.teamName} · {occ.decade}s
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-ink/50">—</p>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-ink/15 bg-paper p-3 text-xs text-ink/70 sm:grid-cols-4">
                <span>Skill Score: {result.breakdown.baseSkillScore}</span>
                <span>Fit: {pct(result.breakdown.fitBonusPct)}</span>
                <span>
                  Chemistry: {pct(result.breakdown.eraBonusPct)} ({result.breakdown.distinctDecades} decade
                  {result.breakdown.distinctDecades === 1 ? "" : "s"})
                </span>
                <span>Variance: {pct(result.breakdown.variancePct)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
