import { useEffect, useState } from "react";
import { api } from "../api.js";
import { InitialsTile } from "../components/TeamTile.jsx";
import { gradeClasses } from "../lib/grades.js";

const RISK_COLOR = { Low: "text-ink", Medium: "text-terracotta", High: "text-stat-down" };
const MAX_HISTORICAL_YEAR = 2026; // latest draft that has actually happened
const MAX_REDRAFT_YEAR = 2025;    // redraft needs real careers — newest class has none yet

function ModeIcon({ name }) {
  const paths = {
    historical: <><path d="M12 8v4l3 2" /><circle cx="12" cy="12" r="9" /></>,
    redraft: <path d="M4 12a8 8 0 0114-5m2-2v5h-5M20 12a8 8 0 01-14 5m-2 2v-5h5" />,
  };
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

function Chip({ label, value, className = "text-ink" }) {
  return (
    <span className="text-[11px] text-ink/60">
      {label}: <span className={`font-medium ${className}`}>{value}</span>
    </span>
  );
}

// ── Prospect card on the big board ────────────────────────────────────────────
function ProspectRow({ p, onPick, pickable }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-ink/5 bg-paper/60 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="w-6 shrink-0 text-center font-mono text-xs text-ink/60">#{p.rank}</span>
          <InitialsTile name={p.name} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-hoop text-sm font-semibold text-ink">{p.name}</p>
            <p className="truncate text-xs text-ink/60">
              {p.position} · {p.origin} {p.height ? `· ${p.height}` : ""}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {p.comparison && <span className="hidden text-[11px] text-ink/70 sm:inline">≈ {p.comparison}</span>}
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Collapse" : "Expand"}
            className="grid h-6 w-6 place-items-center rounded text-ink/60 hover:text-ink"
          >
            <svg viewBox="0 0 20 20" className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M5.5 7.5L10 12l4.5-4.5" />
            </svg>
          </button>
          {pickable && (
            <button onClick={() => onPick(p)} className="hoop-btn-primary px-3 py-1 text-xs">Draft</button>
          )}
        </div>
      </div>
      {open && (
        <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
          <div>
            <p className="mb-0.5 font-semibold text-ink">Strengths</p>
            <ul className="space-y-0.5 text-ink/70">
              {(p.strengths || []).map((s, i) => <li key={i}>+ {s}</li>)}
            </ul>
          </div>
          <div>
            <p className="mb-0.5 font-semibold text-stat-down">Weaknesses</p>
            <ul className="space-y-0.5 text-ink/70">
              {(p.weaknesses || []).map((w, i) => <li key={i}>− {w}</li>)}
            </ul>
          </div>
          {p.projection && <p className="text-ink/70 sm:col-span-2">Projection: {p.projection}</p>}
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
    <div className="flex items-start gap-3 rounded-xl border border-ink/5 bg-paper/60 p-3">
      <span className="w-8 shrink-0 font-mono text-sm text-ink/60">{pick.pick}.</span>
      <InitialsTile name={pick.prospect} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink">
          <span className="font-semibold">{pick.team}</span> select{" "}
          <span className="font-hoop font-semibold text-terracotta">{pick.prospect}</span>
        </p>
        {pick.reasoning && <p className="mt-0.5 text-xs text-ink/60">{pick.reasoning}</p>}
        {pick.analysis && <p className="mt-1 text-xs text-ink/70">{pick.analysis}</p>}
        {(pick.fit || pick.comparison || pick.peak_rating != null) && (
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {pick.comparison && <Chip label="Comp" value={pick.comparison} />}
            {pick.peak_rating != null && <Chip label="Peak" value={`${pick.peak_rating} OVR`} />}
            {pick.allstar_pct != null && <Chip label="All-Star" value={`${pick.allstar_pct}%`} className="text-terracotta" />}
            {pick.bust_pct != null && <Chip label="Bust" value={`${pick.bust_pct}%`} className="text-terracotta" />}
            {pick.risk && <span className={`text-[11px] font-medium ${RISK_COLOR[pick.risk] ?? "text-ink/70"}`}>{pick.risk} risk</span>}
          </div>
        )}
        {pick.fit && <p className="mt-1 text-xs text-ink/70">{pick.fit}</p>}
      </div>
      {grade && (
        <span className={`shrink-0 font-hoop text-3xl font-extrabold leading-none ${grade.text}`}>{g}</span>
      )}
    </div>
  );
}

export default function DraftSimulator() {
  const [aiReady, setAiReady] = useState(true);
  const [mode, setMode] = useState("historical");
  const [year, setYear] = useState(MAX_HISTORICAL_YEAR);
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

  // Both modes are real past drafts. Historical goes through the latest draft (2026);
  // Redraft stops a year earlier (2025) since the newest class has no career yet.
  const maxYear = (m = mode) => (m === "redraft" ? MAX_REDRAFT_YEAR : MAX_HISTORICAL_YEAR);
  function changeMode(v) {
    setMode(v);
    if (Number(year) > maxYear(v)) setYear(maxYear(v));
  }
  function onYearChange(e) {
    let y = e.target.value;
    if (Number(y) > maxYear()) y = String(maxYear());
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
    ["historical", "Historical", "Real class, pre-draft scouting"],
    ["redraft", "Redraft", "Real order vs. career results"],
  ];

  return (
    <div className="animate-fade-in space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-ink">Draft Simulator</h1>
        <p className="mt-1 text-ink/70">
          Replay a real draft class, control any team on the clock, or redraft history by career results.
        </p>
      </header>

      {!aiReady && (
        <div className="hoop-card-outline border border-terracotta/30 p-3 text-sm text-terracotta">
          AI is unavailable — set ANTHROPIC_API_KEY for the Draft Simulator to work.
        </div>
      )}

      {/* ── Setup ── */}
      {phase === "setup" && (
        <div className="hoop-card-outline max-w-2xl space-y-5 p-6">
          <div>
            <p className="hoop-stat-label mb-2">Mode</p>
            <div className="grid grid-cols-2 gap-2">
              {MODES.map(([v, label, sub]) => (
                <button
                  key={v}
                  onClick={() => changeMode(v)}
                  aria-pressed={mode === v}
                  className={`rounded-xl border px-3 py-2.5 text-left transition ${
                    mode === v ? "border-terracotta/60 bg-terracotta/10" : "border-ink/10 bg-paper hover:border-ink/25"
                  }`}
                >
                  <p className={`flex items-center gap-1.5 text-sm font-semibold ${mode === v ? "text-terracotta" : "text-ink"}`}>
                    <ModeIcon name={v} />
                    {label}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink/60">{sub}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="hoop-stat-label">Draft year</span>
              <input type="number" value={year} onChange={onYearChange}
                max={maxYear()}
                className="mt-1 w-full rounded-xl border border-ink/10 bg-paper px-3 py-2 text-ink focus:border-terracotta focus:outline-none" />
              <span className="mt-1 block text-[11px] text-ink/60">
                {mode === "redraft"
                  ? `Redrafts available through ${MAX_REDRAFT_YEAR} (needs real career results).`
                  : `Real drafts available through ${MAX_HISTORICAL_YEAR}.`}
              </span>
            </label>
            <label className="block text-sm">
              <span className="hoop-stat-label">Rounds</span>
              <select value={rounds} onChange={(e) => setRounds(e.target.value)}
                className="mt-1 w-full rounded-xl border border-ink/10 bg-paper px-3 py-2 text-ink focus:border-terracotta focus:outline-none">
                <option value={1}>Round 1 (30 picks)</option>
                <option value={2}>Both rounds (60 picks)</option>
              </select>
            </label>
          </div>

          {mode !== "redraft" && (
            <label className="block text-sm">
              <span className="hoop-stat-label">Team you control (optional)</span>
              <input value={controlTeam} onChange={(e) => setControlTeam(e.target.value)}
                placeholder="e.g. San Antonio Spurs — leave blank to spectate"
                className="mt-1 w-full rounded-xl border border-ink/10 bg-paper px-3 py-2 text-ink placeholder:text-ink/50 focus:border-terracotta focus:outline-none" />
              <span className="text-[11px] text-ink/50">
                Type the team exactly as it&apos;ll appear in the order (you can adjust after the board loads).
              </span>
            </label>
          )}

          <button onClick={mode === "redraft" ? runRedraft : startDraft}
            disabled={loading || !aiReady}
            className="hoop-btn-primary w-full py-3">
            {loading ? (status || "Working…") :
              mode === "redraft" ? "Run Redraft" :
              controlTeam ? "Start Draft — you're on the clock" : "Generate Big Board"}
          </button>
          {error && <p className="text-sm text-stat-down">{error}</p>}
        </div>
      )}

      {/* ── Header during draft ── */}
      {(phase === "board" || phase === "drafting" || phase === "done") && draft && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-hoop text-xl font-bold capitalize text-ink">{draft.mode} · {draft.year} Draft</h2>
            {draft.summary && <p className="max-w-2xl text-sm text-ink/70">{draft.summary}</p>}
          </div>
          <button onClick={reset} className="hoop-btn-ghost text-sm">↺ New Draft</button>
        </div>
      )}

      {/* ── Running-simulation status (orange = live/running) ── */}
      {loading && phase !== "setup" && status && (
        <div className="hoop-card-outline flex items-center gap-2 border border-terracotta/30 bg-terracotta/5 p-3 text-sm text-terracotta">
          <span className="inline-block h-2 w-2 rounded-full bg-terracotta motion-safe:animate-pulse-live" />
          {status}
        </div>
      )}

      {/* ── Drafting / board view ── */}
      {(phase === "board" || phase === "drafting" || phase === "done") && draft && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left: picks made */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="hoop-stat-label">
                {phase === "done" ? "Final Draft Results" : `Pick ${current}${onClockTeam ? ` — ${onClockTeam}` : ""}`}
              </p>
              {isUserOnClock && (
                <span className="hoop-badge"><span className="inline-block h-2 w-2 rounded-full bg-terracotta motion-safe:animate-pulse-live" /> On the clock</span>
              )}
            </div>
            {isUserOnClock && (
              <div className="hoop-card-outline border border-terracotta/40 bg-terracotta/5 p-3 text-sm text-terracotta">
                You&apos;re on the clock with pick #{current}. Choose from the board →
              </div>
            )}
            <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
              {[...picks].reverse().map((p, i) => <PickCard key={`${p.pick}-${i}`} pick={p} />)}
              {picks.length === 0 && <p className="text-sm text-ink/50">No picks made yet.</p>}
            </div>
          </div>

          {/* Right: available board */}
          <div className="space-y-2">
            <p className="hoop-stat-label">Available — Big Board ({available.length})</p>
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
              <h2 className="flex items-center gap-2 font-hoop text-xl font-bold text-ink">
                {redraft.year} Redraft
                {redraft.grounded && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-ink/30 bg-ink/10 px-2 py-0.5 text-[10px] font-medium text-ink">
                    <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 10l4 4 8-8" /></svg>
                    real draft data
                  </span>
                )}
              </h2>
              {redraft.summary && <p className="max-w-2xl text-sm text-ink/70">{redraft.summary}</p>}
            </div>
            <button onClick={reset} className="hoop-btn-ghost text-sm">↺ New Draft</button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {redraft.biggest_steal && (
              <div className="hoop-card-outline border border-ink/20 p-3">
                <p className="hoop-stat-label text-ink">Biggest Steal</p>
                <p className="font-semibold text-ink">{redraft.biggest_steal.name}
                  <span className="ml-2 text-xs text-ink/60">originally #{redraft.biggest_steal.original_pick}</span></p>
                <p className="mt-0.5 text-xs text-ink/70">{redraft.biggest_steal.why}</p>
              </div>
            )}
            {redraft.biggest_bust && (
              <div className="hoop-card-outline border border-stat-down/20 p-3">
                <p className="hoop-stat-label text-stat-down">Biggest Bust</p>
                <p className="font-semibold text-ink">{redraft.biggest_bust.name}
                  <span className="ml-2 text-xs text-ink/60">originally #{redraft.biggest_bust.original_pick}</span></p>
                <p className="mt-0.5 text-xs text-ink/70">{redraft.biggest_bust.why}</p>
              </div>
            )}
          </div>

          <div className="hoop-card-outline overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/5 text-left text-xs text-ink/60">
                  <th className="px-3 py-2 font-medium">New</th>
                  <th className="px-3 py-2 font-medium">Player</th>
                  <th className="px-3 py-2 font-medium">Was</th>
                  <th className="px-3 py-2 font-medium">Move</th>
                  <th className="hidden px-3 py-2 font-medium sm:table-cell">Career</th>
                </tr>
              </thead>
              <tbody>
                {(redraft.redraft || []).map((r) => (
                  <tr key={r.new_rank} className="border-t border-ink/5 hover:bg-ink/5">
                    <td className="px-3 py-2 font-mono font-bold text-terracotta">#{r.new_rank}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <InitialsTile name={r.name} size="sm" />
                        <div>
                          <p className="font-medium text-ink">{r.name}</p>
                          <p className="text-[11px] text-ink/60">{r.accolades}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-ink/70">
                      #{r.original_pick}<br /><span className="text-ink/50">{r.original_team}</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{r.movement}</td>
                    <td className="hidden px-3 py-2 text-xs text-ink/70 sm:table-cell">{r.career_summary}</td>
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
