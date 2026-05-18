import { Route, Routes } from "react-router-dom";
import Shell from "./components/Shell.jsx";
import Home from "./pages/Home.jsx";
import Games from "./pages/Games.jsx";
import Players from "./pages/Players.jsx";
import TradeMachine from "./pages/TradeMachine.jsx";
import Predictions from "./pages/Predictions.jsx";
import Research from "./pages/Research.jsx";
import Simulator from "./pages/Simulator.jsx";

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
        </Route>
      </Routes>
    </div>
  );
}
