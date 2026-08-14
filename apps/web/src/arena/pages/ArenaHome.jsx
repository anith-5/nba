import { Link } from "react-router-dom";
import { GAME_MODES } from "../data/gameModes.js";
import GameModeCard from "../components/GameModeCard.jsx";
import FocusRecedeGroup from "../../components/FocusRecedeGroup.jsx";

export default function ArenaHome() {
  return (
    <div className="animate-fade-in space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-white">HoopIQ Arena</h1>
        <p className="mt-1 text-slate-400">Play NBA games with your friends</p>
      </header>

      <div className="flex gap-3">
        <a href="#game-modes" className="btn-primary">
          Create Room
        </a>
        <Link to="/arena/join" className="btn-ghost">
          Join Room
        </Link>
      </div>

      {/* Phase 0 demo of the shared FocusRecedeGroup pattern against real
          content -- this flat grid gets fully replaced by the carousel in
          Phase 1, this is just proving the reusable hover-to-focus pattern
          works before wiring it in anywhere else. GameModeCard itself is
          untouched (still legacy card-hover/btn-primary styling); Arena
          hub's real visual migration happens in Phase 1. */}
      <FocusRecedeGroup id="game-modes" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {GAME_MODES.map((mode) => (
          <GameModeCard key={mode.id} mode={mode} />
        ))}
      </FocusRecedeGroup>
    </div>
  );
}
