import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import GameCard from "../components/GameCard.jsx";
import { InitialsTile, TeamTile } from "../components/TeamTile.jsx";

// ---- Snapshot-style fallback data (realistic; keeps the page alive) ----
const STANDINGS = {
  East: [
    ["BOS", "Celtics", 41, 12], ["CLE", "Cavaliers", 39, 14], ["NYK", "Knicks", 36, 17],
    ["MIL", "Bucks", 33, 20], ["ORL", "Magic", 32, 22], ["IND", "Pacers", 30, 23],
    ["MIA", "Heat", 28, 24], ["PHI", "76ers", 27, 25],
  ],
  West: [
    ["OKC", "Thunder", 43, 10], ["DEN", "Nuggets", 38, 15], ["MEM", "Grizzlies", 36, 18],
    ["HOU", "Rockets", 34, 19], ["LAL", "Lakers", 32, 21], ["DAL", "Mavericks", 31, 22],
    ["LAC", "Clippers", 30, 23], ["MIN", "Timberwolves", 29, 24],
  ],
};

const SCORING_LEADERS = [
  ["Shai Gilgeous-Alexander", "OKC", 32.6], ["Giannis Antetokounmpo", "MIL", 30.4],
  ["Nikola Jokić", "DEN", 29.7], ["Luka Dončić", "DAL", 28.1], ["Jayson Tatum", "BOS", 27.8],
];

const CLUTCH_LEADERS = [
  ["Shai Gilgeous-Alexander", "OKC", "+8.4", "Elite"], ["Jalen Brunson", "NYK", "+7.1", "Elite"],
  ["Nikola Jokić", "DEN", "+6.3", "High"], ["De'Aaron Fox", "SAS", "+5.9", "High"],
  ["Anthony Edwards", "MIN", "+5.2", "High"],
];

const PLAYER_CARDS = [
  { name: "Shai Gilgeous-Alexander", team: "OKC", pos: "PG", stats: [["PPG", "32.6"], ["AST", "6.3"], ["TS%", "63.9"]] },
  { name: "Nikola Jokić", team: "DEN", pos: "C", stats: [["PPG", "29.7"], ["REB", "12.9"], ["AST", "10.1"]] },
  { name: "Jayson Tatum", team: "BOS", pos: "SF", stats: [["PPG", "27.8"], ["REB", "8.6"], ["3P%", "37.2"]] },
  { name: "Anthony Edwards", team: "MIN", pos: "SG", stats: [["PPG", "27.1"], ["3PM", "4.1"], ["TS%", "58.4"]] },
];

const AI_TOOLS = [
  { to: "/shot-quality", title: "Shot Quality", desc: "Hot-zone xFG% map, graded A+ to F.", icon: "target" },
  { to: "/clutch", title: "Clutch DNA", desc: "How much a game elevates under pressure.", icon: "bolt" },
  { to: "/draft", title: "Draft Simulator", desc: "Future, historical & redraft modes.", icon: "layers" },
  { to: "/scouting", title: "AI Scouting", desc: "Claude-written reports, PDF export.", icon: "doc" },
  { to: "/gm", title: "GM Assistant", desc: "Chat over live league data.", icon: "chat" },
  { to: "/defense", title: "Defense Scanner", desc: "Weaknesses + a full game plan.", icon: "shield" },
];

