import { useNavigate, useParams } from "react-router-dom";
import { useSocket } from "../../socket/useSocket.js";
import ThemedDraftBoard from "./ThemedDraftBoard.jsx";
import ThemedDraftRosterPanel from "./ThemedDraftRosterPanel.jsx";
import ThemedDraftVoting from "./ThemedDraftVoting.jsx";
import ThemedDraftResults from "./ThemedDraftResults.jsx";

const CATEGORY_LABELS = {
  team: "Single-Team",
  era: "Era",
  award: "Award Winners",
  archetype: "Archetype",
  "stat-threshold": "Stat Threshold",
  "current-season": "Current Season",
};

export default function ThemedDraft() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { room, myId, sendGameAction, leaveRoom } = useSocket();

  const gameState = room?.gameState;

  if (!room || !gameState) {
    return (
      <p className="text-ink/70">
        No active game found for <span className="font-mono text-ink">{code}</span>.
      </p>
    );
  }

  const { status } = room;

  const handleNewGame = () => {
    leaveRoom();
    navigate("/arena");
  };

  if (status === "finished") {
    return (
      <div className="space-y-6">
        <ThemedDraftResults gameState={gameState} players={room.players} />
        <div className="text-center">
          <button onClick={handleNewGame} className="hoop-btn-ghost">
            New Game
          </button>
        </div>
      </div>
    );
  }

  if (gameState.phase === "voting") {
    return (
      <ThemedDraftVoting
        gameState={gameState}
        players={room.players}
        myId={myId}
        onCastVote={(votedForSocketId) => sendGameAction("cast_vote", { votedForSocketId })}
      />
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <header className="text-center">
        <h1 className="text-xl font-bold text-ink">
          Round {gameState.round} of {gameState.config.rosterSize}
        </h1>
        <p className="mt-1 text-xs text-ink/60">{CATEGORY_LABELS[gameState.config.category] || "Themed"} draft</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ThemedDraftBoard
            gameState={gameState}
            players={room.players}
            myId={myId}
            onMakePick={(playerId) => sendGameAction("make_pick", { playerId })}
          />
        </div>
        <div>
          <p className="hoop-stat-label mb-2 text-center lg:text-left">Rosters</p>
          <ThemedDraftRosterPanel gameState={gameState} players={room.players} myId={myId} />
        </div>
      </div>
    </div>
  );
}
