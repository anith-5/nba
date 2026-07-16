const POSITION_ORDER = ["PG", "SG", "SF", "PF", "C"];

// The waiting screen shown once a player has confirmed all 5 of their
// picks: their completed lineup and a live "X of Y done" counter fed by the
// room-wide gameState (redacted to just done/filledCount per player while
// the round is still in progress, per sanitize.js). Blind Mode: no PPG or
// running total appears here — that's only revealed once everyone finishes
// (see ClosestToReveal.jsx).
export default function ClosestToLeaderboard({ myState, players, playerLineups }) {
  const connected = players.filter((p) => p.connected);
  const doneCount = connected.filter((p) => playerLineups[p.socketId]?.done).length;

  return (
    <div className="animate-fade-in mx-auto max-w-lg space-y-6 text-center">
      <h1 className="text-2xl font-bold text-white">Lineup Complete</h1>
      <p className="text-slate-400">Waiting for everyone else to finish their lineup…</p>

      <div className="card space-y-3 p-5 text-left">
        <p className="stat-label">Your Lineup</p>
        <div className="grid grid-cols-5 gap-2 text-center">
          {POSITION_ORDER.map((pos) => (
            <div key={pos} className="rounded-lg border border-slate-700 bg-slate-950 p-2">
              <p className="stat-label text-xs">{pos}</p>
              <p className="mt-1 truncate text-xs font-semibold text-white">{myState.lineup[pos]?.name}</p>
              <p className="text-xs text-slate-500">{myState.lineup[pos]?.season}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-5">
        <p className="stat-label">
          {doneCount} of {connected.length} players done
        </p>
        <ul className="mt-3 space-y-1 text-left text-sm text-slate-400">
          {connected.map((p) => (
            <li key={p.socketId} className="flex items-center justify-between">
              <span>{p.name}</span>
              <span>
                {playerLineups[p.socketId]?.done
                  ? "Done"
                  : `${playerLineups[p.socketId]?.filledCount ?? 0} of 5`}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
