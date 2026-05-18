export default function GameCard({ game }) {
  const { home, away, status, period, clock } = game;
  return (
    <article className="card-hover animate-slide-up p-4">
      <p className="mb-3 text-xs font-medium text-slate-500">{status}</p>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-white">
              {away.tricode} <span className="text-slate-500 font-normal">{away.name}</span>
            </p>
            <p className="text-xs text-slate-500">
              {away.wins}-{away.losses}
            </p>
          </div>
          <span className="stat-value">{away.score ?? "—"}</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-white">
              {home.tricode} <span className="text-slate-500 font-normal">{home.name}</span>
            </p>
            <p className="text-xs text-slate-500">
              {home.wins}-{home.losses}
            </p>
          </div>
          <span className="stat-value text-court-glow">{home.score ?? "—"}</span>
        </div>
      </div>
      {(period || clock) && (
        <p className="mt-3 font-mono text-xs text-slate-500">
          Q{period} · {clock}
        </p>
      )}
    </article>
  );
}
