import { useNavigate, useParams } from "react-router-dom";
import { useSocket } from "../../socket/useSocket.js";
import BuildAPlayerRevealCard from "./BuildAPlayerRevealCard.jsx";
import BuildAPlayerBuildPanel from "./BuildAPlayerBuildPanel.jsx";
import BuildAPlayerResults from "./BuildAPlayerResults.jsx";

export default function BuildAPlayer() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { room, myId, sendGameAction, leaveRoom } = useSocket();

  const gameState = room?.gameState;

  if (!room || !gameState) {
    return (
      <p className="text-slate-400">
        No active game found for <span className="font-mono text-white">{code}</span>.
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
        <BuildAPlayerResults gameState={gameState} players={room.players} />
        <div className="text-center">
          <button onClick={handleNewGame} className="btn-ghost">
            New Game
          </button>
        </div>
      </div>
    );
  }

  const myBuild = gameState.builds[myId] || {};
  const myFilledCount = Object.keys(myBuild).length;
  const iAmDone = gameState.doneSocketIds.includes(myId);

  return (
    <div className="animate-fade-in space-y-6">
      <header className="text-center">
        <h1 className="text-xl font-bold text-white">Round {gameState.roundNumber}</h1>
        <p className="mt-1 text-xs text-slate-500">
          {myFilledCount} of {gameState.config.traitSlotCount} traits locked
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <BuildAPlayerRevealCard
            gameState={gameState}
            myId={myId}
            iAmDone={iAmDone}
            onPickTrait={(traitKey) => sendGameAction("pick_trait", { traitKey })}
            onPass={() => sendGameAction("pass_reveal")}
          />
        </div>
        <div>
          <p className="stat-label mb-2 text-center lg:text-left">Builds</p>
          <BuildAPlayerBuildPanel gameState={gameState} players={room.players} myId={myId} />
        </div>
      </div>
    </div>
  );
}
