import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CourtCanvas from "../components/iq/CourtCanvas.jsx";
import { pickScenarios, ROLES, SCENARIOS } from "../lib/iq/scenarios/index.js";
import {
  evaluate, evaluateTimeout, computeIQ, DIFFICULTIES, CATEGORIES,
} from "../lib/iq/engine.js";

const TONE = {
  great: { text: "text-stat-up", bg: "bg-stat-up/[0.10]", border: "border-stat-up" },
  good: { text: "text-stat-up", bg: "bg-stat-up/[0.08]", border: "border-stat-up/70" },
  neutral: { text: "text-ink", bg: "bg-ink/[0.06]", border: "border-ink/50" },
  poor: { text: "text-terracotta-dim", bg: "bg-terracotta/[0.10]", border: "border-terracotta" },
  bad: { text: "text-stat-down", bg: "bg-stat-down/[0.09]", border: "border-stat-down" },
};

const LENGTHS = [5, 10, 15];

function Clock({ seconds, total, onExpire, paused }) {
  const [left, setLeft] = useState(seconds);
  const expired = useRef(false);

  useEffect(() => {
    setLeft(seconds);
    expired.current = false;
  }, [seconds, total]);

  useEffect(() => {
    if (!seconds || paused) return undefined;
    const id = setInterval(() => {
      setLeft((v) => {
        if (v <= 0.1) {
          if (!expired.current) {
            expired.current = true;
            onExpire();
          }
          return 0;
        }
        return +(v - 0.1).toFixed(1);
      });
    }, 100);
    return () => clearInterval(id);
  }, [seconds, paused, onExpire]);

  if (!seconds) return <span className="text-xs text-ink/50">Untimed</span>;
  const pct = Math.max(0, left / seconds);
  const urgent = left <= seconds * 0.34;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-ink/15">
        <div
          className={`h-full rounded-full ${urgent ? "bg-stat-down" : "bg-ink"}`}
          style={{ width: `${pct * 100}%`, transition: "width 100ms linear" }}
        />
      </div>
      <span
        className={`w-8 text-right font-mono text-sm font-bold tabular-nums ${
          urgent ? "text-stat-down" : "text-ink"
        }`}
      >
        {left.toFixed(1)}
      </span>
    </div>
  );
}

function SituationBar({ s }) {
  const bits = [];
  if (s.shotClock != null) bits.push(["Shot clock", `${s.shotClock}`]);
  if (s.clock) bits.push(["Q" + s.quarter, s.clock]);
  if (s.margin != null)
    bits.push(["Score", s.margin === 0 ? "Tied" : s.margin > 0 ? `Up ${s.margin}` : `Down ${-s.margin}`]);
  if (s.bonus) bits.push(["Bonus", "Yes"]);
  if (s.clockOff) bits.push(["Shot clock", "Off"]);
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1">
      {bits.map(([k, v]) => (
        <div key={k} className="flex items-baseline gap-1.5">
          <span className="hoop-stat-label">{k}</span>
          <span className="font-mono text-sm font-semibold text-ink">{v}</span>
        </div>
      ))}
      {s.note && <span className="text-xs font-semibold text-terracotta-dim">{s.note}</span>}
    </div>
  );
}

