import { useEffect, useState } from "react";
import TeamWheel from "./TeamWheel.jsx";
import ClosestToPlayerCard from "./ClosestToPlayerCard.jsx";

const POSITION_ORDER = ["PG", "SG", "SF", "PF", "C"];

// The main in-round screen: ties the team wheel, the accept/skip step, the
// player/season selection panel, and the running lineup card together. Owns
// only the local "which sub-step am I on" UI state — the actual lineup,
// spin results, and roster data all come from the server via props.
//
// Blind Mode: no PPG or running total appears anywhere on this screen. The
// lineup card below only shows which positions are filled with which
// player/season — the real numbers aren't revealed until every player in
// the room has finished their round (see ClosestToReveal.jsx).
export default function ClosestToSpinner({
  myState,
  skipRule,
  spinToken,
  pendingTeam,
  teamPlayers,
  teamPlayersLoading,
  teamPlayersError,
  teamPlayersSource,
  teamPlayersDataComplete,
  teamPlayersNote,
  onSpin,
  onUseSkip,
  onRequestPlayers,
  onConfirmPick,
}) {
  const [step, setStep] = useState("not-started");

  useEffect(() => {
    if (spinToken) setStep("spinning");
  }, [spinToken]);

  const lineup = myState.lineup;
  const filledCount = myState.filledCount;

  return (
    <div className="space-y-6">
      {step === "not-started" && (
        <div className="hoop-card-outline flex flex-col items-center gap-4 p-8 text-center">
          <p className="hoop-stat-label">Position {filledCount + 1} of 5</p>
          <p className="text-ink/70">Spin the wheel to land on a team.</p>
          <button className="hoop-btn-primary" onClick={onSpin}>
            Spin the Wheel
          </button>
        </div>
      )}

      {step !== "not-started" && (
        <TeamWheel spinToken={spinToken} landedTeam={pendingTeam} onLandComplete={() => setStep("landed")} />
      )}

      {step === "landed" && pendingTeam && (
        <div className="flex justify-center gap-3">
          <button
            className="hoop-btn-primary"
            onClick={() => {
              onRequestPlayers();
              setStep("selecting");
            }}
          >
            Accept
          </button>
          {skipRule !== "no-skips" && (
            <button className="hoop-btn-ghost disabled:opacity-50" onClick={onUseSkip} disabled={myState.skipUsed}>
              {myState.skipUsed ? "Skip Used" : "Use Skip 1 of 1 remaining"}
            </button>
          )}
        </div>
      )}

      {step === "selecting" && pendingTeam && (
        <ClosestToPlayerCard
          team={pendingTeam}
          players={teamPlayers}
          loading={teamPlayersLoading}
          error={teamPlayersError}
          source={teamPlayersSource}
          dataComplete={teamPlayersDataComplete}
          note={teamPlayersNote}
          lineup={lineup}
          onConfirm={onConfirmPick}
          canSkip={skipRule !== "no-skips" && !myState.skipUsed}
          onUseSkip={onUseSkip}
        />
      )}

      <div className="hoop-card-outline space-y-3 p-5">
        <p className="hoop-stat-label">Your Lineup</p>
        <div className="grid grid-cols-5 gap-2 text-center">
          {POSITION_ORDER.map((pos) => (
            <div key={pos} className="rounded-lg border border-ink/20 bg-paper p-2">
              <p className="hoop-stat-label text-xs">{pos}</p>
              {lineup[pos] ? (
                <>
                  <p className="mt-1 truncate text-xs font-semibold text-ink">{lineup[pos].name}</p>
                  <p className="text-xs text-ink/60">{lineup[pos].season}</p>
                </>
              ) : (
                <p className="mt-2 text-xs text-ink/50">—</p>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between rounded-lg border border-ink/20 px-4 py-2">
          <span className="hoop-stat-label">Positions Filled</span>
          <span className="hoop-stat-value">{filledCount} of 5</span>
        </div>
      </div>
    </div>
  );
}
