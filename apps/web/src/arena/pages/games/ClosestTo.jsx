import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSocket } from "../../socket/useSocket.js";
import ClosestToSpinner from "./ClosestToSpinner.jsx";
import ClosestToLeaderboard from "./ClosestToLeaderboard.jsx";
import ClosestToReveal from "./ClosestToReveal.jsx";
import { ClosestToRoundResults, ClosestToFinalResults } from "./ClosestToResults.jsx";

const EMPTY_LINEUP = { PG: null, SG: null, SF: null, PF: null, C: null };
const EMPTY_MY_STATE = { lineup: EMPTY_LINEUP, filledCount: 0, skipUsed: false, done: false };

export default function ClosestTo() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { socket, room, myId, sendGameAction, leaveRoom } = useSocket();

  const [myState, setMyState] = useState(EMPTY_MY_STATE);
  const [spinToken, setSpinToken] = useState(0);
  const [pendingTeam, setPendingTeam] = useState(null);
  const [teamPlayers, setTeamPlayers] = useState(null);
  const [teamPlayersLoading, setTeamPlayersLoading] = useState(false);
  const [teamPlayersError, setTeamPlayersError] = useState(null);
  const [teamPlayersMeta, setTeamPlayersMeta] = useState({ source: null, dataComplete: true, note: null });
  const [revealEntries, setRevealEntries] = useState(null);
  const seenRoundRef = useRef(null);

  useEffect(() => {
    const onSpinResult = ({ team, skipUsed }) => {
      setPendingTeam(team);
      setSpinToken((t) => t + 1);
      setTeamPlayersError(null);
      if (skipUsed) setMyState((prev) => ({ ...prev, skipUsed: true }));
    };
    const onTeamPlayersList = ({ players, source, dataComplete, note }) => {
      setTeamPlayers(players);
      setTeamPlayersLoading(false);
      setTeamPlayersError(null);
      setTeamPlayersMeta({ source, dataComplete, note });
    };
    const onTeamPlayersError = ({ message }) => {
      setTeamPlayersLoading(false);
      setTeamPlayersError(message);
      setTeamPlayers(null);
    };
    const onPickConfirmed = ({ state }) => {
      setMyState(state);
      setPendingTeam(null);
      setTeamPlayers(null);
      setTeamPlayersError(null);
      if (!state.done) sendGameAction("spin_team");
    };
    const onRevealLineups = ({ entries }) => {
      setRevealEntries(entries);
    };
    // The background retry loop (services/arena-realtime/src/data/teamPlayersCache.js)
    // confirms previously-throttled seasons after the fact. If we're
    // currently browsing the exact team it just updated, refresh the list
    // live instead of showing stale/incomplete seasons.
    const onCacheUpdated = ({ team }) => {
      setPendingTeam((current) => {
        if (current?.abbr === team) sendGameAction("list_team_players");
        return current;
      });
    };

    socket.on("spin_result", onSpinResult);
    socket.on("team_players_list", onTeamPlayersList);
    socket.on("team_players_error", onTeamPlayersError);
    socket.on("pick_confirmed", onPickConfirmed);
    socket.on("reveal_lineups", onRevealLineups);
    socket.on("cache_updated", onCacheUpdated);

    return () => {
      socket.off("spin_result", onSpinResult);
      socket.off("team_players_list", onTeamPlayersList);
      socket.off("team_players_error", onTeamPlayersError);
      socket.off("pick_confirmed", onPickConfirmed);
      socket.off("reveal_lineups", onRevealLineups);
      socket.off("cache_updated", onCacheUpdated);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  const roundNumber = room?.gameState?.roundNumber;
  useEffect(() => {
    if (roundNumber == null) return;
    if (seenRoundRef.current !== null && seenRoundRef.current !== roundNumber) {
      setMyState(EMPTY_MY_STATE);
      setSpinToken(0);
      setPendingTeam(null);
      setTeamPlayers(null);
      setTeamPlayersError(null);
      setRevealEntries(null);
    }
    seenRoundRef.current = roundNumber;
  }, [roundNumber]);

  if (!room || !room.gameState) {
    return (
      <p className="text-ink/70">
        No active game found for <span className="font-mono text-ink">{code}</span>.
      </p>
    );
  }

  const { gameState, status } = room;
  const isHost = myId === room.hostSocketId;

  const handleNewGame = () => {
    leaveRoom();
    navigate("/arena");
  };

  // Blind Mode reveal takes priority over whatever the server-side phase
  // already says — the phase flips to "round_results" almost the same
  // instant reveal_lineups fires, but the animation should still play out
  // client-side before the static rankings screen appears.
  if (revealEntries) {
    return (
      <ClosestToReveal
        entries={revealEntries}
        target={gameState.target}
        onRevealComplete={() => setRevealEntries(null)}
      />
    );
  }

  if (status === "finished") {
    return (
      <div className="space-y-6">
        <ClosestToFinalResults gameState={gameState} players={room.players} />
        <div className="text-center">
          <button onClick={handleNewGame} className="hoop-btn-ghost">
            New Game
          </button>
        </div>
      </div>
    );
  }

  if (gameState.phase === "round_results") {
    return (
      <ClosestToRoundResults
        gameState={gameState}
        isHost={isHost}
        onNextRound={() => sendGameAction("next_round")}
      />
    );
  }

  return (
    <div className="animate-fade-in mx-auto max-w-lg space-y-6">
      <header className="text-center">
        <h1 className="text-xl font-bold text-ink">
          Round {gameState.roundNumber} of {gameState.totalRounds}
        </h1>
        <p className="text-ink/70">Target: {gameState.target} PPG</p>
      </header>

      {myState.done ? (
        <ClosestToLeaderboard myState={myState} players={room.players} playerLineups={gameState.playerLineups} />
      ) : (
        <ClosestToSpinner
          myState={myState}
          skipRule={gameState.skipRule}
          spinToken={spinToken}
          pendingTeam={pendingTeam}
          teamPlayers={teamPlayers}
          teamPlayersLoading={teamPlayersLoading}
          teamPlayersError={teamPlayersError}
          teamPlayersSource={teamPlayersMeta.source}
          teamPlayersDataComplete={teamPlayersMeta.dataComplete}
          teamPlayersNote={teamPlayersMeta.note}
          onSpin={() => sendGameAction("spin_team")}
          onUseSkip={() => sendGameAction("use_skip")}
          onRequestPlayers={() => {
            setTeamPlayersLoading(true);
            setTeamPlayersError(null);
            sendGameAction("list_team_players");
          }}
          onConfirmPick={(payload) => sendGameAction("confirm_pick", payload)}
        />
      )}
    </div>
  );
}
