// Everyone's roster-in-progress, live during drafting -- full transparency
// by design (see sanitize.js's sanitizeThemedDraft), unlike Hint Auction's
// slot-map roster this is a plain ordered list since Themed Draft has no
// positions to fill, just a fixed number of picks.
export default function ThemedDraftRosterPanel({ gameState, players, myId }) {
  const { rosters, config } = gameState;

  return (
    <div className="space-y-4">
      {players.map((player) => {
        const roster = rosters[player.socketId] || [];
        return (
          <div key={player.socketId} className={`card space-y-2 p-4 ${player.socketId === myId ? "border-court/50" : ""}`}>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">
                {player.name}
                {player.socketId === myId && <span className="ml-1 text-xs text-court-glow">(you)</span>}
                {player.connected === false && <span className="ml-2 text-xs text-slate-600">(disconnected)</span>}
              </span>
              <span className="text-xs text-slate-500">
                {roster.length} of {config.rosterSize}
              </span>
            </div>
            <ul className="space-y-1">
              {roster.map((p, i) => (
                <li key={i} className="rounded-md border border-court/40 bg-court/10 px-2 py-1 text-xs text-white">
                  {p.name}
                </li>
              ))}
              {Array.from({ length: Math.max(0, config.rosterSize - roster.length) }).map((_, i) => (
                <li key={`empty-${i}`} className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-600">
                  —
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
