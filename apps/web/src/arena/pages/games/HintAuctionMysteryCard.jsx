import { TEAM_FULL_NAMES, POSITION_NAMES } from "../../utils/fiveHintsGenerator.js";

const TIER_STYLES = {
  Elite: "border-basketball/50 bg-basketball/10 text-basketball",
  Star: "border-terracotta/50 bg-terracotta/10 text-terracotta",
  "Role Player": "border-ink/20 bg-ink/30 text-ink",
  "Deep Bench": "border-ink/20 bg-ink/5 text-ink/70",
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
      <div className="hoop-card-outline animate-fade-in mx-auto max-w-lg space-y-4 p-8 text-center">
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-terracotta/20 text-3xl font-bold text-terracotta">
          {player?.name
            ?.split(" ")
            .map((w) => w[0])
            .join("")}
        </div>
        <h2 className="text-3xl font-bold text-ink">{player?.name}</h2>
        <p className="text-ink/70">
          {positionName} — {teamName}
        </p>
        <div className="flex justify-center">
          <TierBadge tier={round.tier} />
        </div>
        {statLine && <p className="hoop-stat-value text-lg">{statLine}</p>}

        {round.unsold ? (
          <div className="rounded-xl border border-ink/20 bg-paper p-4">
            <p className="text-sm text-basketball">Nobody bid — this player went unsold.</p>
          </div>
        ) : (
          <div className="animate-slide-up space-y-1 rounded-xl border border-terracotta/40 bg-paper p-4">
            <p className="text-sm font-semibold text-terracotta">
              Sold to {winnerName || "someone"} for {round.winningBid}
            </p>
            <p className="text-xs text-ink/70">Assigned to {round.assignedSlot}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="hoop-card-outline mx-auto max-w-lg space-y-5 p-8 text-center">
      <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-ink/5 text-4xl font-bold text-ink/60">
        ?
      </div>
      <div className="flex justify-center">
        <TierBadge tier={round.tier} />
      </div>
      <p className="hoop-stat-label">
        {round.subPhase === "auction" ? "Bidding is open" : `Hint ${round.hintNumber} of ${round.hints.length}`}
      </p>
      <ul className="space-y-2 text-left">
        {round.hints.map((hint, i) => (
          <li
            key={i}
            className={`rounded-lg border p-3 text-sm leading-relaxed ${
              i === round.hints.length - 1 ? "animate-fade-in border-terracotta/40 bg-terracotta/5 text-ink" : "border-ink/15 text-ink/70"
            }`}
          >
            {hint}
          </li>
        ))}
      </ul>
    </div>
  );
}
