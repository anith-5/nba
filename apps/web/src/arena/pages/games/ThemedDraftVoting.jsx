import { useState } from "react";

// Every connected drafter votes for the team that best fits the theme,
// never their own -- resolution fires the instant everyone currently
// connected has voted, not on a timer (see gameHandlers.js's
// handleThemedDraftAction). The server redacts *what* each player voted for
// until resolution (sanitize.js's sanitizeThemedDraft), exposing only
// votedSocketIds, so `myPick` here is purely local UI state reflecting this
// browser's own last click -- votes can be changed until resolution, same
// as Over Under's submit_vote.
export default function ThemedDraftVoting({ gameState, players, myId, onCastVote }) {
  const { rosters, votedSocketIds = [] } = gameState;
  const [myPick, setMyPick] = useState(null);

  function vote(socketId) {
    setMyPick(socketId);
    onCastVote(socketId);
  }

  const connectedCount = players.filter((p) => p.connected).length;

  return (
    <div className="animate-fade-in space-y-6">
      <header className="text-center">
        <h1 className="text-2xl font-bold text-white">Vote: Whose Team Fits the Theme Best?</h1>
        <p className="mt-1 text-sm text-slate-400">
          {votedSocketIds.length} of {connectedCount} votes in — you can change your vote until everyone's in.
        </p>
      </header>

      <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-2">
        {players.map((player) => {
          const roster = rosters[player.socketId] || [];
          const isMe = player.socketId === myId;
          const hasVoted = votedSocketIds.includes(player.socketId);
          const isMyPick = myPick === player.socketId;

          return (
            <div key={player.socketId} className={`card space-y-3 p-5 ${isMyPick ? "border-court/50" : ""}`}>
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold text-white">
                  {player.name}
                  {isMe && <span className="ml-1 text-xs text-court-glow">(you)</span>}
                </span>
                {hasVoted && <span className="text-xs text-slate-500">voted</span>}
              </div>
              <ul className="flex flex-wrap gap-1.5">
                {roster.map((p, i) => (
                  <li key={i} className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-white">
                    {p.name}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={isMe}
                onClick={() => vote(player.socketId)}
                className={`w-full ${isMyPick ? "btn-primary" : "btn-ghost"} disabled:opacity-40`}
              >
                {isMe ? "Your Team" : isMyPick ? "Your Vote" : "Vote for This Team"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
