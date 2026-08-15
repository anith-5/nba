import Timer from "../../components/Timer.jsx";
import { formatStatValue } from "../../data/statCategories.js";

export default function OverUnderRoundCard({ round, players, myId, onVote, timerSeconds }) {
  const hasVoted = round.votedSocketIds?.includes(myId);

  return (
    <div className="hoop-card-outline mx-auto max-w-lg space-y-5 p-6 text-center">
      <div className="flex h-24 w-24 mx-auto items-center justify-center rounded-full bg-ink/5 text-3xl font-bold text-ink/60">
        {round.player.name
          .split(" ")
          .map((w) => w[0])
          .join("")}
      </div>
      <h2 className="text-2xl font-bold text-ink">{round.player.name}</h2>
      <p className="text-ink/70">{round.player.position}</p>

      <div>
        <p className="hoop-stat-label">{round.statLabel}</p>
        <p className="hoop-stat-value text-4xl">{formatStatValue(round.line, round.statFormat)}</p>
      </div>

      {!round.revealed && <Timer startedAt={round.startedAt} durationSeconds={timerSeconds} />}

      {!round.revealed && (
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => onVote("over")}
            disabled={hasVoted}
            className="hoop-btn-primary py-4 text-lg disabled:opacity-40"
          >
            Over
          </button>
          <button
            onClick={() => onVote("under")}
            disabled={hasVoted}
            className="hoop-btn-ghost py-4 text-lg disabled:opacity-40"
          >
            Under
          </button>
        </div>
      )}

      {hasVoted && !round.revealed && <p className="text-sm text-ink/60">Waiting for other players…</p>}

      {round.revealed && (
        <div className="space-y-3 text-left">
          <p className="text-center text-lg">
            Actual: <span className="hoop-stat-value">{formatStatValue(round.actualValue, round.statFormat)}</span>{" "}
            <span className={round.actualValue > round.line ? "text-terracotta" : "text-basketball"}>
              {round.actualValue > round.line ? "▲ Over" : "▼ Under"}
            </span>
          </p>
          <ul className="space-y-1">
            {players.map((p) => {
              const vote = round.votes?.[p.socketId];
              const correct = round.correctSocketIds?.includes(p.socketId);
              return (
                <li key={p.socketId} className="flex items-center justify-between text-sm">
                  <span className="text-ink">{p.name}</span>
                  <span className={correct ? "text-terracotta" : "text-ink/60"}>
                    {vote || "no vote"} {correct && "✓"}
                    {round.soleBonusSocketId === p.socketId && " (+1 bonus)"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
