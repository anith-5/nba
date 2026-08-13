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
        <h1 className="text-2xl font-bold text-white">NBA 82-0 Results</h1>
        <p className="mt-1 text-sm text-slate-400">Projected records, ranked</p>
      </header>

      <div className="mx-auto max-w-2xl space-y-4">
        {ranked.map((player, i) => {
          const result = results[player.socketId];
          return (
            <div key={player.socketId} className="card space-y-3 p-5">
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold text-white">
                  <span className="stat-label mr-2">#{i + 1}</span>
                  {player.name}
                </span>
                <span className="stat-value text-xl">{result.record}</span>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {slots.map((slot) => {
                  const occ = result.lineup[slot];
                  return (
                    <div key={slot} className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1.5 text-center">
                      <p className="text-[10px] uppercase text-slate-500">{slot}</p>
                      {occ ? (
                        <>
                          <p className="truncate text-xs text-white">{occ.name}</p>
                          <p className="truncate text-[10px] text-slate-500">
                            {occ.teamName} · {occ.decade}s
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-slate-600">—</p>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-400 sm:grid-cols-4">
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
