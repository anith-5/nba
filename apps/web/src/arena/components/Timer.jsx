import { useEffect, useState } from "react";

export default function Timer({ startedAt, durationSeconds }) {
  const [remaining, setRemaining] = useState(durationSeconds);

  useEffect(() => {
    function tick() {
      const elapsed = (Date.now() - startedAt) / 1000;
      setRemaining(Math.max(0, Math.ceil(durationSeconds - elapsed)));
    }
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [startedAt, durationSeconds]);

  return <span className="font-mono text-2xl font-bold text-terracotta">{remaining}s</span>;
}