function Icon({ name, className = "h-6 w-6" }) {
  const paths = {
    target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></>,
    bolt: <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />,
    layers: <><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /></>,
    doc: <><path d="M6 2h9l5 5v15H6z" /><path d="M15 2v5h5M9 13h6M9 17h6" /></>,
    chat: <path d="M4 5h16v11H9l-5 4V5z" />,
    shield: <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3z" />,
  };
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

// ---- AI tools as an interactive orbit (hover a node → it expands) ----
function AIToolsOrbit() {
  const [active, setActive] = useState(null);
  const R = 39; // ring radius as % of container

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[440px]">
      {/* Center label reacts to the hovered node */}
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="max-w-[190px] px-6 text-center">
          {active === null ? (
            <>
              <p className="font-display text-lg font-bold text-white">AI tools</p>
              <p className="mt-1 text-xs text-slate-500">Hover a node to explore</p>
            </>
          ) : (
            <>
              <p className="font-display text-base font-bold text-white">{AI_TOOLS[active].title}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{AI_TOOLS[active].desc}</p>
            </>
          )}
        </div>
      </div>

      {AI_TOOLS.map((t, i) => {
        const angle = ((-90 + i * 60) * Math.PI) / 180;
        const left = 50 + R * Math.cos(angle);
        const top = 50 + R * Math.sin(angle);
        const isActive = active === i;
        const dim = active !== null && !isActive;
        return (
          <Link
            key={t.to}
            to={t.to}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            aria-label={`${t.title} — ${t.desc}`}
            style={{ left: `${left}%`, top: `${top}%` }}
            className={`absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-surface-raised ring-1 ring-white/10 transition-all duration-300 ease-out ${
              isActive ? "z-10 h-28 w-28 shadow-lift" : "h-[70px] w-[70px]"
            } ${dim ? "opacity-40" : "opacity-100"}`}
          >
            {/* inner orange disc */}
            <span
              className={`grid place-items-center rounded-full bg-live text-white transition-all duration-300 ease-out ${
                isActive ? "h-[88px] w-[88px]" : "h-11 w-11"
              }`}
            >
              <Icon name={t.icon} className={isActive ? "h-8 w-8" : "h-5 w-5"} />
            </span>
          </Link>
        );
      })}
    </div>
  );
}

