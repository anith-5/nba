import { Link } from "react-router-dom";

export default function GameModeCard({ mode }) {
  const isComingSoon = mode.status === "coming-soon";
  const playHref = mode.id === "wordle" ? mode.route : `/arena/create/${mode.id}`;

  return (
    <article className="card-hover animate-slide-up flex flex-col p-5">
      <h3 className="text-lg font-semibold text-white">{mode.name}</h3>
      <p className="mt-2 flex-1 text-sm text-slate-400">{mode.description}</p>
      <div className="mt-4 flex items-center gap-3 text-xs text-slate-500">
        <span>
          {mode.minPlayers}-{mode.maxPlayers} players
        </span>
        <span>·</span>
        <span>{mode.estimate}</span>
      </div>
      <Link
        to={isComingSoon ? mode.route : playHref}
        className={`mt-4 ${isComingSoon ? "btn-ghost" : "btn-primary"}`}
      >
        {isComingSoon ? "Coming Soon" : "Play Now"}
      </Link>
    </article>
  );
}
