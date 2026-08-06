import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

// ---- Sidebar: tools grouped by category (matches the app) ----
const navGroups = [
  {
    label: "Players",
    items: [
      { to: "/players", label: "Player Search" },
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
      { to: "/draft", label: "Draft Simulator" },
      { to: "/rules", label: "Rule Simulator" },
      { to: "/gm", label: "GM Assistant" },
    ],
  },
  {
    label: "Scouting",
    items: [
      { to: "/prospects", label: "Int'l Prospects" },
      { to: "/draft-comps", label: "Draft Prospect Comps" },
      { to: "/research", label: "Research" },
    ],
  },
];

// ---- Top nav: primary sections ----
const topNav = [
  { to: "/", label: "Home", end: true },
  { to: "/games", label: "Games" },
  { to: "/players", label: "Players" },
  { to: "/draft", label: "Draft" },
  { to: "/#standings", label: "Standings" },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white ring-1 ring-white/15">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3v18M3 12h18M5.6 5.6c3 2.4 3 10.4 0 12.8M18.4 5.6c-3 2.4-3 10.4 0 12.8" />
        </svg>
      </span>
      <div className="leading-none">
        <p className="font-display text-base font-extrabold tracking-tight text-white">HoopIQ</p>
        <p className="text-[10px] uppercase tracking-widest text-slate-500">NBA Analytics</p>
      </div>
    </div>
  );
}

function TopLink({ to, label, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `relative px-1 py-2 text-sm font-medium transition ${
          isActive ? "text-white" : "text-slate-400 hover:text-white"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {label}
          {isActive && (
            <span className="absolute inset-x-0 -bottom-[1px] h-0.5 rounded-full bg-[#ef4444]" />
          )}
        </>
      )}
    </NavLink>
  );
}

function AnalyticsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        className={`flex items-center gap-1 px-1 py-2 text-sm font-medium transition ${
          open ? "text-white" : "text-slate-400 hover:text-white"
        }`}
      >
        Analytics
        <svg
          viewBox="0 0 20 20"
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          fill="currentColor"
        >
          <path d="M5.5 7.5L10 12l4.5-4.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute left-1/2 top-full z-50 mt-3 w-[520px] -translate-x-1/2 rounded-card border border-white/10 bg-surface-raised/95 p-4 shadow-card backdrop-blur-xl"
          role="menu"
        >
          <div className="grid grid-cols-3 gap-x-4 gap-y-1">
            {navGroups
              .filter((g) => g.label !== "Scouting")
              .map((g) => (
                <div key={g.label}>
                  <p className="stat-label mb-1.5 px-2">{g.label}</p>
                  {g.items.map((it) => (
                    <NavLink
                      key={it.to}
                      to={it.to}
                      onClick={() => setOpen(false)}
                      className="block rounded-lg px-2 py-1.5 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
                      role="menuitem"
                    >
                      {it.label}
                    </NavLink>
                  ))}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SidebarNav({ onNavigate }) {
  return (
    <nav className="space-y-5 p-4">
      {navGroups.map((group) => (
        <div key={group.label}>
          <p className="stat-label mb-1 px-3">{group.label}</p>
          <div className="space-y-0.5">
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `block rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    isActive
                      ? "bg-[#ef4444]/15 text-[#f87171]"
                      : "text-slate-400 hover:bg-white/5 hover:text-white"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

export default function Shell() {
  const [drawer, setDrawer] = useState(false);
  const [q, setQ] = useState("");
  const location = useLocation();
  const navigate = useNavigate();

  // Close mobile drawer whenever the route changes
  useEffect(() => setDrawer(false), [location.pathname]);

  // Escape closes the drawer
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") setDrawer(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function onSearch(e) {
    e.preventDefault();
    navigate("/players");
  }

  return (
    <div className="min-h-dvh">
      {/* Sticky top nav */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-4 px-4 sm:px-6">
          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setDrawer(true)}
            aria-label="Open menu"
            className="grid h-10 w-10 place-items-center rounded-lg text-slate-300 hover:bg-white/5 lg:hidden"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <NavLink to="/" className="shrink-0">
            <Logo />
          </NavLink>

          {/* Center nav (desktop) */}
          <nav className="mx-auto hidden items-center gap-6 lg:flex">
            {topNav.slice(0, 3).map((l) => (
              <TopLink key={l.to} {...l} />
            ))}
            <AnalyticsMenu />
            {topNav.slice(3).map((l) => (
              <TopLink key={l.to} {...l} />
            ))}
          </nav>

          {/* Right: search + profile */}
          <div className="ml-auto flex items-center gap-2">
            <form onSubmit={onSearch} className="hidden md:block">
              <div className="relative">
                <svg
                  viewBox="0 0 24 24"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4-4" />
                </svg>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  type="text"
                  placeholder="Search players…"
                  aria-label="Search players"
                  className="w-44 rounded-xl border border-white/10 bg-surface-raised/60 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:w-56 focus:border-brand focus:outline-none"
                />
              </div>
            </form>
            <button
              type="button"
              aria-label="Profile"
              className="grid h-9 w-9 place-items-center rounded-full bg-surface-raised text-sm font-semibold text-slate-300 ring-1 ring-white/10 hover:text-white"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1600px]">
        {/* Sidebar (desktop) */}
        <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-60 shrink-0 overflow-y-auto border-r border-white/5 lg:block">
          <SidebarNav />
          <p className="px-5 py-4 text-[10px] text-slate-600">HoopIQ · 11 AI/ML features</p>
        </aside>

        {/* Mobile drawer */}
        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setDrawer(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <aside className="absolute inset-y-0 left-0 w-72 overflow-y-auto border-r border-white/10 bg-surface">
              <div className="flex items-center justify-between border-b border-white/5 px-4 py-4">
                <Logo />
                <button
                  type="button"
                  onClick={() => setDrawer(false)}
                  aria-label="Close menu"
                  className="grid h-9 w-9 place-items-center rounded-lg text-slate-300 hover:bg-white/5"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
              <SidebarNav onNavigate={() => setDrawer(false)} />
            </aside>
          </div>
        )}

        {/* Main content */}
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
