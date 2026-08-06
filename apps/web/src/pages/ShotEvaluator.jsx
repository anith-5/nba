import { useState } from "react";
import { api } from "../api.js";
import { InitialsTile } from "../components/TeamTile.jsx";
import { gradeClasses, gradeHex } from "../lib/grades.js";
import ShareButton from "../components/ShareCard.jsx";

const ZONES = [
  "Restricted Area",
  "In The Paint (Non-RA)",
  "Mid-Range",
  "Left Corner 3",
  "Right Corner 3",
  "Above the Break 3",
];

const DISTANCES = [
  { value: "tight", label: "Tight (0-2 ft)", sub: "Heavily contested" },
  { value: "close", label: "Close (2-4 ft)", sub: "Contested" },
  { value: "open", label: "Open (4-6 ft)", sub: "Clean look" },
  { value: "wide_open", label: "Wide Open (6+ ft)", sub: "Uncontested" },
];

const ICON_COLOR = {
  "+": "text-emerald-400",
  "-": "text-red-400",
  "−": "text-red-400",
  "~": "text-slate-400",
  i: "text-brand-glow",
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
        <div className="mb-1 flex items-center gap-2">
          <InitialsTile name={selected.full_name} size="sm" />
          <span className="text-sm font-medium text-white">{selected.full_name}</span>
          <button
            onClick={() => { onSelect(null); setQ(""); }}
            aria-label="Clear"
            className="ml-auto grid h-6 w-6 place-items-center rounded text-slate-500 hover:text-red-400"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6 6l8 8M14 6l-8 8" /></svg>
          </button>
        </div>
      )}
      <div className="relative">
        <input
          value={q}
          onChange={(e) => search(e.target.value)}
          placeholder={selected ? "Change player…" : "Search player…"}
          className="w-full rounded-xl border border-white/10 bg-surface px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-brand focus:outline-none"
        />
        {results.length > 0 && (
          <div className="absolute z-20 mt-1 w-full divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10 bg-surface-raised/95 shadow-card backdrop-blur-xl">
            {results.map((p) => (
              <button
                key={p.id}
                onClick={() => pick(p)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-white/5"
              >
                <InitialsTile name={p.full_name} size="sm" />
                <span className="text-sm text-white">{p.full_name}</span>
                {p.team && <span className="ml-auto text-xs text-slate-500">{p.team}</span>}
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

  const grade = result && gradeClasses(result.grade);
  const good = result?.verdict === "Good Shot";
  const finalBar = good ? "#34d399" : "#f87171";

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
        <div className="card space-y-5 p-6">
          <PlayerSearch label="Shooter (attacker)" onSelect={setShooter} selected={shooter} />
          <PlayerSearch label="Defender" onSelect={setDefender} selected={defender} />

          <div className="space-y-2">
            <p className="stat-label">Shot Zone</p>
            <div className="grid grid-cols-2 gap-2">
              {ZONES.map((z) => (
                <button
                  key={z}
                  onClick={() => setZone(z)}
                  aria-pressed={zone === z}
                  className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
                    zone === z
                      ? "border-brand/60 bg-brand/10 text-brand-glow"
                      : "border-white/10 bg-surface text-slate-300 hover:border-white/25"
                  }`}
                >
                  {z}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="stat-label">Defender Distance</p>
            <div className="grid grid-cols-2 gap-2">
              {DISTANCES.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setDistance(d.value)}
                  aria-pressed={distance === d.value}
                  className={`rounded-xl border px-3 py-2 text-left transition ${
                    distance === d.value ? "border-brand/60 bg-brand/10" : "border-white/10 bg-surface hover:border-white/25"
                  }`}
                >
                  <p className={`text-xs font-medium ${distance === d.value ? "text-brand-glow" : "text-white"}`}>{d.label}</p>
                  <p className="text-[11px] text-slate-500">{d.sub}</p>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={evaluate}
            disabled={loading || !shooter || !defender}
            className="btn-primary w-full py-3 text-base"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Evaluating…
              </span>
            ) : "Grade This Shot"}
          </button>

          {error && <p className="text-sm text-amber-300">{error}</p>}
        </div>

        {/* ── Result ── */}
        {result ? (
          <div className="animate-slide-up space-y-4">
            <div className={`card space-y-2 p-6 text-center ring-1 ${grade.ring}`}>
              <p className="text-sm text-slate-400">{result.shooter_name} vs {result.defender_name}</p>
              <p className="text-xs text-slate-500">
                {result.zone} · {DISTANCES.find((d) => d.value === result.defender_distance)?.label}
              </p>

              <div className="py-4">
                <span className={`font-display font-extrabold leading-none ${grade.text}`} style={{ fontSize: "6rem" }}>
                  {result.grade}
                </span>
              </div>

              <div className={`inline-block rounded-full border px-5 py-1.5 text-sm font-semibold ${
                good ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-400" : "border-red-500/30 bg-red-500/15 text-red-400"
              }`}>
                {result.verdict}
              </div>

              <div className="pt-2">
                <p className="font-display text-2xl font-bold text-white">
                  {result.ppp.toFixed(2)}
                  <span className="ml-1 text-sm font-normal text-slate-500">pts / possession</span>
                </p>
                <p className="mt-0.5 text-xs text-slate-600">
                  League avg: 1.05 PPP · Est. FG%: {(result.final_fg_est * 100).toFixed(1)}% vs {(result.zone_league_avg_fg * 100).toFixed(0)}% zone avg
                </p>
              </div>

              <div className="flex justify-center pt-2">
                <ShareButton
                  eyebrow="Shot Grade"
                  title={result.shooter_name}
                  subtitle={`vs ${result.defender_name} · ${result.zone}`}
                  bigValue={result.grade}
                  bigLabel={result.verdict}
                  accent={gradeHex(result.grade)}
                  rows={[
                    { label: "PPP", value: result.ppp.toFixed(2) },
                    { label: "Est FG%", value: `${(result.final_fg_est * 100).toFixed(0)}%` },
                    { label: "Contest", value: { tight: "Tight", close: "Close", open: "Open", wide_open: "Wide" }[result.defender_distance] || "—" },
                  ]}
                />
              </div>
            </div>

            {/* FG% breakdown */}
            <div className="card space-y-3 p-4">
              <p className="stat-label">Estimated FG% Breakdown</p>
              {[
                { label: `${result.shooter_name} (zone est.)`, pct: result.shooter_zone_fg_est, color: "#3B82F6" },
                { label: "After defender quality", pct: Math.max(0, result.shooter_zone_fg_est + (result.final_fg_est - result.shooter_zone_fg_est) * 0.5), color: "#64748b" },
                { label: "Final (all factors)", pct: result.final_fg_est, color: finalBar },
              ].map((row) => (
                <div key={row.label} className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>{row.label}</span>
                    <span className="font-mono text-white">{(row.pct * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5">
                    <div className="h-1.5 rounded-full transition-all duration-700" style={{ width: `${Math.min(100, (row.pct * 100) / 0.75 * 100)}%`, backgroundColor: row.color }} />
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <div className="h-px flex-1 border-t border-dashed border-white/10" />
                Zone avg: {(result.zone_league_avg_fg * 100).toFixed(0)}%
                <div className="h-px flex-1 border-t border-dashed border-white/10" />
              </div>
            </div>

            {/* Factors */}
            <div className="card space-y-2 p-4">
              <p className="stat-label mb-2">Shot Factors</p>
              {result.factors.map((f, i) => (
                <div key={i} className="flex items-start gap-2.5 text-sm">
                  <span className={`w-4 shrink-0 text-base font-bold leading-snug ${ICON_COLOR[f.icon] ?? "text-slate-400"}`}>
                    {f.icon === "i" ? "·" : f.icon}
                  </span>
                  <span className="leading-snug text-slate-300">{f.text}</span>
                </div>
              ))}
            </div>

            {/* Defender shot-defense impact (real matchup data), DRTG fallback */}
            {result.defender_matchup ? (
              <div className="card flex items-center justify-between p-3">
                <div>
                  <span className="text-sm text-slate-400">{result.defender_name} shot defense</span>
                  <p className="text-[11px] text-slate-600">
                    Opp FG% guarded: {(result.defender_matchup.d_fg_pct * 100).toFixed(1)}% vs {(result.defender_matchup.normal_fg_pct * 100).toFixed(1)}% normal
                  </p>
                </div>
                <span className={`font-display text-lg font-bold ${
                  result.defender_matchup.pct_plusminus <= -0.02 ? "text-red-400" : result.defender_matchup.pct_plusminus < 0.02 ? "text-amber-400" : "text-emerald-400"
                }`}>
                  {result.defender_matchup.pct_plusminus > 0 ? "+" : ""}{(result.defender_matchup.pct_plusminus * 100).toFixed(1)}%
                </span>
              </div>
            ) : (
              <div className="card flex items-center justify-between p-3">
                <span className="text-sm text-slate-400">{result.defender_name} Defensive Rating</span>
                <span className={`font-display text-lg font-bold ${
                  result.defender_drtg <= 110 ? "text-red-400" : result.defender_drtg <= 114 ? "text-amber-400" : "text-emerald-400"
                }`}>
                  {result.defender_drtg.toFixed(0)}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="card flex min-h-[300px] flex-col items-center justify-center space-y-3 p-6 text-center">
            <div className="font-display text-6xl font-extrabold text-white/10">A+</div>
            <p className="text-sm text-slate-600">
              Fill in the fields and click<br />&quot;Grade This Shot&quot; to see the result
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