function Report({ summary, history, onRestart }) {
  return (
    <div className="animate-fade-in space-y-6">
      <div className="hoop-card-outline p-6 text-center">
        <p className="hoop-stat-label">Ball Knowledge</p>
        <p className="mt-1 font-hoop text-6xl font-bold text-ink">{summary.iq}</p>
        <p className="mt-1 text-lg font-semibold text-ink">{summary.label}</p>
        <p className="mx-auto mt-3 max-w-xl text-sm text-ink/70">
          Scored on expected points per possession, weighted by how much was actually at stake —
          reads where every option was close count for less than the ones where half a point was on
          the floor.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            ["Possessions", summary.possessions],
            ["Optimal reads", `${summary.optimalCount}/${summary.possessions}`],
            ["Optimal rate", `${summary.optimalRate}%`],
            ["Points left on floor", summary.evLost.toFixed(2)],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="hoop-stat-label">{k}</p>
              <p className="font-hoop text-2xl font-bold text-ink">{v}</p>
            </div>
          ))}
        </div>
      </div>

      {summary.breakdown.length > 0 && (
        <div className="hoop-card-outline p-5">
          <p className="hoop-stat-label">By decision type</p>
          <p className="mt-1 text-xs text-ink/60">
            Weakest first. These are the areas to work on, not a ranking of talent.
          </p>
          <div className="mt-4 space-y-2.5">
            {summary.breakdown.map((b) => (
              <div key={b.key} className="flex items-center gap-3">
                <span className="w-40 shrink-0 text-sm text-ink">{b.label}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink/10">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(2, b.rating)}%`,
                      background: b.rating >= 70 ? "#257C56" : b.rating >= 45 ? "#AE5236" : "#C0392B",
                    }}
                  />
                </div>
                <span className="w-10 text-right font-mono text-sm font-semibold tabular-nums text-ink">
                  {b.rating}
                </span>
                <span className="w-16 text-right text-xs text-ink/50">
                  {b.n} read{b.n === 1 ? "" : "s"}
                </span>
              </div>
            ))}
          </div>
          {summary.weakest && summary.strongest && summary.weakest.key !== summary.strongest.key && summary.weakest.evLost > 0 && (
            <p className="mt-4 border-t border-ink/10 pt-3 text-sm text-ink/70">
              Your strongest area was <strong className="text-ink">{summary.strongest.label.toLowerCase()}</strong>.
              The one costing you most was{" "}
              <strong className="text-ink">{summary.weakest.label.toLowerCase()}</strong> — worth{" "}
              {summary.weakest.evLost.toFixed(2)} points across {summary.weakest.n} decision
              {summary.weakest.n === 1 ? "" : "s"}.
            </p>
          )}
        </div>
      )}

      <div className="hoop-card-outline p-5">
        <p className="hoop-stat-label">Every decision</p>
        <div className="mt-3 divide-y divide-ink/10">
          {history.map((h, i) => {
            const tone = TONE[h.tier.tone];
            return (
              <div key={i} className="flex items-start gap-3 py-2.5">
                <span className="mt-0.5 w-5 shrink-0 text-right font-mono text-xs text-ink/40">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">
                    {SCENARIOS.find((s) => s.id === h.scenarioId)?.name || h.scenarioId}
                  </p>
                  <p className="text-xs text-ink/60">
                    You chose <strong className="text-ink/80">{h.chosen.label}</strong>
                    {!h.wasBest && (
                      <> · best was <strong className="text-ink/80">{h.bestOption.label}</strong></>
                    )}
                  </p>
                </div>
                <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${tone.bg} ${tone.text}`}>
                  {h.tier.label}
                </span>
                <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-ink/50">
                  {h.evLost > 0 ? `-${h.evLost.toFixed(2)}` : "—"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <button type="button" onClick={onRestart} className="hoop-btn-primary">
        Run another set
      </button>
    </div>
  );
}

export default function BallKnowledge() {
  const [difficulty, setDifficulty] = useState("beginner");
  const [roles, setRoles] = useState(["onball", "offball", "defense"]);
  const [length, setLength] = useState(10);
  const [session, setSession] = useState(null);
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [phase, setPhase] = useState("setup"); // setup | decide | feedback | report

  const cfg = DIFFICULTIES[difficulty];
  const scenario = session?.[index] || null;

  // Options are authored best-first so the source reads clearly. Presenting
  // them in that order would make the whole simulator solvable by pressing 1,
  // which is precisely the memorisation this is supposed to defeat. Shuffled
  // per possession, with the order held steady across the decide/feedback
  // phases so the list does not jump underneath you after you answer.
  const shownOptions = useMemo(() => {
    if (!scenario) return [];
    const arr = [...scenario.options];
    let r = 0;
    for (const ch of scenario.id) r = (r * 31 + ch.charCodeAt(0)) & 0x7fffffff;
    r = (r + index * 7919) & 0x7fffffff;
    const rand = () => {
      r = (r * 1103515245 + 12345) & 0x7fffffff;
      return r / 0x7fffffff;
    };
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [scenario, index]);

  const start = () => {
    const picked = pickScenarios({ difficulty, roles, count: length });
    if (!picked.length) return;
    setSession(picked);
    setIndex(0);
    setHistory([]);
    setResult(null);
    setPhase("decide");
  };

  const choose = useCallback(
    (optionId) => {
      if (!scenario || phase !== "decide") return;
      const r = evaluate(scenario, optionId);
      setResult(r);
      setHistory((h) => [...h, r]);
      setPhase("feedback");
    },
    [scenario, phase],
  );

  const onExpire = useCallback(() => {
    if (!scenario || phase !== "decide") return;
    const r = evaluateTimeout(scenario);
    setResult(r);
    setHistory((h) => [...h, r]);
    setPhase("feedback");
  }, [scenario, phase]);

  const next = () => {
    if (index + 1 >= session.length) {
      setPhase("report");
      return;
    }
    setIndex((i) => i + 1);
    setResult(null);
    setPhase("decide");
  };

  // Keyboard: number keys pick an option, Enter advances. Elite difficulty is
  // four seconds — reaching for a mouse is most of that.
  useEffect(() => {
    function onKey(e) {
      if (phase === "decide" && scenario) {
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= shownOptions.length) choose(shownOptions[n - 1].id);
      } else if (phase === "feedback" && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        next();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const summary = useMemo(() => (phase === "report" ? computeIQ(history) : null), [phase, history]);

  const poolSize = useMemo(
    () => SCENARIOS.filter((s) => roles.includes(s.role)).length,
    [roles],
  );

  // ── Setup ─────────────────────────────────────────────────────────────────
  if (phase === "setup") {
    return (
      <div className="animate-fade-in max-w-3xl space-y-6">
        <header>
          <p className="hoop-stat-label">{SCENARIOS.length} situations</p>
          <h1 className="mt-1 text-3xl font-bold text-ink">Ball Knowledge</h1>
          <p className="mt-2 text-lg font-semibold text-ink">
            Let&apos;s see if you really have ball knowledge.
          </p>
          <p className="mt-2 text-ink/70">
            A possession freezes at the moment a decision has to be made. Read the floor — spacing,
            help, the shot clock, the score — and choose. Every option is graded on expected points
            per possession, so you get told how much a decision was worth rather than whether it was
            allowed.
          </p>
        </header>

        <div className="hoop-card-outline space-y-5 p-5">
          <div>
            <p className="hoop-stat-label mb-2">Difficulty</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.values(DIFFICULTIES).map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDifficulty(d.id)}
                  className={`rounded-xl border-2 p-3 text-left transition ${
                    difficulty === d.id
                      ? "border-ink bg-ink text-paper"
                      : "border-ink/25 text-ink hover:border-ink"
                  }`}
                >
                  <p className="flex items-center justify-between font-semibold">
                    {d.label}
                    <span className={`text-xs ${difficulty === d.id ? "text-paper/70" : "text-ink/50"}`}>
                      {d.seconds ? `${d.seconds}s` : "no clock"}
                    </span>
                  </p>
                  <p className={`mt-0.5 text-xs ${difficulty === d.id ? "text-paper/80" : "text-ink/60"}`}>
                    {d.blurb}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="hoop-stat-label mb-2">Situations to include</p>
            <div className="flex flex-wrap gap-2">
              {Object.values(ROLES).map((r) => {
                const on = roles.includes(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() =>
                      setRoles((cur) =>
                        cur.includes(r.id)
                          ? cur.length > 1
                            ? cur.filter((x) => x !== r.id)
                            : cur
                          : [...cur, r.id],
                      )
                    }
                    className={`rounded-lg border-2 px-3 py-1.5 text-sm font-semibold transition ${
                      on ? "border-ink bg-ink text-paper" : "border-ink/25 text-ink/60 hover:border-ink"
                    }`}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-ink/50">{poolSize} situations in this pool.</p>
          </div>

          <div>
            <p className="hoop-stat-label mb-2">Possessions</p>
            <div className="flex gap-2">
              {LENGTHS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setLength(n)}
                  className={`rounded-lg border-2 px-4 py-1.5 text-sm font-semibold transition ${
                    length === n ? "border-ink bg-ink text-paper" : "border-ink/25 text-ink/60 hover:border-ink"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <button type="button" onClick={start} className="hoop-btn-primary w-full sm:w-auto">
            Start
          </button>
        </div>
      </div>
    );
  }

  if (phase === "report" && summary) {
    return (
      <div className="animate-fade-in max-w-3xl">
        <h1 className="mb-5 text-3xl font-bold text-ink">Session report</h1>
        <Report summary={summary} history={history} onRestart={() => setPhase("setup")} />
      </div>
    );
  }

  if (!scenario) return null;

  const tone = result ? TONE[result.tier.tone] : null;
  const controlled =
    scenario.role === "defense"
      ? scenario.defense.find((d) => d.you)
      : scenario.offense.find((o) => o.you);
  const controlledLabel = controlled
    ? (scenario.role === "defense" ? scenario.defense : scenario.offense).indexOf(controlled) + 1
    : null;

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="hoop-stat-label">
            {index + 1} of {session.length} · {scenario.family} · {ROLES[scenario.role].label}
          </p>
          <h1 className="text-2xl font-bold text-ink">{scenario.name}</h1>
        </div>
        {phase === "decide" && (
          <Clock seconds={cfg.seconds} total={index} onExpire={onExpire} paused={false} />
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-3">
          <div className="hoop-card-outline p-4">
            <SituationBar s={scenario.situation} />
          </div>
          <CourtCanvas
            scenario={scenario}
            aids={phase === "decide" ? cfg : { ...cfg, showOpenTeammates: true, showHelp: true }}
          />
        </div>

        <div className="space-y-3">
          <div className="hoop-card-outline p-4">
            <p className="hoop-stat-label">
              You are {scenario.role === "defense" ? "D" : "O"}
              {controlledLabel}
            </p>
            <p className="mt-1.5 text-sm text-ink">{scenario.prompt}</p>
            {cfg.hintReads && scenario.reads?.length > 0 && phase === "decide" && (
              <ul className="mt-3 space-y-1 border-t border-ink/10 pt-3">
                {scenario.reads.map((r) => (
                  <li key={r} className="flex gap-2 text-xs text-ink/70">
                    <span className="text-terracotta-dim">▸</span>
                    {r}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {phase === "decide" && (
            <div className="space-y-2">
              {shownOptions.map((o, i) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => choose(o.id)}
                  className="hoop-card-outline-hover flex w-full items-center gap-3 p-3 text-left"
                >
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded border-2 border-ink/30 font-mono text-xs font-bold text-ink/60">
                    {i + 1}
                  </span>
                  <span className="text-sm font-semibold text-ink">{o.label}</span>
                </button>
              ))}
            </div>
          )}

          {phase === "feedback" && result && (
            <div className="space-y-3">
              <div className={`rounded-xl border-2 ${tone.border} ${tone.bg} p-4`}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className={`font-semibold ${tone.text}`}>{result.tier.label}</p>
                  <p className="font-mono text-xs text-ink/60">
                    {result.ev.toFixed(2)} pts
                    {result.evLost > 0 && ` · ${result.evLost.toFixed(2)} below best`}
                  </p>
                </div>
                <p className="mt-1 text-sm font-semibold text-ink">{result.chosen.label}</p>
                <p className="mt-1.5 text-sm text-ink/80">{result.chosen.feedback}</p>
              </div>

              {!result.wasBest && (
                <div className="rounded-xl border border-ink/20 bg-ink/[0.04] p-4">
                  <p className="hoop-stat-label">Best available</p>
                  <p className="mt-1 text-sm font-semibold text-ink">{result.bestOption.label}</p>
                  <p className="mt-1.5 text-sm text-ink/80">{result.bestOption.feedback}</p>
                </div>
              )}

              <details className="rounded-xl border border-ink/15 p-3">
                <summary className="cursor-pointer text-xs font-semibold text-ink/70">
                  Every option, ranked
                </summary>
                <div className="mt-2 space-y-1.5">
                  {[...scenario.options]
                    .sort((a, b) => (scenario.invert ? a.ev - b.ev : b.ev - a.ev))
                    .map((o) => (
                      <div key={o.id} className="flex items-baseline justify-between gap-3 text-xs">
                        <span className={o.id === result.chosen.id ? "font-semibold text-ink" : "text-ink/70"}>
                          {o.label}
                          {o.id === result.chosen.id && " ← you"}
                        </span>
                        <span className="shrink-0 font-mono tabular-nums text-ink/50">
                          {o.ev.toFixed(2)}
                        </span>
                      </div>
                    ))}
                </div>
                <p className="mt-2 text-[11px] text-ink/50">
                  {scenario.invert
                    ? "Defensive scenario: these are points allowed, so lower is better."
                    : "Expected points for the possession. Higher is better."}
                </p>
              </details>

              <button type="button" onClick={next} className="hoop-btn-primary w-full">
                {index + 1 >= session.length ? "See report" : "Next possession"}
                <span className="ml-2 text-xs opacity-60">Enter</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
