import { useEffect, useState } from "react";
import { api } from "../api.js";
import GameCard from "../components/GameCard.jsx";

export default function Games() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .scoreboard()
      .then((d) => {
        setGames(d.games || []);
        if (d.ok === false && d.message) setError(d.message);
      })
      .catch((e) => setError(String(e.message || e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="animate-fade-in space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-white">Games</h1>
        <p className="mt-1 text-slate-400">Live scoreboard from NBA.com via nba_api</p>
      </header>
      {loading && <p className="text-slate-500">Loading…</p>}
      {error && <p className="text-amber-300">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {games.map((g) => (
          <GameCard key={g.game_id} game={g} />
        ))}
      </div>
    </div>
  );
}

