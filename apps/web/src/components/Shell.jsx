import { NavLink, Outlet } from "react-router-dom";

const navGroups = [
  {
    label: "Live",
    items: [
      { to: "/", label: "Home", end: true },
      { to: "/games", label: "Games" },
      { to: "/win-prob", label: "Win Probability" },
    ],
  },
  {
    label: "Players",
    items: [
      { to: "/players", label: "Players" },
      { to: "/shot-quality", label: "Shot Quality xFG%" },
      { to: "/shot-evaluator", label: "Shot Evaluator" },
      { to: "/clutch", label: "Clutch DNA" },
      { to: "/trajectory", label: "Development Tracker" },
      { to: "/scouting", label: "AI Scouting" },
    ],
  },
  {
    label: "Teams",
    items: [
      { to: "/lineups", label: "Lineup Optimizer" },
      { to: "/defense", label: "Defense Scanner" },
      { to: "/trade", label: "Trade Machine" },
    ],
  },
  {
    label: "AI & Strategy",
    items: [
      { to: "/predictions", label: "Game Predictor" },
      { to: "/rules", label: "Rule Simulator" },
      { to: "/gm", label: "GM Assistant" },
    ],
  },
  {
    label: "Scouting",
    items: [
      { to: "/prospects", label: "Int'l Prospects" },
      { to: "/research", label: "Research" },
    ],
  },
];

function NavItem({ to, label, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `block rounded-lg px-3 py-1.5 text-sm font-medium transition ${
          isActive
            ? "bg-court/15 text-court-glow"
            : "text-slate-400 hover:bg-slate-800/50 hover:text-white"
        }`
      }
    >
      {label}
    </NavLink>
  );
}

export default function Shell() {
  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-20 flex w-60 flex-col border-r border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
        {/* Brand */}
        <div className="border-b border-slate-800/80 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-court/20 text-court font-bold text-lg">
              H
            </span>
            <div>
              <p className="text-sm font-bold tracking-tight text-white">HoopIQ</p>
              <p className="text-[10px] uppercase tracking-widest text-slate-500">NBA Analytics</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-4">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="stat-label px-3 mb-1">{group.label}</p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavItem key={item.to} {...item} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <p className="border-t border-slate-800/80 px-4 py-3 text-[10px] text-slate-600">
          HoopIQ · 11 AI/ML features
        </p>
      </aside>

      <main className="ml-60 flex-1 p-8">
        <Outlet />
      </main>
    </div>
  );
}
