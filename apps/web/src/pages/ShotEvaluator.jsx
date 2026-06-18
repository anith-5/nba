import { useState } from "react";
import { api } from "../api.js";

const ZONES = [
  "Restricted Area",
  "In The Paint (Non-RA)",
  "Mid-Range",
  "Left Corner 3",
  "Right Corner 3",
  "Above the Break 3",
];

const DISTANCES = [
  { value: "tight",     label: "Tight (0-2 ft)",    sub: "Heavily contested" },
  { value: "close",     label: "Close (2-4 ft)",     sub: "Contested" },
  { value: "open",      label: "Open (4-6 ft)",      sub: "Clean look" },
  { value: "wide_open", label: "Wide Open (6+ ft)",  sub: "Uncontested" },
];

const GRADE_COLOR = {
  "A+": "#22c55e", "A": "#4ade80", "A-": "#86efac",
  "B+": "#60a5fa", "B": "#93c5fd", "B-": "#bfdbfe",
  "C+": "#facc15", "C": "#fde047", "C-": "#fef08a",
  "D+": "#fb923c", "D": "#fdba74",
  "F":  "#f87171",
};

const ICON_COLOR = {
  "+": "text-green-400",
  "-": "text-red-400",
  "~": "text-slate-400",
  "i": "text-blue-400",
  "−": "text-red-400",
};

