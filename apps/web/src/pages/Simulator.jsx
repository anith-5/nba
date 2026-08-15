export default function Simulator() {
  return (
    <div className="animate-fade-in space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-ink">GM Dynasty Simulator</h1>
        <p className="mt-1 text-ink/70">
          Draft, trade, develop, and sim seasons — core engine lands in Phase 4
        </p>
      </header>
      <div className="hoop-card-outline max-w-2xl p-8 text-center">
        <p className="text-6xl opacity-30">🏆</p>
        <h2 className="mt-4 text-xl font-semibold text-ink">Coming in Phase 4</h2>
        <p className="mt-2 text-ink/70">
          Player progression, AI GMs, cap constraints, and dynasty scoring will plug into{" "}
          <code className="rounded bg-ink/5 px-1 font-mono text-sm">services/gm-simulator</code>
        </p>
        <ul className="mt-6 space-y-2 text-left text-sm text-ink/60">
          <li>• Single-user franchise mode</li>
          <li>• Draft + free agency loops</li>
          <li>• Chemistry & injury systems</li>
          <li>• Leaderboard: beat real franchises</li>
        </ul>
      </div>
    </div>
  );
}
