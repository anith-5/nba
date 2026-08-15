import { useNavigate, useParams } from "react-router-dom";
import { useSocket } from "../../socket/useSocket.js";
import HintAuctionMysteryCard from "./HintAuctionMysteryCard.jsx";
import HintAuctionBidPanel from "./HintAuctionBidPanel.jsx";
import HintAuctionRosterBoard from "./HintAuctionRosterBoard.jsx";
import HintAuctionResults from "./HintAuctionResults.jsx";

export default function HintAuction() {
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
        <HintAuctionResults gameState={gameState} players={room.players} />
        <div className="text-center">
          <button onClick={handleNewGame} className="hoop-btn-ghost">
            New Game
          </button>
        </div>
      </div>
    );
  }

  if (gameState.phase === "awaiting_configure" || !gameState.currentRound) {
    return <p className="text-center text-ink/70">Setting up the draft…</p>;
  }

  const round = gameState.currentRound;
  const config = gameState.config;
  const myRoster = gameState.rosters[myId] || {};
  const myRosterFull = Object.values(myRoster).every((entry) => entry);
  const myBudget = gameState.budgets[myId] ?? config.budget;

  return (
    <div className="animate-fade-in space-y-6">
      <header className="text-center">
        <h1 className="text-xl font-bold text-ink">
          Round {gameState.roundNumber} of {gameState.totalRounds}
        </h1>
        <p className="mt-1 text-xs text-ink/60">{config.era === "current" ? "Current Rosters" : "All-Time"} draft</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <HintAuctionMysteryCard round={round} players={room.players} />

          {!round.resolved &&
            (round.subPhase === "auction" ? (
              <HintAuctionBidPanel
                round={round}
                myId={myId}
                players={room.players}
                myBudget={myBudget}
                myRosterFull={myRosterFull}
                auctionTimerSeconds={config.auctionTimerSeconds}
                onPlaceBid={(amount) => sendGameAction("place_bid", { amount })}
              />
            ) : (
              <p className="text-center text-sm text-ink/60">Bidding opens once every hint has been revealed…</p>
            ))}
        </div>

        <div>
          <p className="hoop-stat-label mb-2 text-center lg:text-left">Rosters</p>
          <HintAuctionRosterBoard players={room.players} rosters={gameState.rosters} budgets={gameState.budgets} myId={myId} />
        </div>
      </div>
    </div>
  );
}
