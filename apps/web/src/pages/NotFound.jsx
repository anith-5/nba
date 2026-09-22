import { Link, useLocation } from "react-router-dom";

// A mistyped URL used to render the app shell with an empty content area, which
// looks like a broken page rather than a wrong address. This says what happened
// and offers the routes people are usually reaching for.
const SUGGESTIONS = [
  { to: "/", label: "Home", sub: "Scores, standings and today's games" },
  { to: "/players", label: "Player Search", sub: "Any player, career stats and tools" },
  { to: "/head-to-head", label: "Head-to-Head", sub: "Compare any two player seasons" },
  { to: "/arena", label: "Arena", sub: "Multiplayer basketball games" },
];

export default function NotFound() {
  const { pathname } = useLocation();

  return (
    <div className="animate-fade-in max-w-2xl space-y-6">
      <header>
        <p className="hoop-stat-label text-terracotta">Error 404</p>
        <h1 className="mt-1 text-3xl font-bold text-ink">That page doesn&apos;t exist</h1>
        <p className="mt-2 text-ink/70">
          Nothing is served at{" "}
          {/* The path is echoed as text, never as markup -- React escapes it, so a
              crafted URL cannot inject anything into this page. */}
          <code className="rounded bg-ink/5 px-1.5 py-0.5 font-mono text-sm text-ink">{pathname}</code>.
          It may have moved, or the link that sent you here may be out of date.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <Link key={s.to} to={s.to} className="hoop-card-outline-hover group p-4">
            <p className="flex items-center gap-1 font-semibold text-ink">
              {s.label}
              <span className="text-terracotta transition-transform group-hover:translate-x-0.5">→</span>
            </p>
            <p className="mt-0.5 text-xs text-ink/60">{s.sub}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
