import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSocket } from "../socket/useSocket.js";

export default function JoinRoom() {
  const { code: codeFromUrl } = useParams();
  const navigate = useNavigate();
  const { joinRoom, error, setError } = useSocket();
  const [roomCode, setRoomCode] = useState(codeFromUrl?.toUpperCase() || "");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!roomCode.trim() || !name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await joinRoom(roomCode.trim().toUpperCase(), name.trim());
      navigate(`/arena/room/${roomCode.trim().toUpperCase()}`);
    } catch {
      setSubmitting(false);
    }
  }

  return (
    <div className="animate-fade-in mx-auto max-w-md space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-ink">Join Room</h1>
        <p className="mt-1 text-ink/70">Enter the room code your host shared with you</p>
      </header>

      <form onSubmit={handleSubmit} className="hoop-card-outline space-y-4 p-5">
        <div>
          <label className="hoop-stat-label mb-1 block">Room Code</label>
          <input
            autoFocus
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="HQ7X2K"
            className="w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 font-mono text-lg tracking-widest text-ink outline-none focus:border-terracotta"
          />
        </div>
        <div>
          <label className="hoop-stat-label mb-1 block">Your Display Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            placeholder="e.g. Steph"
            className="w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 text-ink outline-none focus:border-terracotta"
          />
        </div>
        {error && <p className="text-sm text-basketball">{error}</p>}
        <button
          type="submit"
          disabled={!roomCode.trim() || !name.trim() || submitting}
          className="hoop-btn-primary w-full disabled:opacity-50"
        >
          {submitting ? "Joining…" : "Join Room"}
        </button>
      </form>
    </div>
  );
}
