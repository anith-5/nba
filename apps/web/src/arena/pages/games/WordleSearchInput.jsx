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
        className="w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 text-ink outline-none focus:border-terracotta disabled:opacity-50"
      />
      {matches.length > 0 && (
        <ul className="hoop-card-outline absolute z-10 mt-1 w-full overflow-hidden">
          {matches.map((p) => (
            <li key={p.player_id}>
              <button
                type="button"
                onClick={() => handleSelect(p)}
                className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-ink/5"
              >
                {p.name} <span className="text-ink/60">— {p.team_abbreviation}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
