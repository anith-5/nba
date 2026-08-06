import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.js";

// Black / red / white, minimal (Apple/Resend restraint). Red is used sparingly —
// the hero figure, the #1 rank, active states — never as filler.
const RED = "#ef4444";

// ── Realistic fallback data so the page is never empty (real snapshot preferred) ─
const STANDINGS = {
  East: [["BOS", "Celtics", 41, 12], ["CLE", "Cavaliers", 39, 14], ["NYK", "Knicks", 36, 17],
    ["MIL", "Bucks", 33, 20], ["ORL", "Magic", 32, 22], ["IND", "Pacers", 30, 23]],
  West: [["OKC", "Thunder", 43, 10], ["DEN", "Nuggets", 38, 15], ["MEM", "Grizzlies", 36, 18],
    ["HOU", "Rockets", 34, 19], ["LAL", "Lakers", 32, 21], ["DAL", "Mavericks", 31, 22]],
};
const SCORING_LEADERS = [
  ["Shai Gilgeous-Alexander", "OKC", 32.6], ["Giannis Antetokounmpo", "MIL", 30.4],
  ["Nikola Jokić", "DEN", 29.7], ["Luka Dončić", "DAL", 28.1], ["Jayson Tatum", "BOS", 27.8],
];
const CLUTCH_LEADERS = [
  ["Shai Gilgeous-Alexander", "OKC", 6.5], ["Anthony Edwards", "MIN", 5.6],
  ["Luka Dončić", "DAL", 5.4], ["Jalen Brunson", "NYK", 5.1], ["Nikola Jokić", "DEN", 4.8],
];

