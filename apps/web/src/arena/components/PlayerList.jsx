export default function PlayerList({ players, hostSocketId }) {
  return (
    <ul className="space-y-2">
      {players.map((player) => (
        <li
          key={player.socketId}
          className="card flex items-center justify-between px-4 py-2 text-sm"
        >
          <span className={player.connected === false ? "text-slate-600 line-through" : "text-white"}>
            {player.name}
            {player.connected === false && " (disconnected)"}
          </span>
          {player.socketId === hostSocketId && (
            <span className="stat-label text-court">Host</span>
          )}
        </li>
      ))}
    </ul>
  );
}
