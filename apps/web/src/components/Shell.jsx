import { NavLink, Outlet } from "react-router-dom";

const nav = [
  { to: "/", label: "Home", end: true },
  { to: "/games", label: "Games" },
  { to: "/players", label: "Players" },
  { to: "/predictions", label: "AI Predictions" },
  { to: "/trade", label: "Trade Machine" },
  { to: "/research", label: "Research" },
  { to: "/sim", label: "GM Sim" },
];

export default function Shell() {
  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-20 flex w-56 flex-col border-r border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
        <div className="border-b border-slate-800/80 px-5 py-5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-court/20 text-court">
              ◉
            </span>
            <div>
              <p className="text-sm font-bold tracking-tight text-white">CourtVision</p>
              <p className="text-[10px] uppercase tracking-widest text-slate-500">Analytics</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 p-3">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? "bg-court/15 text-court-glow"
                    : "text-slate-400 hover:bg-slate-800/50 hover:text-white"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <p className="border-t border-slate-800/80 px-4 py-3 text-[10px] text-slate-600">
          Student NBA analytics platform
        </p>
      </aside>
      <main className="ml-56 flex-1 p-8">
        <Outlet />
      </main>
    </div>
  );
}
