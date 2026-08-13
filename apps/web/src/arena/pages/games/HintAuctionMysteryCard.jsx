import { TEAM_FULL_NAMES, POSITION_NAMES } from "../../utils/fiveHintsGenerator.js";

const TIER_STYLES = {
  Elite: "border-amber-400/50 bg-amber-400/10 text-amber-300",
  Star: "border-court/50 bg-court/10 text-court-glow",
  "Role Player": "border-slate-500/50 bg-slate-500/10 text-slate-300",
  "Deep Bench": "border-slate-700 bg-slate-800/60 text-slate-400",
};

function TierBadge({ tier }) {
  if (!tier) return null;
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${TIER_STYLES[tier] || TIER_STYLES["Role Player"]}`}>
      {tier} Tier
    </span>
  );
}

// The centerpiece of the round: hints accumulate one at a time (all of
// them shown, not just the latest, since there's no guessing here -- the
// whole point is gathering enough info to bid well) until the mystery
// player is revealed the instant the auction closes. Mirrors Five Hints'
// FiveHintsMysteryCard's silhouette-then-reveal shape, but reveal happens
// on auction resolution rather than a correct guess.
export default function HintAuctionMysteryCard({ round, players }) {
  if (!round) return null;

  if (round.resolved) {
    const player = round.player;
    const era = round.era;
    const teamName = era === "current" ? player?.team_full_name : TEAM_FULL_NAMES[player?.primary_team] || player?.primary_team;
    const positionName = POSITION_NAMES[player?.position] || player?.position;
    const statLine =
      era === "current"
        ? typeof player?.pts_pg === "number"
          ? `${player.pts_pg.toFixed(1)} PPG this season`
          : null
        : typeof player?.career_ppg === "number"
          ? `${player.career_ppg.toFixed(1)} PPG for their career`
          : null;

    const winnerName = round.winnerSocketId ? players.find((p) => p.socketId === round.winnerSocketId)?.name : null;

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
        <div className="flex justify-center">
          <TierBadge tier={round.tier} />
        </div>
        {statLine && <p className="stat-value text-lg">{statLine}</p>}

        {round.unsold ? (
          <div className="rounded-xl border border-slate-700 bg-slate-950 p-4">
            <p className="text-sm text-amber-300">Nobody bid — this player went unsold.</p>
          </div>
        ) : (
          <div className="animate-slide-up space-y-1 rounded-xl border border-court/40 bg-slate-950 p-4">
            <p className="text-sm font-semibold text-court-glow">
              Sold to {winnerName || "someone"} for {round.winningBid}
            </p>
            <p className="text-xs text-slate-400">Assigned to {round.assignedSlot}</p>
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
      <div className="flex justify-center">
        <TierBadge tier={round.tier} />
      </div>
      <p className="stat-label">
        {round.subPhase === "auction" ? "Bidding is open" : `Hint ${round.hintNumber} of ${round.hints.length}`}
      </p>
      <ul className="space-y-2 text-left">
        {round.hints.map((hint, i) => (
          <li
            key={i}
            className={`rounded-lg border p-3 text-sm leading-relaxed ${
              i === round.hints.length - 1 ? "animate-fade-in border-court/40 bg-court/5 text-white" : "border-slate-800 text-slate-400"
            }`}
          >
            {hint}
          </li>
        ))}
      </ul>
    </div>
  );
}
