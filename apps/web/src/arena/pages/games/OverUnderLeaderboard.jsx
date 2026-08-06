export default function OverUnderLeaderboard({ players, scores }) {
  const ranked = [...players].sort((a, b) => (scores[b.socketId] || 0) - (scores[a.socketId] || 0));

  return (
    <ol className="space-y-2">
      {ranked.map((player, i) => (
        <li key={player.socketId} className="card flex items-center justify-between px-4 py-2">
          <span className="text-white">
            <span className="stat-label mr-2">#{i + 1}</span>
            {player.name}
            {player.connected === false && <span className="ml-2 text-xs text-slate-600">(disconnected)</span>}
          </span>
          <span className="stat-value">{scores[player.socketId] || 0}</span>
        </li>
      ))}
    </ol>
  );
}
