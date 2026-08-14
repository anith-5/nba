import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import HoopWordmark from "./HoopWordmark.jsx";

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
  {
    label: "Arena",
    items: [{ to: "/arena", label: "Arena" }],
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

function TopLink({ to, label, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `relative px-1 py-2 font-hoop text-sm font-semibold transition ${
          isActive ? "text-ink" : "text-ink/50 hover:text-ink"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {label}
          {isActive && <span className="absolute inset-x-0 -bottom-[1px] h-[3px] rounded-full bg-terracotta" />}
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
        className={`flex items-center gap-1 px-1 py-2 font-hoop text-sm font-semibold transition ${
          open ? "text-ink" : "text-ink/50 hover:text-ink"
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
          className="absolute left-1/2 top-full z-50 mt-3 w-[520px] -translate-x-1/2 rounded-hoop border-2 border-ink bg-paper p-4 shadow-hoop"
          role="menu"
        >
          <div className="grid grid-cols-3 gap-x-4 gap-y-1">
            {navGroups
              .filter((g) => g.label !== "Scouting")
              .map((g) => (
                <div key={g.label}>
                  <p className="hoop-stat-label mb-1.5 px-2">{g.label}</p>
                  {g.items.map((it) => (
                    <NavLink
                      key={it.to}
                      to={it.to}
                      onClick={() => setOpen(false)}
                      className="block rounded-lg px-2 py-1.5 text-sm font-medium text-ink/70 transition hover:bg-terracotta/10 hover:text-ink"
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
          <p className="hoop-stat-label mb-1 px-3">{group.label}</p>
          <div className="space-y-0.5">
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `block rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                    isActive ? "bg-ink text-paper" : "text-ink/60 hover:bg-ink/5 hover:text-ink"
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
      <header className="sticky top-0 z-40 border-b-2 border-ink bg-paper">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-4 px-4 sm:px-6">
          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setDrawer(true)}
            aria-label="Open menu"
            className="grid h-10 w-10 place-items-center rounded-lg text-ink hover:bg-ink/5 lg:hidden"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <NavLink to="/" className="shrink-0">
            <HoopWordmark className="h-8" />
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
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40"
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
                  className="hoop-input w-44 py-2 pl-9 pr-3 shadow-none focus:w-56 focus:border-terracotta focus:shadow-none"
                />
              </div>
            </form>
            <button
              type="button"
              aria-label="Profile"
              className="grid h-9 w-9 place-items-center rounded-full border-2 border-ink bg-paper text-sm font-semibold text-ink hover:bg-ink/5"
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
        <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-60 shrink-0 overflow-y-auto border-r-2 border-ink bg-paper lg:block">
          <SidebarNav />
          <p className="px-5 py-4 text-[10px] text-ink/40">HoopIQ · 11 AI/ML features</p>
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
            <aside className="absolute inset-y-0 left-0 w-72 overflow-y-auto border-r-2 border-ink bg-paper">
              <div className="flex items-center justify-between border-b-2 border-ink px-4 py-4">
                <HoopWordmark className="h-7" />
                <button
                  type="button"
                  onClick={() => setDrawer(false)}
                  aria-label="Close menu"
                  className="grid h-9 w-9 place-items-center rounded-lg text-ink hover:bg-ink/5"
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
