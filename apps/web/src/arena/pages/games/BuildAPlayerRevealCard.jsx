import Timer from "../../components/Timer.jsx";
import { TRAIT_DEFS, gradeColorClass } from "../../data/buildAPlayerTraits.js";

// The revealed player + up to 12 graded trait tiles (fewer if some traits
// have no qualified grade this season, e.g. Clutch Performance for a
// low-minutes player -- see rosters.py's _trait_grade_pass). Fully public,
// simultaneous: every not-done connected player sees and acts on the exact
// same reveal each round, not a single active turn like Themed Draft.
export default function BuildAPlayerRevealCard({ gameState, myId, iAmDone, onPickTrait, onPass }) {
  const player = gameState.currentPlayer;
  const myBuild = gameState.builds[myId] || {};
  const iActed = gameState.actedSocketIds.includes(myId);
  const pickTimerSeconds = gameState.config.pickTimerSeconds;

  if (iAmDone) {
    return (
      <div className="card mx-auto max-w-lg space-y-2 p-6 text-center">
        <p className="stat-label">Build Complete</p>
        <p className="text-sm text-slate-400">Your custom player is full — waiting for everyone else to finish.</p>
      </div>
    );
  }

  if (!player) {
    return <p className="text-center text-slate-500">Waiting for the next player…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-1 p-5 text-center">
        <div className="flex items-center justify-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white">{player.name}</h2>
            <p className="text-sm text-slate-400">
              {player.position} — {player.team_full_name}
            </p>
          </div>
          {pickTimerSeconds && gameState.pickDeadlineAt && (
            <Timer startedAt={gameState.pickDeadlineAt - pickTimerSeconds * 1000} durationSeconds={pickTimerSeconds} />
          )}
        </div>
      </div>

      <p className="text-center text-sm text-slate-500">
        {iActed
          ? `${gameState.actedSocketIds.length} acted this round — waiting on the rest…`
          : "Pick one trait for your build, or pass on this player."}
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {TRAIT_DEFS.map(({ key, label }) => {
          const trait = player.traits?.[key];
          if (!trait) return null;
          const alreadyMine = !!myBuild[key];
          const clickable = !iActed && !alreadyMine;
          return (
            <button
              key={key}
              type="button"
              disabled={!clickable}
              onClick={() => onPickTrait(key)}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left transition ${gradeColorClass(trait.grade)} ${
                clickable ? "hover:brightness-125" : "opacity-60"
              }`}
            >
              <span className="text-sm text-white">
                {label}
                {alreadyMine && <span className="ml-1 text-xs">(locked)</span>}
                <span className="block text-[10px] text-slate-400">{trait.percentile}th percentile</span>
              </span>
              <span className="text-lg font-bold">{trait.grade}</span>
            </button>
          );
        })}
      </div>

      {!iActed && (
        <button type="button" onClick={onPass} className="btn-ghost mx-auto block">
          Pass on This Player
        </button>
      )}
    </div>
  );
}
