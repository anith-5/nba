const SLOT_ORDER = ["PG", "SG", "SF", "PF", "C", "BENCH"];

// Everyone's roster-in-progress, live during play and reused as-is on the
// final results screen -- unlike Five Hints/Over Under's numeric-score
// OverUnderLeaderboard, "who's winning" here is about budget management and
// roster completeness, not a single sortable number, so this is a dedicated
// component rather than a reuse of that sidebar.
export default function HintAuctionRosterBoard({ players, rosters, budgets, myId }) {
  return (
    <div className="space-y-4">
      {players.map((player) => {
        const roster = rosters[player.socketId] || {};
        const slots = SLOT_ORDER.filter((slot) => slot in roster);
        const filledCount = slots.filter((slot) => roster[slot]).length;

        return (
          <div key={player.socketId} className={`card space-y-2 p-4 ${player.socketId === myId ? "border-court/50" : ""}`}>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">
                {player.name}
                {player.socketId === myId && <span className="ml-1 text-xs text-court-glow">(you)</span>}
                {player.connected === false && <span className="ml-2 text-xs text-slate-600">(disconnected)</span>}
              </span>
              <span className="stat-value text-sm">${budgets[player.socketId] ?? 0}</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
              {slots.map((slot) => {
                const entry = roster[slot];
                return (
                  <div
                    key={slot}
                    className={`rounded-md border px-1.5 py-1 text-center ${
                      entry ? "border-court/40 bg-court/10" : "border-slate-800 bg-slate-950"
                    }`}
                  >
                    <p className="text-[10px] uppercase text-slate-500">{slot}</p>
                    <p className="truncate text-xs text-white">{entry ? entry.playerName.split(" ").pop() : "—"}</p>
                  </div>
                );
              })}
            </div>
            <p className="text-right text-xs text-slate-500">
              {filledCount} of {slots.length} filled
            </p>
          </div>
        );
      })}
    </div>
  );
}
