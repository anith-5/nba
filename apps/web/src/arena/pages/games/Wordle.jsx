import { useMemo, useState } from "react";
import { scoreGuess, isWinningGuess } from "../../utils/wordleScoring.js";
import { currentPlayers, rosterMeta, pickWeightedAnswer, formatRosterFreshness } from "../../utils/rosterPool.js";
import WordleGrid from "./WordleGrid.jsx";
import WordleSearchInput from "./WordleSearchInput.jsx";
import WordleResults from "./WordleResults.jsx";

const MAX_GUESSES = 8;
const players = currentPlayers;

export default function Wordle() {
  const [answer, setAnswer] = useState(pickWeightedAnswer);
  const [guesses, setGuesses] = useState([]);

  const guessedIds = useMemo(() => new Set(guesses.map((g) => g.player.player_id)), [guesses]);
  const won = guesses.some((g) => isWinningGuess(g.feedback));
  const gameOver = won || guesses.length >= MAX_GUESSES;
  const freshness = useMemo(() => formatRosterFreshness(rosterMeta.generatedAt), []);

  function handleGuess(player) {
    if (gameOver) return;
    const feedback = scoreGuess(player, answer);
    setGuesses((prev) => [...prev, { player, feedback }]);
  }

  function handlePlayAgain() {
    setAnswer(pickWeightedAnswer());
    setGuesses([]);
  }

  return (
    <div className="animate-fade-in mx-auto max-w-2xl space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">NBA Wordle</h1>
          <p className="text-sm text-ink/70">Solo mode</p>
        </div>
        <p className="hoop-stat-label">
          Guess {guesses.length} of {MAX_GUESSES}
        </p>
      </header>

      {!gameOver && (
        <WordleSearchInput players={players} guessedIds={guessedIds} onSelect={handleGuess} disabled={gameOver} />
      )}

      <WordleGrid guesses={guesses} maxGuesses={MAX_GUESSES} />

      <div className="grid grid-cols-3 gap-3 text-xs text-ink/70">
        <div className="flex items-center gap-2">
          <span className="h-4 w-4 rounded bg-terracotta" /> Green — exact match
        </div>
        <div className="flex items-center gap-2">
          <span className="h-4 w-4 rounded bg-basketball" /> Yellow — close
        </div>
        <div className="flex items-center gap-2">
          <span className="h-4 w-4 rounded bg-ink/5" /> Red — wrong
        </div>
      </div>

      {gameOver && (
        <WordleResults won={won} answer={answer} guessCount={guesses.length} onPlayAgain={handlePlayAgain} />
      )}

      <p className="text-center text-xs text-ink/50">
        Rosters last updated {freshness.dateLabel}
        {freshness.isStale && (
          <span className="ml-1 text-basketball">— roster data may be outdated, check for updates</span>
        )}
      </p>
    </div>
  );
}
