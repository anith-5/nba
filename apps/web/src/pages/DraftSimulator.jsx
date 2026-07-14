import { useEffect, useState } from "react";
import { api } from "../api.js";
import { InitialsTile } from "../components/TeamTile.jsx";
import { gradeClasses } from "../lib/grades.js";

const RISK_COLOR = { Low: "text-emerald-400", Medium: "text-amber-400", High: "text-red-400" };
const MAX_REAL_YEAR = 2025; // latest real NBA draft (Historical / Redraft cap)

function ModeIcon({ name }) {
  const paths = {
    future: <path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2M12 8a4 4 0 100 8 4 4 0 000-8z" />,
    historical: <><path d="M12 8v4l3 2" /><circle cx="12" cy="12" r="9" /></>,
    redraft: <path d="M4 12a8 8 0 0114-5m2-2v5h-5M20 12a8 8 0 01-14 5m-2 2v-5h5" />,
  };
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

function Chip({ label, value, className = "text-slate-300" }) {
  return (
    <span className="text-[11px] text-slate-500">
      {label}: <span className={`font-medium ${className}`}>{value}</span>
    </span>
  );
}

// ── Prospect card on the big board ────────────────────────────────────────────
function ProspectRow({ p, onPick, pickable }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-white/5 bg-surface/60 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="w-6 shrink-0 text-center font-mono text-xs text-slate-500">#{p.rank}</span>
          <InitialsTile name={p.name} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-semibold text-white">{p.name}</p>
            <p className="truncate text-xs text-slate-500">
              {p.position} · {p.origin} {p.height ? `· ${p.height}` : ""}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {p.comparison && <span className="hidden text-[11px] text-slate-400 sm:inline">≈ {p.comparison}</span>}
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Collapse" : "Expand"}
            className="grid h-6 w-6 place-items-center rounded text-slate-500 hover:text-white"
          >
            <svg viewBox="0 0 20 20" className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M5.5 7.5L10 12l4.5-4.5" />
            </svg>
          </button>
          {pickable && (
            <button onClick={() => onPick(p)} className="btn-primary px-3 py-1 text-xs">Draft</button>
          )}
        </div>
      </div>
      {open && (
        <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
          <div>
            <p className="mb-0.5 font-semibold text-emerald-400">Strengths</p>
            <ul className="space-y-0.5 text-slate-400">
              {(p.strengths || []).map((s, i) => <li key={i}>+ {s}</li>)}
            </ul>
          </div>
          <div>
            <p className="mb-0.5 font-semibold text-red-400">Weaknesses</p>
            <ul className="space-y-0.5 text-slate-400">
              {(p.weaknesses || []).map((w, i) => <li key={i}>− {w}</li>)}
            </ul>
          </div>
          {p.projection && <p className="text-slate-400 sm:col-span-2">Projection: {p.projection}</p>}
        </div>
      )}
    </div>
  );
}

// ── A completed pick (with grade if user-made) ────────────────────────────────
function PickCard({ pick }) {
  const g = pick.grade;
  const grade = g && gradeClasses(g);
  return (
    <div className="flex items-start gap-3 rounded-xl border border-white/5 bg-surface/60 p-3">
      <span className="w-8 shrink-0 font-mono text-sm text-slate-500">{pick.pick}.</span>
      <InitialsTile name={pick.prospect} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-white">
          <span className="font-semibold">{pick.team}</span> select{" "}
          <span className="font-display font-semibold text-brand-glow">{pick.prospect}</span>
        </p>
        {pick.reasoning && <p className="mt-0.5 text-xs text-slate-500">{pick.reasoning}</p>}
        {pick.analysis && <p className="mt-1 text-xs text-slate-400">{pick.analysis}</p>}
        {(pick.fit || pick.comparison || pick.peak_rating != null) && (
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {pick.comparison && <Chip label="Comp" value={pick.comparison} />}
            {pick.peak_rating != null && <Chip label="Peak" value={`${pick.peak_rating} OVR`} />}
            {pick.allstar_pct != null && <Chip label="All-Star" value={`${pick.allstar_pct}%`} className="text-brand-glow" />}
            {pick.bust_pct != null && <Chip label="Bust" value={`${pick.bust_pct}%`} className="text-orange-400" />}
            {pick.risk && <span className={`text-[11px] font-medium ${RISK_COLOR[pick.risk] ?? "text-slate-400"}`}>{pick.risk} risk</span>}
          </div>
        )}
        {pick.fit && <p className="mt-1 text-xs text-slate-400">{pick.fit}</p>}
      </div>
      {grade && (
        <span className={`shrink-0 font-display text-3xl font-extrabold leading-none ${grade.text}`}>{g}</span>
      )}
    </div>
  );
}

