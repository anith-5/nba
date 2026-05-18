import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import GameCard from "../components/GameCard.jsx";

const pillars = [
  { title: "AI Predictions", desc: "Win probability, projected scores, upset alerts", to: "/predictions" },
  { title: "Trade Machine", desc: "Cap-aware trades with front-office grades", to: "/trade" },
  { title: "Shot Lab", desc: "Heat maps & efficiency zones (coming soon)", to: "/players" },
  { title: "GM Simulator", desc: "Build a dynasty against AI teams", to: "/sim" },
  { title: "Research Hub", desc: "Original stats & ML findings", to: "/research" },
  { title: "Community", desc: "Trades, mocks, leaderboards (Phase 5)", to: "/games" },
];

export default function Home() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .scoreboard()
      .then((d) => {
        setGames(d.games || []);
        if (d.ok === false && d.message) {
          setError(d.message);
        }
      })
      .catch((e) => {
        const msg = String(e.message || e);
        if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
          setError(
            "Cannot reach the API. Start it with: cd services\\api && uvicorn app.main:app --port 8001"
          );
        } else {
          setError(msg);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="animate-fade-in space-y-10">
      <header>
        <p className="text-sm font-medium text-court">NBA Analytics Platform</p>
        <h1 className="mt-1 text-4xl font-bold tracking-tight text-white">
          Data-driven basketball intelligence
        </h1>
        <p className="mt-3 max-w-2xl text-slate-400">
          Simulate trades, predict games, analyze players, and publish original research — built by
          students with custom models and live NBA data.
        </p>
      </header>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Today&apos;s games</h2>
          <Link to="/games" className="text-sm text-court hover:text-court-glow">
            View all →
          </Link>
        </div>
        {loading && <p className="text-slate-500">Loading live scoreboard…</p>}
        {error && (
          <p className="rounded-lg border border-amber-900/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
            {error}. Make sure the API is running on port 8001:{" "}
            <code className="font-mono">cd services\api && uvicorn app.main:app --port 8001</code>
          </p>
        )}
        {!loading && !error && games.length === 0 && (
          <p className="text-slate-500">No games on today&apos;s slate.</p>
        )}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {games.slice(0, 6).map((g) => (
            <GameCard key={g.game_id} game={g} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-white">Platform pillars</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pillars.map((p) => (
            <Link key={p.to} to={p.to} className="card-hover block p-5">
              <h3 className="font-semibold text-white">{p.title}</h3>
              <p className="mt-1 text-sm text-slate-400">{p.desc}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
