export default function RoomCodeBadge({ code }) {
  return (
    <div className="hoop-card-outline inline-flex flex-col items-center gap-1 px-6 py-4">
      <span className="hoop-stat-label">Room Code</span>
      <span className="font-mono text-4xl font-bold tracking-[0.2em] text-terracotta">{code}</span>
    </div>
  );
}
