import { Link } from "react-router-dom";
import GameModeIcon from "./GameModeIcon.jsx";

// `showDetails` reserves the extended description/player-count/Play-Now
// button for the front/focused card -- but the name and icon always show,
// on every card, front or side. (Earlier this hid the whole card down to
// icon-only including the name -- that was wrong, corrected back to
// always-visible names per explicit feedback.)
export default function GameModeCard({ mode, showDetails = true }) {
  const isComingSoon = mode.status === "coming-soon";
  const playHref = mode.id === "wordle" ? mode.route : `/arena/create/${mode.id}`;
  const cardClass = isComingSoon ? "hoop-card-outline" : "hoop-card";
  const mutedClass = isComingSoon ? "text-ink/50" : "text-paper/70";

  if (!showDetails) {
    return (
      <article className={`flex h-full flex-col items-center justify-center gap-2 p-5 ${cardClass}`}>
        <GameModeIcon modeId={mode.id} className={`h-10 w-10 ${isComingSoon ? "opacity-60" : ""}`} />
        <h3 className="font-hoop text-center text-sm font-bold">{mode.name}</h3>
      </article>
    );
  }

  return (
    <article className={`flex h-full flex-col p-5 ${cardClass}`}>
      <div className="flex items-center gap-3">
        <GameModeIcon modeId={mode.id} className={`h-9 w-9 shrink-0 ${isComingSoon ? "opacity-70" : ""}`} />
        <h3 className="font-hoop text-lg font-bold">{mode.name}</h3>
      </div>
      <p className={`mt-2 flex-1 text-sm ${isComingSoon ? "text-ink/70" : "text-paper/85"}`}>{mode.description}</p>
      <div className={`mt-4 flex items-center gap-3 text-xs ${mutedClass}`}>
        <span>
          {mode.minPlayers}-{mode.maxPlayers} players
        </span>
        <span>·</span>
        <span>{mode.estimate}</span>
      </div>
      <Link
        to={isComingSoon ? mode.route : playHref}
        className={`mt-4 ${isComingSoon ? "hoop-btn-ghost" : "hoop-btn-primary"}`}
      >
        {isComingSoon ? "Coming Soon" : "Play Now"}
      </Link>
    </article>
  );
}
