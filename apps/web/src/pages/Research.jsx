const articles = [
  {
    title: "What actually predicts championships?",
    tag: "Team analytics",
    status: "Draft — research team",
  },
  {
    title: "Clutch performance: signal or noise?",
    tag: "Player psychology",
    status: "Planned",
  },
  {
    title: "Evolution of NBA spacing (2015–2025)",
    tag: "Shot quality",
    status: "Planned",
  },
];

export default function Research() {
  return (
    <div className="animate-fade-in space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-white">Research Hub</h1>
        <p className="mt-1 text-slate-400">
          Original statistical articles with charts — publish via MDX in Phase 1
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {articles.map((a) => (
          <article key={a.title} className="card-hover p-5">
            <span className="rounded-full bg-court/10 px-2 py-0.5 text-xs font-medium text-court">
              {a.tag}
            </span>
            <h2 className="mt-3 text-lg font-semibold text-white">{a.title}</h2>
            <p className="mt-2 text-sm text-slate-500">{a.status}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
