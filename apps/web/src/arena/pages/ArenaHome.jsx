import { Link } from "react-router-dom";
import { GAME_MODES } from "../data/gameModes.js";
import GameModeCarousel from "../components/GameModeCarousel.jsx";

export default function ArenaHome() {
  return (
    <div className="animate-fade-in min-h-[calc(100dvh-4rem)] -mx-4 -my-6 space-y-8 bg-paper px-4 py-6 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <header>
        <h1 className="font-hoop text-3xl font-bold text-ink">HoopIQ Arena</h1>
        <p className="mt-1 text-ink/60">Play NBA games with your friends</p>
      </header>

      <div className="flex gap-3">
        <a href="#game-modes" className="hoop-btn-primary">
          Create Room
        </a>
        <Link to="/arena/join" className="hoop-btn-ghost">
          Join Room
        </Link>
      </div>

      <div id="game-modes">
        <GameModeCarousel modes={GAME_MODES} />
      </div>
    </div>
  );
}
