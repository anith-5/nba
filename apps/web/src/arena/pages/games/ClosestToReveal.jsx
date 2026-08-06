import { useEffect, useState } from "react";

const POSITION_ORDER = ["PG", "SG", "SF", "PF", "C"];
const STEP_INTERVAL_MS = 900;
const FINAL_PAUSE_MS = 1400;

function round1(n) {
  return Math.round(n * 10) / 10;
}

// Blind Mode's payoff: once everyone has finished their lineup, this plays
// the same reveal for every player's card simultaneously — one position at a
// time, PPG flipping in next to the name/season, running total ticking up,
// with a short pause between each position so the room can react before the
// next number appears. Fed directly from the server's reveal_lineups event
// (the first moment any PPG value reaches the client for this round).
export default function ClosestToReveal({ entries, target, onRevealComplete }) {
  const [revealCount, setRevealCount] = useState(0);

  useEffect(() => {
    if (revealCount >= POSITION_ORDER.length) {
      const t = setTimeout(() => onRevealComplete?.(), FINAL_PAUSE_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setRevealCount((c) => c + 1), STEP_INTERVAL_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealCount]);

  const fullyRevealed = revealCount >= POSITION_ORDER.length;

  return (
    <div className="animate-fade-in mx-auto max-w-4xl space-y-6">
      <header className="text-center">
        <h1 className="text-2xl font-bold text-white">Revealing Lineups…</h1>
        <p className="text-slate-400">Target: {target} PPG</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {entries.map((entry) => {
          const runningTotal = round1(
            POSITION_ORDER.slice(0, revealCount).reduce((sum, pos) => sum + (entry.lineup[pos]?.ppg || 0), 0)
          );

          return (
            <div key={entry.socketId} className="card space-y-3 p-5">
              <p className="text-lg font-bold text-white">{entry.name}</p>
              <div className="grid grid-cols-5 gap-2 text-center">
                {POSITION_ORDER.map((pos, i) => {
                  const shown = i < revealCount;
                  const p = entry.lineup[pos];
                  return (
                    <div key={pos} className="rounded-lg border border-slate-700 bg-slate-950 p-2">
                      <p className="stat-label text-xs">{pos}</p>
                      <p className="mt-1 truncate text-xs font-semibold text-white">{p?.name}</p>
                      <p className="text-xs text-slate-500">{p?.season}</p>
                      <p className={`mt-1 text-sm font-bold ${shown ? "animate-fade-in text-court" : "text-transparent"}`}>
                        {shown ? p?.ppg : "0"}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between rounded-lg border border-slate-700 px-4 py-2">
                <span className="stat-label">Running Total</span>
                <span className="stat-value">{runningTotal}</span>
              </div>

              {fullyRevealed && (
                <div
                  className={`animate-fade-in rounded-lg border px-4 py-3 text-center ${
                    entry.overTarget ? "border-red-500/50" : "border-court/50"
                  }`}
                >
                  <p className={`text-3xl font-bold ${entry.overTarget ? "text-red-400" : "text-court"}`}>
                    {entry.total}
                  </p>
                  {entry.overTarget ? (
                    <p className="text-sm font-semibold text-red-400">Busted</p>
                  ) : entry.perfect ? (
                    <p className="text-sm font-semibold text-yellow-400">Perfect</p>
                  ) : (
                    <p className="text-sm text-court">{entry.distance} from target</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
