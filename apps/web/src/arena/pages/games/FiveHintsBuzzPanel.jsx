import { useState } from "react";
import Timer from "../../components/Timer.jsx";

const COMPETITIVE_BUZZ_SECONDS = 10;

// Competitive mode: a single glowing Buzz In button available to anyone not
// locked out this round. The first buzz_in the server accepts locks
// everyone else out of buzzing until it resolves -- see round.subPhase.
export default function FiveHintsBuzzPanel({ round, myId, players, onBuzzIn, onSubmitGuess }) {
  const [guess, setGuess] = useState("");
  const amLockedOut = round.lockedOutSocketIds.includes(myId);
  const isActiveBuzzer = round.activeBuzzerSocketId === myId;
  const someoneElseBuzzing = round.subPhase === "buzzed" && !isActiveBuzzer;
  const buzzerName = players.find((p) => p.socketId === round.activeBuzzerSocketId)?.name;

  function submit() {
    if (!guess.trim()) return;
    onSubmitGuess(guess.trim());
    setGuess("");
  }

  if (isActiveBuzzer) {
    return (
      <div className="card animate-slide-up mx-auto max-w-lg space-y-4 p-6 text-center">
        <p className="stat-label text-court">You buzzed in!</p>
        <Timer startedAt={round.buzzDeadlineAt - COMPETITIVE_BUZZ_SECONDS * 1000} durationSeconds={COMPETITIVE_BUZZ_SECONDS} />
        <div className="flex gap-3">
          <input
            autoFocus
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Who is it?"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-court"
          />
          <button className="btn-primary" onClick={submit} disabled={!guess.trim()}>
            Guess
          </button>
        </div>
      </div>
    );
  }

  if (someoneElseBuzzing) {
    return (
      <div className="card mx-auto max-w-lg space-y-3 p-6 text-center">
        <p className="text-lg text-white">
          <span className="font-semibold text-court-glow">{buzzerName}</span> is guessing…
        </p>
        <Timer startedAt={round.buzzDeadlineAt - COMPETITIVE_BUZZ_SECONDS * 1000} durationSeconds={COMPETITIVE_BUZZ_SECONDS} />
      </div>
    );
  }

  if (amLockedOut) {
    return (
      <div className="mx-auto max-w-lg text-center">
        <p className="text-sm text-slate-500">You guessed wrong this round — locked out until the next one.</p>
      </div>
    );
  }

  return (
    <div className="flex justify-center">
      <button
        onClick={onBuzzIn}
        className="btn-primary animate-fade-in px-10 py-5 text-xl shadow-lg shadow-court/20"
      >
        Buzz In
      </button>
    </div>
  );
}
