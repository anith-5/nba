import { useState } from "react";

// Live nba_api names keep real diacritics (e.g. "Nikola Jokić", "Luka Dončić").
// Most people type the plain-ASCII spelling, so strip accents from both sides
// before matching rather than requiring an exact character match.
function normalize(str) {
  return str
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export default function WordleSearchInput({ players, guessedIds, onSelect, disabled }) {
  const [query, setQuery] = useState("");

  const matches =
    query.trim().length > 0
      ? players
          .filter((p) => !guessedIds.has(p.player_id) && normalize(p.name).includes(normalize(query)))
          .slice(0, 8)
      : [];

  function handleSelect(player) {
    onSelect(player);
    setQuery("");
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={disabled}
        placeholder="Type a player name to guess…"
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-court disabled:opacity-50"
      />
      {matches.length > 0 && (
        <ul className="card absolute z-10 mt-1 w-full overflow-hidden">
          {matches.map((p) => (
            <li key={p.player_id}>
              <button
                type="button"
                onClick={() => handleSelect(p)}
                className="block w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800"
              >
                {p.name} <span className="text-slate-500">— {p.team_abbreviation}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
