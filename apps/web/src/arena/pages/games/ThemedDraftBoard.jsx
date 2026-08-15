import { useMemo, useState } from "react";
import Timer from "../../components/Timer.jsx";

// The draft board: whose turn it is, the pick timer (if the host enabled
// one), and the searchable/filterable available pool -- which is already
// the theme-filtered, shrinking-as-picks-happen array the server computes
// once in beginDraft and broadcasts as-is (see themedDraft.js), so no
// client-side filtering logic is duplicated here beyond the search box
// itself.
export default function ThemedDraftBoard({ gameState, players, myId, onMakePick }) {
  const [search, setSearch] = useState("");
  const currentSocketId = gameState.pickSequence[gameState.currentPickIndex];
  const isMyTurn = currentSocketId === myId;
  const currentPlayerName = players.find((p) => p.socketId === currentSocketId)?.name || "Someone";
  const turnTimerSeconds = gameState.config.turnTimerSeconds;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return gameState.availablePool;
    return gameState.availablePool.filter((p) => p.name.toLowerCase().includes(q));
  }, [gameState.availablePool, search]);

  return (
    <div className="space-y-4">
      <div className="hoop-card-outline flex items-center justify-between p-4">
        <div>
          <p className="hoop-stat-label">On the Clock</p>
          <p className="text-lg font-semibold text-ink">{isMyTurn ? "Your pick" : `${currentPlayerName}'s pick`}</p>
        </div>
        {turnTimerSeconds && gameState.pickDeadlineAt && (
          <Timer startedAt={gameState.pickDeadlineAt - turnTimerSeconds * 1000} durationSeconds={turnTimerSeconds} />
        )}
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search available players…"
        className="w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 text-ink outline-none focus:border-terracotta"
      />

      <div className="max-h-[28rem] space-y-1.5 overflow-y-auto pr-1">
        {filtered.map((p) => (
          <button
            key={p.player_id}
            type="button"
            disabled={!isMyTurn}
            onClick={() => onMakePick(p.player_id)}
            className="flex w-full items-center justify-between rounded-lg border border-ink/15 bg-paper px-3 py-2 text-left text-sm text-ink transition hover:border-terracotta/50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span>{p.name}</span>
            <span className="text-xs text-ink/60">{p.position || p.team_abbreviation || ""}</span>
          </button>
        ))}
        {filtered.length === 0 && <p className="py-4 text-center text-sm text-ink/50">No players match your search.</p>}
      </div>
    </div>
  );
}
