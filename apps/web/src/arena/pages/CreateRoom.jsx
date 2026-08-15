import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { GAME_MODES } from "../data/gameModes.js";
import { useSocket } from "../socket/useSocket.js";

export default function CreateRoom() {
  const { mode } = useParams();
  const navigate = useNavigate();
  const { createRoom, error, setError } = useSocket();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const gameMode = GAME_MODES.find((m) => m.id === mode);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const roomCode = await createRoom(name.trim(), mode);
      navigate(`/arena/room/${roomCode}`);
    } catch {
      setSubmitting(false);
    }
  }

  return (
    <div className="animate-fade-in mx-auto max-w-md space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-ink">Create Room</h1>
        <p className="mt-1 text-ink/70">{gameMode ? gameMode.name : "Unknown game mode"}</p>
      </header>

      <form onSubmit={handleSubmit} className="hoop-card-outline space-y-4 p-5">
        <div>
          <label className="hoop-stat-label mb-1 block">Your Display Name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            placeholder="e.g. Steph"
            className="w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 text-ink outline-none focus:border-terracotta"
          />
        </div>
        {error && <p className="text-sm text-basketball">{error}</p>}
        <button type="submit" disabled={!name.trim() || submitting} className="hoop-btn-primary w-full disabled:opacity-50">
          {submitting ? "Creating…" : "Create Room"}
        </button>
      </form>
    </div>
  );
}
