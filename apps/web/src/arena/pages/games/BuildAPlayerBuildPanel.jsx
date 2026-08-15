import { TRAIT_DEFS, gradeColorClass } from "../../data/buildAPlayerTraits.js";

// Everyone's build-in-progress, live -- fully public by design (see
// sanitize.js's sanitizeBuildAPlayer), unlike Closest To's Blind Mode.
export default function BuildAPlayerBuildPanel({ gameState, players, myId }) {
  const { builds, doneSocketIds, config } = gameState;

  return (
    <div className="space-y-4">
      {players.map((player) => {
        const build = builds[player.socketId] || {};
        const filledCount = Object.keys(build).length;
        const isDone = doneSocketIds.includes(player.socketId);

        return (
          <div key={player.socketId} className={`hoop-card-outline space-y-2 p-4 ${player.socketId === myId ? "border-terracotta/50" : ""}`}>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-ink">
                {player.name}
                {player.socketId === myId && <span className="ml-1 text-xs text-terracotta">(you)</span>}
                {player.connected === false && <span className="ml-2 text-xs text-ink/50">(disconnected)</span>}
              </span>
              <span className="text-xs text-ink/60">{isDone ? "Done" : `${filledCount} of ${config.traitSlotCount}`}</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {TRAIT_DEFS.map(({ key, label }) => {
                const entry = build[key];
                return (
                  <div
                    key={key}
                    className={`flex items-center justify-between gap-1 rounded-md border px-1.5 py-1 ${gradeColorClass(entry?.grade)}`}
                  >
                    <p className="truncate text-[9px] uppercase text-ink/60">{label}</p>
                    <p className="shrink-0 text-xs font-bold text-ink">{entry ? entry.grade : "—"}</p>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
