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

export default function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900">
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
        </Route>
      </Routes>
    </div>
  );
}
