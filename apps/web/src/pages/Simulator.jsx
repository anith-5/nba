export default function Simulator() {
  return (
    <div className="animate-fade-in space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-white">GM Dynasty Simulator</h1>
        <p className="mt-1 text-slate-400">
          Draft, trade, develop, and sim seasons — core engine lands in Phase 4
        </p>
      </header>
      <div className="card max-w-2xl p-8 text-center">
        <p className="text-6xl opacity-30">🏆</p>
        <h2 className="mt-4 text-xl font-semibold text-white">Coming in Phase 4</h2>
        <p className="mt-2 text-slate-400">
          Player progression, AI GMs, cap constraints, and dynasty scoring will plug into{" "}
          <code className="rounded bg-slate-800 px-1 font-mono text-sm">services/gm-simulator</code>
        </p>
        <ul className="mt-6 space-y-2 text-left text-sm text-slate-500">
          <li>• Single-user franchise mode</li>
          <li>• Draft + free agency loops</li>
          <li>• Chemistry & injury systems</li>
          <li>• Leaderboard: beat real franchises</li>
        </ul>
      </div>
    </div>
  );
}
