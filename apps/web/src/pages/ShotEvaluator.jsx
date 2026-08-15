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
  "+": "text-stat-up",
  "-": "text-stat-down",
  "−": "text-stat-down",
  "~": "text-ink/70",
  i: "text-terracotta",
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
      <p className="hoop-stat-label">{label}</p>
      {selected && (
        <div className="mb-1 flex items-center gap-2">
          <InitialsTile name={selected.full_name} size="sm" />
          <span className="text-sm font-medium text-ink">{selected.full_name}</span>
          <button
            onClick={() => { onSelect(null); setQ(""); }}
            aria-label="Clear"
            className="ml-auto grid h-6 w-6 place-items-center rounded text-ink/60 hover:text-stat-down"
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
          className="w-full rounded-xl border border-ink/10 bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink/60 focus:border-terracotta focus:outline-none"
        />
        {results.length > 0 && (
          <div className="absolute z-20 mt-1 w-full divide-y divide-ink/5 overflow-hidden rounded-xl border border-ink/10 bg-paper-raised/95 shadow-card ">
            {results.map((p) => (
              <button
                key={p.id}
                onClick={() => pick(p)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-ink/5"
              >
                <InitialsTile name={p.full_name} size="sm" />
                <span className="text-sm text-ink">{p.full_name}</span>
                {p.team && <span className="ml-auto text-xs text-ink/60">{p.team}</span>}
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
        <h1 className="text-3xl font-bold text-ink">Shot Evaluator</h1>
        <p className="mt-1 text-ink/70">
          Grade any shot — pick the shooter, defender, court zone, and how open the look is.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Inputs ── */}
        <div className="hoop-card-outline space-y-5 p-6">
          <PlayerSearch label="Shooter (attacker)" onSelect={setShooter} selected={shooter} />
          <PlayerSearch label="Defender" onSelect={setDefender} selected={defender} />

          <div className="space-y-2">
            <p className="hoop-stat-label">Shot Zone</p>
            <div className="grid grid-cols-2 gap-2">
              {ZONES.map((z) => (
                <button
                  key={z}
                  onClick={() => setZone(z)}
                  aria-pressed={zone === z}
                  className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
                    zone === z
                      ? "border-terracotta/60 bg-terracotta/10 text-terracotta"
                      : "border-ink/10 bg-paper text-ink hover:border-ink/25"
                  }`}
                >
                  {z}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="hoop-stat-label">Defender Distance</p>
            <div className="grid grid-cols-2 gap-2">
              {DISTANCES.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setDistance(d.value)}
                  aria-pressed={distance === d.value}
                  className={`rounded-xl border px-3 py-2 text-left transition ${
                    distance === d.value ? "border-terracotta/60 bg-terracotta/10" : "border-ink/10 bg-paper hover:border-ink/25"
                  }`}
                >
                  <p className={`text-xs font-medium ${distance === d.value ? "text-terracotta" : "text-ink"}`}>{d.label}</p>
                  <p className="text-[11px] text-ink/60">{d.sub}</p>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={evaluate}
            disabled={loading || !shooter || !defender}
            className="hoop-btn-primary w-full py-3 text-base"
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

          {error && <p className="text-sm text-basketball">{error}</p>}
        </div>

        {/* ── Result ── */}
        {result ? (
          <div className="animate-slide-up space-y-4">
            <div className={`hoop-card-outline space-y-2 p-6 text-center ring-1 ${grade.ring}`}>
              <p className="text-sm text-ink/70">{result.shooter_name} vs {result.defender_name}</p>
              <p className="text-xs text-ink/60">
                {result.zone} · {DISTANCES.find((d) => d.value === result.defender_distance)?.label}
              </p>

              <div className="py-4">
                <span className={`font-hoop font-extrabold leading-none ${grade.text}`} style={{ fontSize: "6rem" }}>
                  {result.grade}
                </span>
              </div>

              <div className={`inline-block rounded-full border px-5 py-1.5 text-sm font-semibold ${
                good ? "border-stat-up/30 bg-stat-up/15 text-stat-up" : "border-stat-down/30 bg-stat-down/15 text-stat-down"
              }`}>
                {result.verdict}
              </div>

              <div className="pt-2">
                <p className="font-hoop text-2xl font-bold text-ink">
                  {result.ppp.toFixed(2)}
                  <span className="ml-1 text-sm font-normal text-ink/60">pts / possession</span>
                </p>
                <p className="mt-0.5 text-xs text-ink/50">
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
            <div className="hoop-card-outline space-y-3 p-4">
              <p className="hoop-stat-label">Estimated FG% Breakdown</p>
              {[
                { label: `${result.shooter_name} (zone est.)`, pct: result.shooter_zone_fg_est, color: "#3B82F6" },
                { label: "After defender quality", pct: Math.max(0, result.shooter_zone_fg_est + (result.final_fg_est - result.shooter_zone_fg_est) * 0.5), color: "#64748b" },
                { label: "Final (all factors)", pct: result.final_fg_est, color: finalBar },
              ].map((row) => (
                <div key={row.label} className="space-y-1">
                  <div className="flex justify-between text-xs text-ink/70">
                    <span>{row.label}</span>
                    <span className="font-mono text-ink">{(row.pct * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-ink/5">
                    <div className="h-1.5 rounded-full transition-all duration-700" style={{ width: `${Math.min(100, (row.pct * 100) / 0.75 * 100)}%`, backgroundColor: row.color }} />
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-2 text-xs text-ink/60">
                <div className="h-px flex-1 border-t border-dashed border-ink/10" />
                Zone avg: {(result.zone_league_avg_fg * 100).toFixed(0)}%
                <div className="h-px flex-1 border-t border-dashed border-ink/10" />
              </div>
            </div>

            {/* Factors */}
            <div className="hoop-card-outline space-y-2 p-4">
              <p className="hoop-stat-label mb-2">Shot Factors</p>
              {result.factors.map((f, i) => (
                <div key={i} className="flex items-start gap-2.5 text-sm">
                  <span className={`w-4 shrink-0 text-base font-bold leading-snug ${ICON_COLOR[f.icon] ?? "text-ink/70"}`}>
                    {f.icon === "i" ? "·" : f.icon}
                  </span>
                  <span className="leading-snug text-ink">{f.text}</span>
                </div>
              ))}
            </div>

            {/* Defender shot-defense impact (real matchup data), DRTG fallback */}
            {result.defender_matchup ? (
              <div className="hoop-card-outline flex items-center justify-between p-3">
                <div>
                  <span className="text-sm text-ink/70">{result.defender_name} shot defense</span>
                  <p className="text-[11px] text-ink/50">
                    Opp FG% guarded: {(result.defender_matchup.d_fg_pct * 100).toFixed(1)}% vs {(result.defender_matchup.normal_fg_pct * 100).toFixed(1)}% normal
                  </p>
                </div>
                <span className={`font-hoop text-lg font-bold ${
                  result.defender_matchup.pct_plusminus <= -0.02 ? "text-stat-down" : result.defender_matchup.pct_plusminus < 0.02 ? "text-basketball" : "text-stat-up"
                }`}>
                  {result.defender_matchup.pct_plusminus > 0 ? "+" : ""}{(result.defender_matchup.pct_plusminus * 100).toFixed(1)}%
                </span>
              </div>
            ) : (
              <div className="hoop-card-outline flex items-center justify-between p-3">
                <span className="text-sm text-ink/70">{result.defender_name} Defensive Rating</span>
                <span className={`font-hoop text-lg font-bold ${
                  result.defender_drtg <= 110 ? "text-stat-down" : result.defender_drtg <= 114 ? "text-basketball" : "text-stat-up"
                }`}>
                  {result.defender_drtg.toFixed(0)}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="hoop-card-outline flex min-h-[300px] flex-col items-center justify-center space-y-3 p-6 text-center">
            <div className="font-hoop text-6xl font-extrabold text-ink/10">A+</div>
            <p className="text-sm text-ink/50">
              Fill in the fields and click<br />&quot;Grade This Shot&quot; to see the result
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