export default function DraftSimulator() {
  const [aiReady, setAiReady] = useState(true);
  const [mode, setMode] = useState("future");
  const [year, setYear] = useState(2027);
  const [rounds, setRounds] = useState(1);
  const [controlTeam, setControlTeam] = useState("");

  const [phase, setPhase] = useState("setup");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(null);

  const [draft, setDraft] = useState(null);
  const [available, setAvailable] = useState([]);
  const [picks, setPicks] = useState([]);
  const [current, setCurrent] = useState(1);
  const [redraft, setRedraft] = useState(null);

  useEffect(() => {
    api.draftStatus().then((s) => setAiReady(s.ai_available)).catch(() => {});
  }, []);

  function reset() {
    setPhase("setup"); setDraft(null); setAvailable([]); setPicks([]);
    setCurrent(1); setRedraft(null); setError(null);
  }

  // Historical / Redraft are real past drafts — cap at the latest one (2025).
  const isPast = mode !== "future";
  function changeMode(v) {
    setMode(v);
    if (v !== "future" && Number(year) > MAX_REAL_YEAR) setYear(MAX_REAL_YEAR);
  }
  function onYearChange(e) {
    let y = e.target.value;
    if (isPast && Number(y) > MAX_REAL_YEAR) y = String(MAX_REAL_YEAR);
    setYear(y);
  }

  async function startDraft() {
    setLoading(true); setError(null);
    setStatus("Generating the draft class, big board & order… ~30–45s (scouting every prospect)");
    try {
      const data = await api.draftSetup({ year: Number(year), rounds: Number(rounds), mode });
      setDraft(data);
      setAvailable(data.big_board || []);
      setPicks([]);
      setCurrent(1);
      setPhase(controlTeam ? "drafting" : "board");
      if (controlTeam) await advanceToUser(1, data, data.big_board || [], []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); setStatus(""); }
  }

  async function runRedraft() {
    setLoading(true); setError(null);
    setStatus("Re-ranking the class by real career outcomes… ~20–40s");
    try {
      const count = Number(rounds) === 1 ? 14 : 30;
      const data = await api.draftRedraft({ year: Number(year), count });
      setRedraft(data);
      setPhase("redraft");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); setStatus(""); }
  }

  async function advanceToUser(fromPick, draftData, avail, made) {
    const order = draftData.draft_order || [];
    const totalPicks = draftData.picks || order.length;
    const userPickNum = order.find((o) => o.pick >= fromPick && o.team === controlTeam)?.pick;
    const simTo = userPickNum ? userPickNum - 1 : totalPicks;

    if (simTo >= fromPick) {
      setStatus(`Front offices are drafting picks ${fromPick}–${simTo}…`);
      const res = await api.draftSimulate({
        year: draftData.year, mode: draftData.mode,
        from_pick: fromPick, to_pick: simTo,
        draft_order: order, available: avail,
        already_picked: made.map((p) => p.prospect),
      });
      const simPicks = res.picks || [];
      const pickedNames = new Set(simPicks.map((p) => p.prospect));
      avail = avail.filter((a) => !pickedNames.has(a.name));
      made = [...made, ...simPicks];
      setPicks(made);
      setAvailable(avail);
    }
    setCurrent(userPickNum || totalPicks + 1);
    setStatus("");
    if (!userPickNum) setPhase("done");
    return { avail, made, userPick: userPickNum };
  }

  async function userPick(prospect) {
    setLoading(true); setStatus(`Grading the ${controlTeam}'s pick…`);
    try {
      const order = draft.draft_order || [];
      const needs = order.find((o) => o.pick === current)?.needs || [];
      const grade = await api.draftPick({
        year: draft.year, mode: draft.mode, pick_number: current,
        team: controlTeam, prospect, team_needs: needs,
      });
      const made = [...picks, { pick: current, team: controlTeam, prospect: prospect.name, ...grade }];
      const avail = available.filter((a) => a.name !== prospect.name);
      setPicks(made); setAvailable(avail);
      await advanceToUser(current + 1, draft, avail, made);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); setStatus(""); }
  }

  const onClockTeam = (draft?.draft_order || []).find((o) => o.pick === current)?.team;
  const isUserOnClock = phase === "drafting" && onClockTeam === controlTeam;

  const MODES = [
    ["future", "Future", "Generate & draft a future class"],
    ["historical", "Historical", "Real class, pre-draft scouting"],
    ["redraft", "Redraft", "Real order vs. career results"],
  ];

  return (
    <div className="animate-fade-in space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-white">Draft Simulator</h1>
        <p className="mt-1 text-slate-400">
          Generate a future class, control any team on the clock, or redraft history by career results.
        </p>
      </header>

      {!aiReady && (
        <div className="card border border-amber-500/30 p-3 text-sm text-amber-300">
          AI is unavailable — set ANTHROPIC_API_KEY for the Draft Simulator to work.
        </div>
      )}

      {/* ── Setup ── */}
      {phase === "setup" && (
        <div className="card max-w-2xl space-y-5 p-6">
          <div>
            <p className="stat-label mb-2">Mode</p>
            <div className="grid grid-cols-3 gap-2">
              {MODES.map(([v, label, sub]) => (
                <button
                  key={v}
                  onClick={() => changeMode(v)}
                  aria-pressed={mode === v}
                  className={`rounded-xl border px-3 py-2.5 text-left transition ${
                    mode === v ? "border-brand/60 bg-brand/10" : "border-white/10 bg-surface hover:border-white/25"
                  }`}
                >
                  <p className={`flex items-center gap-1.5 text-sm font-semibold ${mode === v ? "text-brand-glow" : "text-white"}`}>
                    <ModeIcon name={v} />
                    {label}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{sub}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="stat-label">Draft year</span>
              <input type="number" value={year} onChange={onYearChange}
                max={isPast ? MAX_REAL_YEAR : undefined}
                className="mt-1 w-full rounded-xl border border-white/10 bg-surface px-3 py-2 text-white focus:border-brand focus:outline-none" />
              {isPast && (
                <span className="mt-1 block text-[11px] text-slate-500">
                  Real drafts available through {MAX_REAL_YEAR}.
                </span>
              )}
            </label>
            <label className="block text-sm">
              <span className="stat-label">Rounds</span>
              <select value={rounds} onChange={(e) => setRounds(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-surface px-3 py-2 text-white focus:border-brand focus:outline-none">
                <option value={1}>Round 1 (30 picks)</option>
                <option value={2}>Both rounds (60 picks)</option>
              </select>
            </label>
          </div>

          {mode !== "redraft" && (
            <label className="block text-sm">
              <span className="stat-label">Team you control (optional)</span>
              <input value={controlTeam} onChange={(e) => setControlTeam(e.target.value)}
                placeholder="e.g. San Antonio Spurs — leave blank to spectate"
                className="mt-1 w-full rounded-xl border border-white/10 bg-surface px-3 py-2 text-white placeholder:text-slate-600 focus:border-brand focus:outline-none" />
              <span className="text-[11px] text-slate-600">
                Type the team exactly as it&apos;ll appear in the order (you can adjust after the board loads).
              </span>
            </label>
          )}

          <button onClick={mode === "redraft" ? runRedraft : startDraft}
            disabled={loading || !aiReady}
            className="btn-primary w-full py-3">
            {loading ? (status || "Working…") :
              mode === "redraft" ? "Run Redraft" :
              controlTeam ? "Start Draft — you're on the clock" : "Generate Big Board"}
          </button>
          {error && <p className="text-sm text-amber-300">{error}</p>}
        </div>
      )}

      {/* ── Header during draft ── */}
      {(phase === "board" || phase === "drafting" || phase === "done") && draft && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold capitalize text-white">{draft.mode} · {draft.year} Draft</h2>
            {draft.summary && <p className="max-w-2xl text-sm text-slate-400">{draft.summary}</p>}
          </div>
          <button onClick={reset} className="btn-ghost text-sm">↺ New Draft</button>
        </div>
      )}

      {/* ── Running-simulation status (orange = live/running) ── */}
      {loading && phase !== "setup" && status && (
        <div className="card flex items-center gap-2 border border-live/30 bg-live/5 p-3 text-sm text-live-glow">
          <span className="live-dot" />
          {status}
        </div>
      )}

      {/* ── Drafting / board view ── */}
      {(phase === "board" || phase === "drafting" || phase === "done") && draft && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left: picks made */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="stat-label">
                {phase === "done" ? "Final Draft Results" : `Pick ${current}${onClockTeam ? ` — ${onClockTeam}` : ""}`}
              </p>
              {isUserOnClock && (
                <span className="live-badge"><span className="live-dot" /> On the clock</span>
              )}
            </div>
            {isUserOnClock && (
              <div className="card border border-live/40 bg-live/5 p-3 text-sm text-live-glow">
                You&apos;re on the clock with pick #{current}. Choose from the board →
              </div>
            )}
            <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
              {[...picks].reverse().map((p, i) => <PickCard key={`${p.pick}-${i}`} pick={p} />)}
              {picks.length === 0 && <p className="text-sm text-slate-600">No picks made yet.</p>}
            </div>
          </div>

          {/* Right: available board */}
          <div className="space-y-2">
            <p className="stat-label">Available — Big Board ({available.length})</p>
            <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
              {available.map((p) => (
                <ProspectRow key={p.name} p={p} onPick={userPick} pickable={isUserOnClock && !loading} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Redraft view ── */}
      {phase === "redraft" && redraft && (
        <div className="animate-slide-up space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 font-display text-xl font-bold text-white">
                {redraft.year} Redraft
                {redraft.grounded && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                    <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 10l4 4 8-8" /></svg>
                    real draft data
                  </span>
                )}
              </h2>
              {redraft.summary && <p className="max-w-2xl text-sm text-slate-400">{redraft.summary}</p>}
            </div>
            <button onClick={reset} className="btn-ghost text-sm">↺ New Draft</button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {redraft.biggest_steal && (
              <div className="card border border-emerald-500/20 p-3">
                <p className="stat-label text-emerald-400">Biggest Steal</p>
                <p className="font-semibold text-white">{redraft.biggest_steal.name}
                  <span className="ml-2 text-xs text-slate-500">originally #{redraft.biggest_steal.original_pick}</span></p>
                <p className="mt-0.5 text-xs text-slate-400">{redraft.biggest_steal.why}</p>
              </div>
            )}
            {redraft.biggest_bust && (
              <div className="card border border-red-500/20 p-3">
                <p className="stat-label text-red-400">Biggest Bust</p>
                <p className="font-semibold text-white">{redraft.biggest_bust.name}
                  <span className="ml-2 text-xs text-slate-500">originally #{redraft.biggest_bust.original_pick}</span></p>
                <p className="mt-0.5 text-xs text-slate-400">{redraft.biggest_bust.why}</p>
              </div>
            )}
          </div>

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-left text-xs text-slate-500">
                  <th className="px-3 py-2 font-medium">New</th>
                  <th className="px-3 py-2 font-medium">Player</th>
                  <th className="px-3 py-2 font-medium">Was</th>
                  <th className="px-3 py-2 font-medium">Move</th>
                  <th className="hidden px-3 py-2 font-medium sm:table-cell">Career</th>
                </tr>
              </thead>
              <tbody>
                {(redraft.redraft || []).map((r) => (
                  <tr key={r.new_rank} className="border-t border-white/5 hover:bg-white/5">
                    <td className="px-3 py-2 font-mono font-bold text-brand-glow">#{r.new_rank}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <InitialsTile name={r.name} size="sm" />
                        <div>
                          <p className="font-medium text-white">{r.name}</p>
                          <p className="text-[11px] text-slate-500">{r.accolades}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-400">
                      #{r.original_pick}<br /><span className="text-slate-600">{r.original_team}</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{r.movement}</td>
                    <td className="hidden px-3 py-2 text-xs text-slate-400 sm:table-cell">{r.career_summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
