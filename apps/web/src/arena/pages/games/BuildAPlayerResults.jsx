import { TRAIT_DEFS, GRADE_ORDER, gradeColorClass } from "../../data/buildAPlayerTraits.js";

const GRADE_RANK = Object.fromEntries(GRADE_ORDER.map((g, i) => [g, i]));

// Final custom player cards, ranked by composite grade -- the server already
// computed both the per-trait grades and the composite (average converted
// back to a letter, see buildAPlayer.js's computeCompositeGrade), so this is
// pure display, nothing recomputed client-side.
export default function BuildAPlayerResults({ gameState, players }) {
  const { builds, compositeGrades = {} } = gameState;

  const ranked = [...players].sort(
    (a, b) => (GRADE_RANK[compositeGrades[b.socketId]] ?? -1) - (GRADE_RANK[compositeGrades[a.socketId]] ?? -1)
  );

  return (
    <div className="animate-fade-in space-y-6">
      <header className="text-center">
        <h1 className="text-2xl font-bold text-ink">Build a Player Results</h1>
        <p className="mt-1 text-sm text-ink/70">Ranked by overall composite grade</p>
      </header>

      <div className="mx-auto max-w-2xl space-y-4">
        {ranked.map((player, i) => {
          const build = builds[player.socketId] || {};
          const composite = compositeGrades[player.socketId];
          return (
            <div key={player.socketId} className="hoop-card-outline space-y-3 p-5">
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold text-ink">
                  <span className="hoop-stat-label mr-2">#{i + 1}</span>
                  {player.name}
                </span>
                <span className={`rounded-lg border px-3 py-1 text-xl font-bold ${gradeColorClass(composite)}`}>
                  {composite || "—"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {TRAIT_DEFS.map(({ key, label }) => {
                  const entry = build[key];
                  return (
                    <div key={key} className={`rounded-md border px-2 py-1.5 ${gradeColorClass(entry?.grade)}`}>
                      <p className="text-[10px] uppercase text-ink/60">{label}</p>
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate text-xs text-ink">{entry ? entry.sourcePlayerName : "—"}</span>
                        <span className="text-sm font-bold text-ink">{entry ? entry.grade : ""}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
