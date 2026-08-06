import { TEAM_FULL_NAMES, POSITION_NAMES } from "../../utils/fiveHintsGenerator.js";

// The centerpiece of the round: a silhouette + "?" card that shows the
// current hint text while the round is live, then swaps (via a plain
// fade-in rather than a real 3D flip -- no new CSS/animations, only the
// existing animate-fade-in utility) to the revealed player once the round
// resolves, either by a correct guess or by exhausting all hints.
export default function FiveHintsMysteryCard({ round, maxHints, winners, players }) {
  if (!round) return null;

  if (round.resolved) {
    const player = round.player;
    const teamName = TEAM_FULL_NAMES[player?.primary_team] || player?.primary_team;
    const positionName = POSITION_NAMES[player?.position] || player?.position;
    const keyStat =
      player?.career_ppg > 0
        ? `${player.career_ppg.toFixed(1)} PPG for their career`
        : player?.total_seasons
          ? `${player.total_seasons} seasons in the league`
          : null;

    return (
      <div className="card animate-fade-in mx-auto max-w-lg space-y-4 p-8 text-center">
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-court/20 text-3xl font-bold text-court-glow">
          {player?.name
            ?.split(" ")
            .map((w) => w[0])
            .join("")}
        </div>
        <h2 className="text-3xl font-bold text-white">{player?.name}</h2>
        <p className="text-slate-400">
          {positionName} — {teamName}
        </p>
        {keyStat && <p className="stat-value text-lg">{keyStat}</p>}

        {winners.length > 0 ? (
          <div className="animate-slide-up space-y-2 rounded-xl border border-court/40 bg-slate-950 p-4">
            <p className="text-sm font-semibold text-court-glow">🏀 Correct!</p>
            {winners.map((w) => {
              const name = players.find((p) => p.socketId === w.socketId)?.name || "Someone";
              return (
                <p key={w.socketId} className="text-sm text-white">
                  {name} guessed it on hint {w.hintNumber} — +{w.points} points
                </p>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-700 bg-slate-950 p-4">
            <p className="text-sm text-amber-300">Nobody guessed it in time.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="card mx-auto max-w-lg space-y-5 p-8 text-center">
      <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-slate-800 text-4xl font-bold text-slate-500">
        ?
      </div>
      <p className="stat-label">
        Hint {round.hintNumber} of {maxHints}
      </p>
      <p className="animate-fade-in text-xl leading-relaxed text-white">{round.hints[round.hints.length - 1]}</p>
    </div>
  );
}
