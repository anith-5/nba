import { useParams } from "react-router-dom";
import { useSocket } from "../../socket/useSocket.js";
import { formatStatValue } from "../../data/statCategories.js";
import OverUnderRoundCard from "./OverUnderRoundCard.jsx";
import OverUnderLeaderboard from "./OverUnderLeaderboard.jsx";

function copyResultsToClipboard(room) {
  const { gameState } = room;
  const lines = [
    `HoopIQ Arena — Over/Under results (${gameState.rounds.length} rounds)`,
    ...room.players.map((p) => `${p.name}: ${gameState.scores[p.socketId] || 0} pts`),
    "",
    ...gameState.rounds.map(
      (r, i) =>
        `Round ${i + 1}: ${r.player.name} ${r.statLabel} ${formatStatValue(r.line, r.statFormat)} — actual ${formatStatValue(r.actualValue, r.statFormat)}`
    ),
  ];
  navigator.clipboard?.writeText(lines.join("\n"));
}

export default function OverUnder() {
  const { code } = useParams();
  const { room, myId, sendGameAction } = useSocket();

  if (!room || !room.gameState) {
    return (
      <p className="text-ink/70">
        No active game found for <span className="font-mono text-ink">{code}</span>.
      </p>
    );
  }

  const { gameState, status } = room;
  const isHost = myId === room.hostSocketId;

  if (status === "finished") {
    return (
      <div className="animate-fade-in mx-auto max-w-lg space-y-6 text-center">
        <h1 className="text-3xl font-bold text-ink">Final Results</h1>
        <OverUnderLeaderboard players={room.players} scores={gameState.scores} />
        <div className="space-y-2 text-left">
          <p className="hoop-stat-label">Round by round</p>
          {gameState.rounds.map((r, i) => (
            <div key={i} className="hoop-card-outline px-4 py-2 text-sm text-ink">
              Round {i + 1}: {r.player.name} — {r.statLabel} line {formatStatValue(r.line, r.statFormat)}, actual{" "}
              {formatStatValue(r.actualValue, r.statFormat)}
            </div>
          ))}
        </div>
        <button onClick={() => copyResultsToClipboard(room)} className="hoop-btn-primary">
          Share Results
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">
          Round {gameState.roundIndex + 1} of {gameState.config.rounds}
        </h1>
      </header>

      <OverUnderRoundCard
        round={gameState.currentRound}
        players={room.players}
        myId={myId}
        timerSeconds={gameState.config.timerSeconds}
        onVote={(vote) => sendGameAction("submit_vote", { vote })}
      />

      {isHost && gameState.currentRound?.revealed && (
        <div className="text-center">
          <button onClick={() => sendGameAction("request_next_round")} className="hoop-btn-ghost">
            Next Round
          </button>
        </div>
      )}

      <div className="mx-auto max-w-sm">
        <p className="hoop-stat-label mb-2 text-center">Leaderboard</p>
        <OverUnderLeaderboard players={room.players} scores={gameState.scores} />
      </div>
    </div>
  );
}
