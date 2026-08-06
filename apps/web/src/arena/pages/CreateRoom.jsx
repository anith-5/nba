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
        <h1 className="text-3xl font-bold text-white">Create Room</h1>
        <p className="mt-1 text-slate-400">{gameMode ? gameMode.name : "Unknown game mode"}</p>
      </header>

      <form onSubmit={handleSubmit} className="card space-y-4 p-5">
        <div>
          <label className="stat-label mb-1 block">Your Display Name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            placeholder="e.g. Steph"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-court"
          />
        </div>
        {error && <p className="text-sm text-amber-300">{error}</p>}
        <button type="submit" disabled={!name.trim() || submitting} className="btn-primary w-full disabled:opacity-50">
          {submitting ? "Creating…" : "Create Room"}
        </button>
      </form>
    </div>
  );
}
