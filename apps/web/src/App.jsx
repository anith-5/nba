import { Route, Routes } from "react-router-dom";
import Shell from "./components/Shell.jsx";
import Home from "./pages/Home.jsx";
import Games from "./pages/Games.jsx";
import Players from "./pages/Players.jsx";
import TradeMachine from "./pages/TradeMachine.jsx";
import Predictions from "./pages/Predictions.jsx";
import Research from "./pages/Research.jsx";
import Simulator from "./pages/Simulator.jsx";
import ShotQuality from "./pages/ShotQuality.jsx";
import WinProbability from "./pages/WinProbability.jsx";
import LineupOptimizer from "./pages/LineupOptimizer.jsx";
import DefenseScanner from "./pages/DefenseScanner.jsx";
import PlayerTrajectory from "./pages/PlayerTrajectory.jsx";
import ClutchDNA from "./pages/ClutchDNA.jsx";
import ScoutingReport from "./pages/ScoutingReport.jsx";
import Prospects from "./pages/Prospects.jsx";
import RuleSimulator from "./pages/RuleSimulator.jsx";
import GMAssistant from "./pages/GMAssistant.jsx";
import ShotEvaluator from "./pages/ShotEvaluator.jsx";
import DraftSimulator from "./pages/DraftSimulator.jsx";
import DraftComps from "./pages/DraftComps.jsx";
import ArenaLayout from "./arena/ArenaLayout.jsx";
import ArenaHome from "./arena/pages/ArenaHome.jsx";
import JoinRoom from "./arena/pages/JoinRoom.jsx";
import CreateRoom from "./arena/pages/CreateRoom.jsx";
import WaitingRoom from "./arena/pages/WaitingRoom.jsx";
import OverUnder from "./arena/pages/games/OverUnder.jsx";
import ClosestTo from "./arena/pages/games/ClosestTo.jsx";
import Wordle from "./arena/pages/games/Wordle.jsx";
import FiveHints from "./arena/pages/games/FiveHints.jsx";
import ComingSoon from "./arena/pages/games/ComingSoon.jsx";

export default function App() {
  return (
    <div className="min-h-dvh bg-black">
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Home />} />
          <Route path="games" element={<Games />} />
          <Route path="players" element={<Players />} />
          <Route path="predictions" element={<Predictions />} />
          <Route path="trade" element={<TradeMachine />} />
          <Route path="research" element={<Research />} />
          <Route path="sim" element={<Simulator />} />
          <Route path="shot-quality" element={<ShotQuality />} />
          <Route path="win-prob" element={<WinProbability />} />
          <Route path="lineups" element={<LineupOptimizer />} />
          <Route path="defense" element={<DefenseScanner />} />
          <Route path="trajectory" element={<PlayerTrajectory />} />
          <Route path="clutch" element={<ClutchDNA />} />
          <Route path="scouting" element={<ScoutingReport />} />
          <Route path="prospects" element={<Prospects />} />
          <Route path="rules" element={<RuleSimulator />} />
          <Route path="gm" element={<GMAssistant />} />
          <Route path="shot-evaluator" element={<ShotEvaluator />} />
          <Route path="draft" element={<DraftSimulator />} />
          <Route path="draft-comps" element={<DraftComps />} />
          {/* Arena hub, Wordle solo, and the not-yet-playable modes never need a
              realtime connection, so they stay outside ArenaLayout/SocketProvider
              — only lobby-based flows (join/create/room/over-under) connect the socket. */}
          <Route path="arena" element={<ArenaHome />} />
          <Route path="arena/games/wordle" element={<Wordle />} />
          <Route
            path="arena/games/themed-draft"
            element={<ComingSoon title="Themed Player Draft" description="Draft NBA players based on a category set by the host." />}
          />
          <Route
            path="arena/games/hint-auction"
            element={<ComingSoon title="Hint Auction" description="Bid tokens on mystery players revealed through progressive hints." />}
          />
          <Route
            path="arena/games/trade-evaluator"
            element={<ComingSoon title="Trade Evaluator" description="Vote on who wins NBA trades then see the model's verdict." />}
          />
          <Route path="arena" element={<ArenaLayout />}>
            <Route path="join" element={<JoinRoom />} />
            <Route path="join/:code" element={<JoinRoom />} />
            <Route path="create/:mode" element={<CreateRoom />} />
            <Route path="room/:code" element={<WaitingRoom />} />
            <Route path="games/over-under/:code" element={<OverUnder />} />
            <Route path="games/closest-to/:code" element={<ClosestTo />} />
            <Route path="games/five-hints/:code" element={<FiveHints />} />
          </Route>
        </Route>
      </Routes>
    </div>
  );
}
