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
          <div key={player.socketId} className={`hoop-card-outline space-y-2 p-4 ${player.socketId === myId ? "border-terracotta/50" : ""}`}>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-ink">
                {player.name}
                {player.socketId === myId && <span className="ml-1 text-xs text-terracotta">(you)</span>}
                {player.connected === false && <span className="ml-2 text-xs text-ink/50">(disconnected)</span>}
              </span>
              <span className="text-xs text-ink/60">
                {roster.length} of {config.rosterSize}
              </span>
            </div>
            <ul className="space-y-1">
              {roster.map((p, i) => (
                <li key={i} className="rounded-md border border-terracotta/40 bg-terracotta/10 px-2 py-1 text-xs text-ink">
                  {p.name}
                </li>
              ))}
              {Array.from({ length: Math.max(0, config.rosterSize - roster.length) }).map((_, i) => (
                <li key={`empty-${i}`} className="rounded-md border border-ink/15 bg-paper px-2 py-1 text-xs text-ink/50">
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
