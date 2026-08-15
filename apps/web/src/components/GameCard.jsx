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
          <p className="truncate font-hoop font-semibold text-ink">{team.tricode}</p>
          <p className="text-xs text-ink/50">
            {team.wins}-{team.losses}
          </p>
        </div>
      </div>
      <span
        className={`hoop-stat-value tabular-nums ${
          live ? "text-terracotta" : leading ? "text-ink" : "text-ink/50"
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
    <article className="hoop-card-outline-hover animate-slide-up p-4">
      <div className="mb-3 flex items-center justify-between">
        {state === "live" ? (
          <span className="hoop-badge bg-terracotta text-paper">
            <span className="inline-block h-2 w-2 rounded-full bg-paper motion-safe:animate-pulse-live" />
            Live
          </span>
        ) : state === "final" ? (
          <span className="text-xs font-semibold uppercase tracking-wide text-ink/60">
            Final
          </span>
        ) : (
          <span className="text-xs font-medium text-ink/50">{status || "Scheduled"}</span>
        )}
        {state === "live" && (period || clock) && (
          <span className="font-mono text-xs font-semibold text-terracotta">
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