// ── Global search (StatMuse-style) ────────────────────────────────────────────
function SearchBar() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const nav = useNavigate();

  useEffect(() => {
    const onClick = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function search(val) {
    setQ(val);
    if (val.length < 2) { setResults([]); return; }
    try {
      const data = await api.searchPlayers(val);
      setResults((data.players ?? data).slice(0, 6));
      setOpen(true);
    } catch { setResults([]); }
  }
  function go(p) {
    nav(`/trajectory?player=${p.id}&name=${encodeURIComponent(p.full_name)}`);
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="flex items-center gap-3 rounded-2xl border border-white/12 bg-white/[0.03] px-4 py-3.5 transition focus-within:border-white/25">
        <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-zinc-500" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" />
        </svg>
        <input
          value={q}
          onChange={(e) => search(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={(e) => { if (e.key === "Enter" && results[0]) go(results[0]); }}
          placeholder="Search any player, stat, or matchup…"
          className="w-full bg-transparent text-[15px] text-white placeholder:text-zinc-600 focus:outline-none"
        />
        <kbd className="hidden shrink-0 rounded border border-white/10 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 sm:block">↵</kbd>
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-2xl border border-white/12 bg-[#0b0b0d] shadow-2xl">
          {results.map((p) => (
            <button key={p.id} onClick={() => go(p)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-white/[0.04]">
              <span className="grid h-7 w-7 place-items-center rounded-full border border-white/10 text-[11px] font-semibold text-zinc-400">
                {p.full_name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
              </span>
              <span className="text-sm text-white">{p.full_name}</span>
              {p.team && <span className="ml-auto text-xs text-zinc-600">{p.team}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Editorial hero (real scoring leader) ──────────────────────────────────────
function Hero({ leader, second }) {
  const [name, team, ppg] = leader;
  const gap = second ? (ppg - second[2]).toFixed(1) : null;
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0a0a0b] p-8 sm:p-10">
      <div className="flex flex-col justify-between gap-8 sm:flex-row sm:items-start">
        <div className="max-w-xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
            <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: RED }} />
            NBA Scoring Leader · Today
          </p>
          <h1 className="mt-4 text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-6xl">
            {name}
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-zinc-400">
            Leading the league at{" "}
            <span className="font-semibold text-white">{ppg} points per game</span>
            {gap ? <> — <span style={{ color: RED }}>{gap}</span> clear of {second[0]}.</> : "."}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Chip>#1 in the NBA</Chip>
            <Chip>{team}</Chip>
            {gap && <Chip accent>+{gap} vs #2</Chip>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-7xl font-bold leading-none tracking-tighter sm:text-8xl" style={{ color: RED }}>
            {ppg}
          </p>
          <p className="mt-1 text-xs font-medium uppercase tracking-widest text-zinc-500">Points / Game</p>
        </div>
      </div>
    </div>
  );
}

function Chip({ children, accent }) {
  return (
    <span
      className="rounded-full border px-3 py-1 text-xs font-medium"
      style={accent
        ? { borderColor: "rgba(239,68,68,0.35)", color: RED, background: "rgba(239,68,68,0.08)" }
        : { borderColor: "rgba(255,255,255,0.12)", color: "#d4d4d8" }}
    >
      {children}
    </span>
  );
}

// ── Leaders (ranked bars) ─────────────────────────────────────────────────────
function Leaders({ scoring, clutch }) {
  const [tab, setTab] = useState("Scoring");
  const rows = tab === "Scoring" ? scoring : clutch;
  const max = Math.max(...rows.map((r) => r[2]));
  const unit = tab === "Scoring" ? "PPG" : "CLU";
  return (
    <Panel title="Leaders"
      right={<Toggle options={["Scoring", "Clutch"]} value={tab} onChange={setTab} />}>
      <div className="space-y-3.5">
        {rows.map((r, i) => (
          <div key={r[0]} className="flex items-center gap-3">
            <span className="w-4 text-right font-mono text-xs" style={{ color: i === 0 ? RED : "#52525b" }}>{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium text-white">{r[0]}</span>
                <span className="shrink-0 font-mono text-sm tabular-nums text-zinc-300">
                  {r[2]}<span className="ml-1 text-[10px] text-zinc-600">{unit}</span>
                </span>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
                <div className="h-full rounded-full"
                  style={{ width: `${(r[2] / max) * 100}%`, background: i === 0 ? RED : "rgba(255,255,255,0.35)" }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ── Standings (minimal table) ─────────────────────────────────────────────────
function Standings({ standings }) {
  const [conf, setConf] = useState("West");
  const rows = standings[conf] ?? [];
  return (
    <Panel title="Standings" id="standings"
      right={<Toggle options={["East", "West"]} value={conf} onChange={setConf} />}>
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([tri, name, w, l], i) => (
            <tr key={tri} className="border-t border-white/[0.06] first:border-0">
              <td className="py-2.5 pr-3 font-mono text-xs" style={{ color: i === 0 ? RED : "#52525b" }}>{i + 1}</td>
              <td className="py-2.5">
                <span className="font-mono text-xs text-zinc-500">{tri}</span>
                <span className="ml-2.5 font-medium text-white">{name}</span>
              </td>
              <td className="py-2.5 text-right font-mono tabular-nums text-white">{w}<span className="text-zinc-600">–{l}</span></td>
              <td className="py-2.5 pl-3 text-right font-mono tabular-nums text-zinc-500">{(w / (w + l)).toFixed(3).slice(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

// ── Shared minimal primitives ─────────────────────────────────────────────────
function Panel({ title, right, children, id }) {
  return (
    <section id={id} className="rounded-3xl border border-white/10 bg-[#0a0a0b] p-6">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-400">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function Toggle({ options, value, onChange }) {
  return (
    <div className="flex gap-1">
      {options.map((o) => (
        <button key={o} onClick={() => onChange(o)} aria-pressed={value === o}
          className="rounded-full px-3 py-1 text-xs font-medium transition"
          style={value === o
            ? { color: "#fff", background: "rgba(239,68,68,0.9)" }
            : { color: "#71717a" }}>
          {o}
        </button>
      ))}
    </div>
  );
}

const TOOLS = [
  ["/shot-evaluator", "Shot Evaluator"], ["/draft-comps", "Draft Comps"],
  ["/trajectory", "Trajectory"], ["/clutch", "Clutch DNA"],
  ["/gm", "GM Assistant"], ["/scouting", "AI Scouting"],
];

export default function Home() {
  const [summary, setSummary] = useState(null);
  useEffect(() => { api.standings().then(setSummary).catch(() => {}); }, []);

  const standings = summary?.standings?.East?.length
    ? { East: summary.standings.East.map((t) => [t.tri, t.name, t.w, t.l]),
        West: summary.standings.West.map((t) => [t.tri, t.name, t.w, t.l]) }
    : STANDINGS;
  const scoring = summary?.scoring_leaders?.length
    ? summary.scoring_leaders.map((s) => [s.name, s.tri, s.ppg])
    : SCORING_LEADERS;
  const clutch = summary?.clutch_leaders?.length
    ? summary.clutch_leaders.map((c) => [c.name, c.tri, c.ppg])
    : CLUTCH_LEADERS;

  return (
    <div className="animate-fade-in">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="pt-2">
          <p className="mb-3 text-[13px] font-medium text-zinc-500">
            <span className="text-white">HoopIQ</span> — the numbers behind the game.
          </p>
          <SearchBar />
        </div>

        <Hero leader={scoring[0]} second={scoring[1]} />

        <div className="grid gap-6 lg:grid-cols-2">
          <Leaders scoring={scoring} clutch={clutch} />
          <Standings standings={standings} />
        </div>

        {/* Minimal tool index */}
        <section className="rounded-3xl border border-white/10 bg-[#0a0a0b] p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-zinc-400">Tools</h2>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-white/[0.06] sm:grid-cols-3">
            {TOOLS.map(([to, label]) => (
              <Link key={to} to={to}
                className="group flex items-center justify-between bg-[#0a0a0b] px-4 py-3.5 text-sm text-zinc-300 transition hover:bg-white/[0.03] hover:text-white">
                {label}
                <span className="text-zinc-700 transition group-hover:translate-x-0.5 group-hover:text-[color:#ef4444]">→</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
