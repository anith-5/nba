import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSocket } from "../../socket/useSocket.js";
import EightyTwoOhSpinner from "./EightyTwoOhSpinner.jsx";
import EightyTwoOhLineupBoard from "./EightyTwoOhLineupBoard.jsx";
import EightyTwoOhResults from "./EightyTwoOhResults.jsx";

const SLOT_ORDER = ["PG", "SG", "SF", "PF", "C", "BENCH"];

// Unlike Closest To, there's no Blind Mode redaction here at all -- the
// broadcast gameState already carries each player's full real lineup AND
// their in-progress pendingSpin/respin-token state (see sanitize.js's
// comment on why no branch was added for this game), so this component
// reads room.gameState.playerBuilds[myId] directly as the single source of
// truth for all of that, rather than mirroring a separate local copy the
// way ClosestTo.jsx has to for its Blind-Mode-redacted equivalent. The only
// thing that stays local, private state is the roster list for whatever's
// currently spun -- that's fetched on demand and never broadcast, since
// nobody but the requesting player needs it.
export default function EightyTwoOh() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { socket, room, myId, sendGameAction, leaveRoom } = useSocket();

  const [players, setPlayers] = useState(null);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playersError, setPlayersError] = useState(null);
  const [playersMeta, setPlayersMeta] = useState({ source: null, dataComplete: true, note: null });

  useEffect(() => {
    const onPlayersList = ({ players: list, source, dataComplete, note }) => {
      setPlayers(list);
      setPlayersLoading(false);
      setPlayersError(null);
      setPlayersMeta({ source, dataComplete, note });
    };
    const onTeamPlayersError = ({ message }) => {
      setPlayersLoading(false);
      setPlayersError(message);
      setPlayers(null);
    };

    socket.on("players_list", onPlayersList);
    socket.on("team_players_error", onTeamPlayersError);

    return () => {
      socket.off("players_list", onPlayersList);
      socket.off("team_players_error", onTeamPlayersError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  if (!room || !room.gameState) {
    return (
      <p className="text-slate-400">
        No active game found for <span className="font-mono text-white">{code}</span>.
      </p>
    );
  }

  const { gameState, status } = room;

  const handleNewGame = () => {
    leaveRoom();
    navigate("/arena");
  };

  if (status === "finished") {
    return (
      <div className="space-y-6">
        <EightyTwoOhResults gameState={gameState} players={room.players} />
        <div className="text-center">
          <button onClick={handleNewGame} className="btn-ghost">
            New Game
          </button>
        </div>
      </div>
    );
  }

  const myBuild = gameState.playerBuilds[myId];
  if (!myBuild) return <p className="text-center text-slate-500">Setting up your lineup…</p>;

  const slots = SLOT_ORDER.filter((s) => s !== "BENCH" || gameState.benchEnabled);
  const filledCount = slots.filter((s) => myBuild.lineup[s]).length;
  const requiredCount = slots.length;

  return (
    <div className="animate-fade-in space-y-6">
      <header className="text-center">
        <h1 className="text-xl font-bold text-white">NBA 82-0</h1>
        <p className="mt-1 text-xs text-slate-500">
          {filledCount} of {requiredCount} slots filled
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {!myBuild.done && (
            <EightyTwoOhSpinner
              myBuild={myBuild}
              pendingSpin={myBuild.pendingSpin}
              players={players}
              playersLoading={playersLoading}
              playersError={playersError}
              playersMeta={playersMeta}
              benchEnabled={gameState.benchEnabled}
              onSpin={() => {
                setPlayers(null);
                setPlayersError(null);
                sendGameAction("spin");
              }}
              onRespinDecade={() => {
                setPlayers(null);
                setPlayersError(null);
                sendGameAction("respin_decade");
              }}
              onRespinTeam={() => {
                setPlayers(null);
                setPlayersError(null);
                sendGameAction("respin_team");
              }}
              onRequestPlayers={() => {
                setPlayersLoading(true);
                setPlayersError(null);
                sendGameAction("list_players");
              }}
              onConfirmPick={(payload) => {
                sendGameAction("confirm_pick", payload);
                setPlayers(null);
              }}
            />
          )}

          <EightyTwoOhLineupBoard
            lineup={myBuild.lineup}
            benchEnabled={gameState.benchEnabled}
            editable={!myBuild.done}
            onReassign={(fromPosition, toPosition) => sendGameAction("reassign", { fromPosition, toPosition })}
          />

          {!myBuild.done && filledCount >= requiredCount && (
            <button type="button" className="btn-primary w-full" onClick={() => sendGameAction("finalize_build")}>
              Finalize Lineup
            </button>
          )}
          {myBuild.done && (
            <p className="text-center text-sm text-slate-500">
              Your lineup is locked in — waiting for everyone else to finish.
            </p>
          )}
        </div>

        <div>
          <p className="stat-label mb-2 text-center lg:text-left">Other Builds</p>
          <div className="space-y-3">
            {room.players
              .filter((p) => p.socketId !== myId)
              .map((p) => {
                const build = gameState.playerBuilds[p.socketId];
                const otherFilled = build ? slots.filter((s) => build.lineup[s]).length : 0;
                return (
                  <div key={p.socketId} className="card space-y-1 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-white">
                        {p.name}
                        {p.connected === false && <span className="ml-2 text-xs text-slate-600">(disconnected)</span>}
                      </span>
                      <span className="text-xs text-slate-500">
                        {build?.done ? "Done" : `${otherFilled} of ${requiredCount}`}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {slots.map((slot) => (
                        <span
                          key={slot}
                          className={`rounded px-1.5 py-0.5 text-[10px] ${
                            build?.lineup[slot] ? "bg-court/20 text-court-glow" : "bg-slate-800 text-slate-600"
                          }`}
                        >
                          {slot}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}