function PlayerSearch({ label, onSelect, selected }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);

  async function search(val) {
    setQ(val);
    if (val.length < 2) { setResults([]); return; }
    try {
      const data = await api.searchPlayers(val);
      setResults((data.players ?? data).slice(0, 7));
    } catch {}
  }

  function pick(p) {
    onSelect(p);
    setQ(p.full_name);
    setResults([]);
  }

  return (
    <div className="space-y-1.5">
      <p className="stat-label">{label}</p>
      {selected && (
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm text-white font-medium">{selected.full_name}</span>
          <button onClick={() => { onSelect(null); setQ(""); }}
            className="text-xs text-slate-500 hover:text-red-400">✕</button>
        </div>
      )}
      <div className="relative">
        <input
          value={q}
          onChange={e => search(e.target.value)}
          placeholder={selected ? "Change player…" : "Search player…"}
          className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500"
        />
        {results.length > 0 && (
          <div className="absolute z-20 mt-1 w-full rounded border border-slate-700 bg-slate-900 shadow-xl divide-y divide-slate-800">
            {results.map(p => (
              <button key={p.id} onClick={() => pick(p)}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-800 text-left">
                <span className="text-sm text-white">{p.full_name}</span>
                {p.team && <span className="text-xs text-slate-500">{p.team}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ShotEvaluator() {
  const [shooter, setShooter] = useState(null);
  const [defender, setDefender] = useState(null);
  const [zone, setZone] = useState("Mid-Range");
  const [distance, setDistance] = useState("close");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function evaluate() {
    if (!shooter || !defender) { setError("Select both a shooter and a defender."); return; }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.evaluateShot({
        shooter_id: String(shooter.id),
        defender_id: String(defender.id),
        zone,
        defender_distance: distance,
      });
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const gradeColor = result ? (GRADE_COLOR[result.grade] ?? "#94a3b8") : null;

  return (
    <div className="animate-fade-in space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-white">Shot Evaluator</h1>
        <p className="mt-1 text-slate-400">
          Grade any shot — pick the shooter, defender, court zone, and how open the look is.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Inputs ── */}
        <div className="card p-6 space-y-5">
          <PlayerSearch label="Shooter (attacker)" onSelect={setShooter} selected={shooter} />
          <PlayerSearch label="Defender" onSelect={setDefender} selected={defender} />

          {/* Zone */}
          <div className="space-y-2">
            <p className="stat-label">Shot Zone</p>
            <div className="grid grid-cols-2 gap-2">
              {ZONES.map(z => (
                <button
                  key={z}
                  onClick={() => setZone(z)}
                  className={`rounded-lg border px-3 py-2 text-xs text-left transition ${
                    zone === z
                      ? "border-court/60 bg-court/10 text-court-glow"
                      : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  {z}
                </button>
              ))}
            </div>
          </div>

          {/* Distance */}
          <div className="space-y-2">
            <p className="stat-label">Defender Distance</p>
            <div className="grid grid-cols-2 gap-2">
              {DISTANCES.map(d => (
                <button
                  key={d.value}
                  onClick={() => setDistance(d.value)}
                  className={`rounded-lg border px-3 py-2 text-left transition ${
                    distance === d.value
                      ? "border-court/60 bg-court/10"
                      : "border-slate-700 bg-slate-900 hover:border-slate-500"
                  }`}
                >
                  <p className={`text-xs font-medium ${distance === d.value ? "text-court-glow" : "text-white"}`}>
                    {d.label}
                  </p>
                  <p className="text-[11px] text-slate-500">{d.sub}</p>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={evaluate}
            disabled={loading || !shooter || !defender}
            className="btn-primary w-full py-3 text-base disabled:opacity-40"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                Evaluating…
              </span>
            ) : "Grade This Shot"}
          </button>

          {error && <p className="text-amber-300 text-sm">{error}</p>}
        </div>

        {/* ── Result ── */}
        {result ? (
          <div className="space-y-4 animate-slide-up">
            {/* Grade card */}
            <div className="card p-6 text-center space-y-2"
              style={{ borderColor: `${gradeColor}40` }}>
              <p className="text-sm text-slate-400">
                {result.shooter_name} vs {result.defender_name}
              </p>
              <p className="text-xs text-slate-500">{result.zone} · {DISTANCES.find(d => d.value === result.defender_distance)?.label}</p>

              {/* Big grade */}
              <div className="py-4">
                <span className="font-mono font-black leading-none"
                  style={{ fontSize: "6rem", color: gradeColor }}>
                  {result.grade}
                </span>
              </div>

              {/* Verdict banner */}
              <div className={`inline-block rounded-full px-5 py-1.5 text-sm font-semibold ${
                result.verdict === "Good Shot"
                  ? "bg-green-500/15 text-green-400 border border-green-500/30"
                  : "bg-red-500/15 text-red-400 border border-red-500/30"
              }`}>
                {result.verdict}
              </div>

              {/* PPP metric */}
              <div className="pt-2">
                <p className="text-2xl font-bold font-mono text-white">
                  {result.ppp.toFixed(2)}
                  <span className="text-sm text-slate-500 font-normal ml-1">pts / possession</span>
                </p>
                <p className="text-xs text-slate-600 mt-0.5">
                  League avg: 1.05 PPP · Est. FG%: {(result.final_fg_est * 100).toFixed(1)}% vs {(result.zone_league_avg_fg * 100).toFixed(0)}% zone avg
                </p>
              </div>
            </div>

            {/* FG% breakdown bar */}
            <div className="card p-4 space-y-3">
              <p className="stat-label">Estimated FG% Breakdown</p>

              {[
                { label: `${result.shooter_name} (zone est.)`, pct: result.shooter_zone_fg_est, color: "#60a5fa" },
                { label: "After defender quality", pct: Math.max(0, result.shooter_zone_fg_est + (result.final_fg_est - result.shooter_zone_fg_est) * 0.5), color: "#f97316" },
                { label: "Final (all factors)", pct: result.final_fg_est, color: gradeColor },
              ].map(row => (
                <div key={row.label} className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>{row.label}</span>
                    <span className="font-mono text-white">{(row.pct * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-800">
                    <div className="h-1.5 rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(100, row.pct * 100 / 0.75 * 100)}%`, backgroundColor: row.color }} />
                  </div>
                </div>
              ))}

              {/* Zone avg line */}
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <div className="h-px flex-1 border-t border-dashed border-slate-700" />
                Zone avg: {(result.zone_league_avg_fg * 100).toFixed(0)}%
                <div className="h-px flex-1 border-t border-dashed border-slate-700" />
              </div>
            </div>

            {/* Factor list */}
            <div className="card p-4 space-y-2">
              <p className="stat-label mb-2">Shot Factors</p>
              {result.factors.map((f, i) => (
                <div key={i} className="flex gap-2.5 items-start text-sm">
                  <span className={`font-bold text-base leading-snug w-4 shrink-0 ${ICON_COLOR[f.icon] ?? "text-slate-400"}`}>
                    {f.icon === "i" ? "·" : f.icon}
                  </span>
                  <span className="text-slate-300 leading-snug">{f.text}</span>
                </div>
              ))}
            </div>

            {/* Defender DRTG badge */}
            <div className="card p-3 flex items-center justify-between">
              <span className="text-sm text-slate-400">{result.defender_name} Defensive Rating</span>
              <span className={`font-mono font-bold text-lg ${
                result.defender_drtg <= 110 ? "text-red-400" :
                result.defender_drtg <= 114 ? "text-yellow-400" : "text-green-400"
              }`}>{result.defender_drtg.toFixed(0)}</span>
            </div>
          </div>
        ) : (
          <div className="card p-6 flex flex-col items-center justify-center text-center space-y-3 min-h-[300px]">
            <div className="text-6xl font-black font-mono text-slate-800">A+</div>
            <p className="text-slate-600 text-sm">Fill in the fields and click<br />"Grade This Shot" to see the result</p>
          </div>
        )}
      </div>
    </div>
  );
}
