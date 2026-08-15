import { Link } from "react-router-dom";

export default function ComingSoon({ title, description }) {
  return (
    <div className="animate-fade-in mx-auto max-w-md space-y-4 text-center">
      <h1 className="text-3xl font-bold text-ink">{title}</h1>
      <p className="text-ink/70">{description}</p>
      <div className="hoop-card-outline p-6">
        <p className="hoop-stat-label">Coming Soon</p>
        <p className="mt-2 text-sm text-ink/60">This game mode is on the roadmap and isn't playable yet.</p>
      </div>
      <Link to="/arena" className="hoop-btn-ghost inline-block">
        Back to Arena
      </Link>
    </div>
  );
}
