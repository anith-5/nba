import EightyTwoOhPlayerPicker from "./EightyTwoOhPlayerPicker.jsx";

// Spins team + decade together in one action (unlike Closest To's
// single-axis wheel), then exposes two independent single-use respin
// tokens -- decade-only (keeps the team) and team-only (keeps the decade).
// No slot-machine animation here: TeamWheel.jsx was built for a single
// spinning axis and isn't a clean fit for revealing two values at once, so
// this is a simpler direct reveal instead of adapting that component.
export default function EightyTwoOhSpinner({
  myBuild,
  pendingSpin,
  players,
  playersLoading,
  playersError,
  playersMeta,
  benchEnabled,
  onSpin,
  onRespinDecade,
  onRespinTeam,
  onRequestPlayers,
  onConfirmPick,
}) {
  return (
    <div className="hoop-card-outline space-y-4 p-5">
      {!pendingSpin ? (
        <div className="space-y-3 text-center">
          <p className="hoop-stat-label">Spin for a Team + Decade</p>
          <button type="button" className="hoop-btn-primary" onClick={onSpin}>
            Spin
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-center gap-8">
            <div className="text-center">
              <p className="hoop-stat-label">Team</p>
              <p className="text-xl font-bold text-ink">{pendingSpin.teamName}</p>
            </div>
            <div className="text-center">
              <p className="hoop-stat-label">Decade</p>
              <p className="text-xl font-bold text-ink">{pendingSpin.decade}s</p>
            </div>
          </div>

          <div className="flex justify-center gap-3">
            <button
              type="button"
              className="hoop-btn-ghost disabled:opacity-50"
              disabled={myBuild.teamRerollUsed}
              onClick={onRespinTeam}
            >
              {myBuild.teamRerollUsed ? "Team Respin Used" : "Respin Team"}
            </button>
            <button
              type="button"
              className="hoop-btn-ghost disabled:opacity-50"
              disabled={myBuild.decadeRerollUsed}
              onClick={onRespinDecade}
            >
              {myBuild.decadeRerollUsed ? "Decade Respin Used" : "Respin Decade"}
            </button>
          </div>

          {!players && !playersLoading && (
            <div className="text-center">
              <button type="button" className="hoop-btn-primary" onClick={onRequestPlayers}>
                Browse Players
              </button>
            </div>
          )}
          {playersLoading && <p className="text-center text-sm text-ink/60">Loading roster…</p>}
          {playersError && <p className="text-center text-sm text-basketball">{playersError}</p>}
          {players && (
            <EightyTwoOhPlayerPicker
              players={players}
              lineup={myBuild.lineup}
              benchEnabled={benchEnabled}
              onConfirmPick={onConfirmPick}
            />
          )}
          {playersMeta?.note && <p className="text-center text-xs text-ink/50">{playersMeta.note}</p>}
        </>
      )}
    </div>
  );
}
