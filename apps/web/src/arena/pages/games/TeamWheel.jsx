import { useEffect, useRef, useState } from "react";

const ABBREVIATIONS = [
  "ATL", "BOS", "BKN", "CHA", "CHI", "CLE", "DAL", "DEN", "DET", "GSW",
  "HOU", "IND", "LAC", "LAL", "MEM", "MIA", "MIL", "MIN", "NOP", "NYK",
  "OKC", "ORL", "PHI", "PHX", "POR", "SAC", "SAS", "TOR", "UTA", "WAS",
];

const SPIN_DURATION_MS = 1500;
const TICK_MS = 70;

// A slot-machine style scrolling wheel: while `spinToken` changes it cycles
// rapidly through team abbreviations, then settles on `landedTeam` once the
// server has told us which team the spin actually landed on.
export default function TeamWheel({ spinToken, landedTeam, onLandComplete }) {
  const [displayAbbr, setDisplayAbbr] = useState(landedTeam?.abbr ?? ABBREVIATIONS[0]);
  const [spinning, setSpinning] = useState(false);
  const landedRef = useRef(landedTeam);

  useEffect(() => {
    landedRef.current = landedTeam;
  }, [landedTeam]);

  // Deliberately keyed only on spinToken: React re-runs this effect exactly
  // when spinToken changes (including once, harmlessly, under StrictMode's
  // dev-mode double-invoke — its cleanup clears the first timer pair before
  // the second, surviving pair is set). No extra "already handled this
  // token" ref guard here — that pattern looks safe but actually breaks
  // StrictMode's replay, since a ref survives the mount/cleanup/remount
  // cycle and makes the second, real invocation think it has nothing to do.
  useEffect(() => {
    if (spinToken == null) return;
    setSpinning(true);

    const interval = setInterval(() => {
      setDisplayAbbr(ABBREVIATIONS[Math.floor(Math.random() * ABBREVIATIONS.length)]);
    }, TICK_MS);

    const timeout = setTimeout(() => {
      clearInterval(interval);
      setDisplayAbbr(landedRef.current?.abbr ?? ABBREVIATIONS[0]);
      setSpinning(false);
      onLandComplete?.();
    }, SPIN_DURATION_MS);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinToken]);

  return (
    <div className="card flex flex-col items-center gap-3 p-8">
      <p className="stat-label">Team Wheel</p>
      <div
        className={`flex h-28 w-full items-center justify-center rounded-xl border-2 border-court/40 bg-slate-950 text-4xl font-bold tracking-wide text-white transition-transform duration-150 ${
          spinning ? "animate-pulse scale-105" : ""
        }`}
      >
        {displayAbbr}
      </div>
      {!spinning && landedTeam && <p className="text-sm text-slate-400">{landedTeam.teamName}</p>}
    </div>
  );
}
