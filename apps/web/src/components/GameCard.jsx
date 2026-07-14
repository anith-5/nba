import { TeamTile } from "./TeamTile.jsx";

function classify(game) {
  const s = String(game.status || "").toLowerCase();
  if (s.includes("final")) return "final";
  if (game.period || game.clock || s.includes("q") || s.includes("live") || s.includes("half"))
    return "live";
  return "upcoming";
}

function Row({ team, live, leading }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <TeamTile tricode={team.tricode} size="sm" />
        <div className="min-w-0">
          <p className="truncate font-display font-semibold text-white">{team.tricode}</p>
          <p className="text-xs text-slate-500">
            {team.wins}-{team.losses}
          </p>
        </div>
      </div>
      <span
        className={`stat-value tabular-nums ${
          live ? "text-live-glow" : leading ? "text-white" : "text-slate-300"
        }`}
      >
        {team.score ?? "—"}
      </span>
    </div>
  );
}

export default function GameCard({ game }) {
  const { home, away, status, period, clock } = game;
  const state = classify(game);
  const homeLead = Number(home.score) > Number(away.score);

  return (
    <article className="card-hover animate-slide-up p-4">
      <div className="mb-3 flex items-center justify-between">
        {state === "live" ? (
          <span className="live-badge">
            <span className="live-dot" />
            Live
          </span>
        ) : state === "final" ? (
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Final
          </span>
        ) : (
          <span className="text-xs font-medium text-slate-500">{status || "Scheduled"}</span>
        )}
        {state === "live" && (period || clock) && (
          <span className="font-mono text-xs text-live-glow">
            Q{period} · {clock}
          </span>
        )}
      </div>

      <div className="space-y-3">
        <Row team={away} live={state === "live"} leading={!homeLead && state !== "upcoming"} />
        <Row team={home} live={state === "live"} leading={homeLead && state !== "upcoming"} />
      </div>
    </article>
  );
}
