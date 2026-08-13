import { useMemo, useState } from "react";

const ALL_SLOTS_ORDER = ["PG", "SG", "SF", "PF", "C", "BENCH"];

// Picks are never position-gated -- any player can go into any OPEN slot,
// so this is a two-step flow: pick a player, then choose which currently
// open slot to place them in. Fit is scored later (see eightyTwoOh.js's
// computeRecord), never enforced here.
export default function EightyTwoOhPlayerPicker({ players, lineup, benchEnabled, onConfirmPick }) {
  const [search, setSearch] = useState("");
  const [expandedPlayerId, setExpandedPlayerId] = useState(null);

  const slots = ALL_SLOTS_ORDER.filter((s) => s !== "BENCH" || benchEnabled);
  const openSlots = slots.filter((s) => !lineup[s]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return players;
    return players.filter((p) => p.name.toLowerCase().includes(q));
  }, [players, search]);

  if (openSlots.length === 0) {
    return (
      <p className="text-center text-sm text-slate-500">
        Every slot is filled — reassign players on the lineup board below if you want to swap someone in from here.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search players…"
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-court"
      />
      <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
        {filtered.map((p) => (
          <div key={p.player_id} className="rounded-lg border border-slate-800 bg-slate-950 p-2">
            <button
              type="button"
              className="flex w-full items-center justify-between text-left text-sm text-white"
              onClick={() => setExpandedPlayerId(expandedPlayerId === p.player_id ? null : p.player_id)}
            >
              <span>
                {p.name} <span className="text-xs text-slate-500">({p.position})</span>
              </span>
              <span className="text-xs text-slate-400">
                {p.ppg} PPG / {p.apg} APG / {p.rpg} RPG
              </span>
            </button>
            {expandedPlayerId === p.player_id && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {openSlots.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    className="btn-ghost px-2 py-1 text-xs"
                    onClick={() => onConfirmPick({ playerId: p.player_id, position: slot })}
                  >
                    Add at {slot}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && <p className="py-4 text-center text-sm text-slate-600">No players match your search.</p>}
      </div>
    </div>
  );
}
