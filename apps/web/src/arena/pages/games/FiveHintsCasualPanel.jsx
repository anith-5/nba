import { useState } from "react";
import Timer from "../../components/Timer.jsx";

const CASUAL_GUESS_SECONDS = 20;

// Casual mode: everyone gets a text input + Pass button after each hint.
// Guesses stay hidden (only a submitted/not-submitted checkmark is visible)
// until everyone has submitted or the 20s window closes, at which point
// round.lastHintReveal (set server-side once that happens) shows every
// guess and whether it was right.
export default function FiveHintsCasualPanel({ round, myId, players, onSubmitGuess, onPass }) {
  const [guess, setGuess] = useState("");
  const amLockedOut = round.lockedOutSocketIds.includes(myId);
  const mySubmission = round.casualSubmissions[myId];
  const haveSubmitted = mySubmission?.hintNumber === round.hintNumber;
  const reveal = round.lastHintReveal?.hintNumber === round.hintNumber ? round.lastHintReveal : null;

  function submit() {
    if (!guess.trim()) return;
    onSubmitGuess(guess.trim());
    setGuess("");
  }

  if (reveal) {
    return (
      <div className="hoop-card-outline animate-fade-in mx-auto max-w-lg space-y-3 p-6">
        <p className="hoop-stat-label text-center">Everyone's Guesses</p>
        {players.map((p) => {
          const sub = reveal.submissions[p.socketId];
          if (!sub) return null;
          return (
            <div key={p.socketId} className="flex items-center justify-between rounded-lg border border-ink/15 px-4 py-2">
              <span className="text-ink">{p.name}</span>
              <span className={sub.passed ? "text-ink/60" : sub.correct ? "text-stat-up" : "text-stat-down"}>
                {sub.passed ? "Passed" : sub.correct ? `"${sub.guess}" ✓` : `"${sub.guess}" ✗`}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="hoop-card-outline mx-auto max-w-lg space-y-4 p-6">
      <div className="flex items-center justify-between">
        <p className="hoop-stat-label">Your Guess</p>
        <Timer startedAt={round.hintRevealedAt} durationSeconds={CASUAL_GUESS_SECONDS} />
      </div>

      {amLockedOut ? (
        <p className="text-center text-sm text-ink/60">You guessed wrong this round — locked out until the next one.</p>
      ) : haveSubmitted ? (
        <p className="text-center text-sm text-ink/60">Guess submitted — waiting on everyone else…</p>
      ) : (
        <div className="flex gap-3">
          <input
            autoFocus
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Who is it?"
            className="w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 text-ink outline-none focus:border-terracotta"
          />
          <button className="hoop-btn-primary" onClick={submit} disabled={!guess.trim()}>
            Guess
          </button>
          <button className="hoop-btn-ghost" onClick={onPass}>
            Pass
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {players.map((p) => {
          const sub = round.casualSubmissions[p.socketId];
          const submitted = sub?.hintNumber === round.hintNumber;
          const locked = round.lockedOutSocketIds.includes(p.socketId);
          return (
            <span
              key={p.socketId}
              className={`rounded-full border px-3 py-1 text-xs ${
                locked
                  ? "border-ink/15 text-ink/50"
                  : submitted
                    ? "border-terracotta/40 text-terracotta"
                    : "border-ink/20 text-ink/60"
              }`}
            >
              {p.name} {submitted && "✓"}
            </span>
          );
        })}
      </div>
    </div>
  );
}
