import { useNavigate, useParams } from "react-router-dom";
import { useSocket } from "../../socket/useSocket.js";
import FiveHintsMysteryCard from "./FiveHintsMysteryCard.jsx";
import FiveHintsBuzzPanel from "./FiveHintsBuzzPanel.jsx";
import FiveHintsCasualPanel from "./FiveHintsCasualPanel.jsx";
import { FiveHintsFinalResults } from "./FiveHintsResults.jsx";
import OverUnderLeaderboard from "./OverUnderLeaderboard.jsx";

export default function FiveHints() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { room, myId, sendGameAction, leaveRoom } = useSocket();

  const gameState = room?.gameState;
  const isHost = room && myId === room.hostSocketId;

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
        <FiveHintsFinalResults gameState={gameState} players={room.players} />
        <div className="text-center">
          <button onClick={handleNewGame} className="btn-ghost">
            New Game
          </button>
        </div>
      </div>
    );
  }

  if (gameState.phase === "awaiting_configure" || !gameState.currentRound) {
    return <p className="text-center text-slate-400">Setting up the round…</p>;
  }

  const round = gameState.currentRound;
  const config = gameState.config;

  const canRevealNextHint =
    isHost &&
    config.hintTiming === "host" &&
    !round.resolved &&
    (config.buzzStyle === "competitive"
      ? round.subPhase === "open"
      : round.lastHintReveal?.hintNumber === round.hintNumber);

  return (
    <div className="animate-fade-in space-y-6">
      <header className="text-center">
        <h1 className="text-xl font-bold text-white">
          Round {gameState.roundNumber} of {gameState.totalRounds}
        </h1>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <FiveHintsMysteryCard round={round} maxHints={config.maxHints} winners={round.winners || []} players={room.players} />

          {!round.resolved &&
            (config.buzzStyle === "competitive" ? (
              <FiveHintsBuzzPanel
                round={round}
                myId={myId}
                players={room.players}
                onBuzzIn={() => sendGameAction("buzz_in")}
                onSubmitGuess={(guess) => sendGameAction("submit_guess", { guess })}
              />
            ) : (
              <FiveHintsCasualPanel
                round={round}
                myId={myId}
                players={room.players}
                onSubmitGuess={(guess) => sendGameAction("submit_guess", { guess })}
                onPass={() => sendGameAction("pass_turn")}
              />
            ))}

          <div className="flex justify-center gap-3">
            {canRevealNextHint && (
              <button onClick={() => sendGameAction("reveal_hint")} className="btn-ghost">
                Reveal Next Hint
              </button>
            )}
            {round.resolved &&
              (isHost ? (
                <button onClick={() => sendGameAction("next_round")} className="btn-primary">
                  Next Round
                </button>
              ) : (
                <p className="text-sm text-slate-500">Waiting for the host to continue…</p>
              ))}
          </div>
        </div>

        <div>
          <p className="stat-label mb-2 text-center lg:text-left">Leaderboard</p>
          <OverUnderLeaderboard players={room.players} scores={gameState.scores} />
        </div>
      </div>
    </div>
  );
}
