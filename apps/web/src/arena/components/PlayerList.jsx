export default function PlayerList({ players, hostSocketId }) {
  return (
    <ul className="space-y-2">
      {players.map((player) => (
        <li
          key={player.socketId}
          className="hoop-card-outline flex items-center justify-between px-4 py-2 text-sm"
        >
          <span className={player.connected === false ? "text-ink/50 line-through" : "text-ink"}>
            {player.name}
            {player.connected === false && " (disconnected)"}
          </span>
          {player.socketId === hostSocketId && (
            <span className="hoop-stat-label text-terracotta">Host</span>
          )}
        </li>
      ))}
    </ul>
  );
}