// Mobile fallback — a plain, tappable list (orbit hover doesn't suit touch)
function AIToolsList() {
  return (
    <div className="grid gap-3 sm:hidden">
      {AI_TOOLS.map((t) => (
        <Link key={t.to} to={t.to} className="card-hover flex items-center gap-3 p-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-live text-white">
            <Icon name={t.icon} className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display font-semibold text-white">{t.title}</p>
            <p className="text-sm text-slate-400">{t.desc}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

function StandingsCard() {
  const [conf, setConf] = useState("East");
  return (
    <div className="card p-5" id="standings">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-bold text-white">Standings</h2>
        <div className="flex rounded-lg bg-surface p-0.5 ring-1 ring-white/10">
          {["East", "West"].map((c) => (
            <button key={c} type="button" onClick={() => setConf(c)} aria-pressed={conf === c}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition ${conf === c ? "bg-brand text-white" : "text-slate-400 hover:text-white"}`}>
              {c}
            </button>
          ))}
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
            <th className="pb-2 font-medium">#</th>
            <th className="pb-2 font-medium">Team</th>
            <th className="pb-2 text-right font-medium">W</th>
            <th className="pb-2 text-right font-medium">L</th>
            <th className="pb-2 text-right font-medium">PCT</th>
          </tr>
        </thead>
        <tbody>
          {STANDINGS[conf].map(([tri, name, w, l], i) => (
            <tr key={tri} className="border-t border-white/5">
              <td className="py-2 font-mono text-slate-500">{i + 1}</td>
              <td className="py-2">
                <div className="flex items-center gap-2.5">
                  <TeamTile tricode={tri} size="sm" />
                  <span className="font-medium text-white">{name}</span>
                </div>
              </td>
              <td className="py-2 text-right font-mono tabular-nums text-white">{w}</td>
              <td className="py-2 text-right font-mono tabular-nums text-slate-400">{l}</td>
              <td className="py-2 text-right font-mono tabular-nums text-slate-400">{(w / (w + l)).toFixed(3).slice(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeadersCard() {
  const [tab, setTab] = useState("Scoring");
  const rows = tab === "Scoring" ? SCORING_LEADERS : CLUTCH_LEADERS;
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-bold text-white">Leaders</h2>
        <div className="flex rounded-lg bg-surface p-0.5 ring-1 ring-white/10">
          {["Scoring", "Clutch"].map((c) => (
            <button key={c} type="button" onClick={() => setTab(c)} aria-pressed={tab === c}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition ${tab === c ? "bg-brand text-white" : "text-slate-400 hover:text-white"}`}>
              {c}
            </button>
          ))}
        </div>
      </div>
      <ul className="space-y-1">
        {rows.map((r, i) => (
          <li key={r[0]} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/5">
            <span className="w-4 text-center font-mono text-xs text-slate-500">{i + 1}</span>
            <InitialsTile name={r[0]} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{r[0]}</p>
              <p className="text-xs text-slate-500">{r[1]}</p>
            </div>
            {tab === "Scoring" ? (
              <span className="font-display text-lg font-bold tabular-nums text-white">{r[2]}</span>
            ) : (
              <div className="text-right">
                <span className="font-display text-lg font-bold tabular-nums text-live-glow">{r[2]}</span>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">{r[3]}</p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlayerCard({ p }) {
  return (
    <Link to="/players" className="card-hover flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <InitialsTile name={p.name} size="md" />
        <div className="min-w-0">
          <p className="truncate font-display font-semibold text-white">{p.name}</p>
          <p className="text-xs text-slate-500">{p.team} · {p.pos}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {p.stats.map(([label, val]) => (
          <div key={label} className="rounded-lg bg-surface/60 py-2 text-center ring-1 ring-white/5">
            <p className="font-display text-base font-bold tabular-nums text-white">{val}</p>
            <p className="stat-label mt-0.5">{label}</p>
          </div>
        ))}
      </div>
    </Link>
  );
}

export default function Home() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiDown, setApiDown] = useState(false);

  useEffect(() => {
    api
      .scoreboard()
      .then((d) => {
        setGames(d.games || []);
        if (d.ok === false) setApiDown(true);
      })
      .catch(() => setApiDown(true))
      .finally(() => setLoading(false));
  }, []);

  const slate = games.slice(0, 6);

  return (
    <div className="animate-fade-in space-y-20 pb-16 sm:space-y-28">
      {/* Minimal hero + AI orbit */}
      <section className="pt-6 sm:pt-10">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
            The numbers behind the game.
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-base text-slate-400">
            Scores and standings daily. AI tools for shot quality, clutch, scouting, and the draft — built for people who actually watch.
          </p>
        </div>
        <div className="mt-10 hidden sm:block">
          <AIToolsOrbit />
        </div>
        <div className="mt-8">
          <AIToolsList />
        </div>
      </section>

      {/* Today's matchups */}
      <section>
        <div className="mb-5 flex items-end justify-between">
          <h2 className="text-lg font-bold text-white">Today&apos;s matchups</h2>
          <Link to="/games" className="text-sm font-medium text-brand-glow hover:text-brand">View all →</Link>
        </div>
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => <div key={i} className="card h-32 animate-pulse bg-surface-raised/40" />)}
          </div>
        ) : slate.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {slate.map((g) => <GameCard key={g.game_id} game={g} />)}
          </div>
        ) : (
          <div className="card p-6 text-sm text-slate-400">
            {apiDown
              ? "Live scoreboard unavailable — start the API on port 8001 to load today's slate."
              : "No games on today's slate."}
          </div>
        )}
      </section>

      {/* Standings + Leaders */}
      <section className="grid gap-6 lg:grid-cols-2">
        <StandingsCard />
        <LeadersCard />
      </section>

      {/* Player cards */}
      <section>
        <div className="mb-5 flex items-end justify-between">
          <h2 className="text-lg font-bold text-white">Around the league</h2>
          <Link to="/players" className="text-sm font-medium text-brand-glow hover:text-brand">Player search →</Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {PLAYER_CARDS.map((p) => <PlayerCard key={p.name} p={p} />)}
        </div>
      </section>
    </div>
  );
}
