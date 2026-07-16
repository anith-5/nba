function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function describePlayer(p) {
  const tierPhrase = p.recognition_tier === "Star" ? "a Star-caliber" : p.recognition_tier === "Role Player" ? "a rotation" : "a deep-bench";
  const season = ordinal((p.years_in_league || 0) + 1);
  return `${tierPhrase} ${p.style_tag} for the ${p.team_full_name}, entering their ${season} season in the league.`;
}

export default function WordleResults({ won, answer, guessCount, onPlayAgain }) {
  return (
    <div className="card mx-auto max-w-md space-y-4 p-6 text-center">
      <p className="stat-label">{won ? `Solved in ${guessCount}!` : "Out of guesses"}</p>
      <h2 className="text-2xl font-bold text-white">{answer.name}</h2>
      <p className="text-slate-400">
        {answer.position} · {answer.team_abbreviation} · #{answer.jersey_number}
      </p>
      <p className="text-sm text-slate-500">{describePlayer(answer)}</p>
      <button onClick={onPlayAgain} className="btn-primary">
        Play Again
      </button>
    </div>
  );
}
