import { useState } from "react";

const SLOT_ORDER = ["PG", "SG", "SF", "PF", "C", "BENCH"];

// Click-to-select-then-click-target reassignment: click a filled slot to
// select it, then click any other slot to move (if empty) or swap (if
// filled) -- no drag-and-drop library, nothing else in this codebase uses
// one, and click-based reassignment gets the same capability while staying
// friendlier on mobile. Swap (not just move-to-empty) is what lets
// reassignment keep working once every slot is filled -- see
// eightyTwoOh.js's handleReassign for why pure move-to-empty would break
// exactly when reassignment matters most.
export default function EightyTwoOhLineupBoard({ lineup, benchEnabled, editable, onReassign }) {
  const [selectedSlot, setSelectedSlot] = useState(null);
  const slots = SLOT_ORDER.filter((s) => s !== "BENCH" || benchEnabled);

  function handleSlotClick(slot) {
    if (!editable) return;
    if (selectedSlot === slot) {
      setSelectedSlot(null);
      return;
    }
    if (selectedSlot) {
      onReassign(selectedSlot, slot);
      setSelectedSlot(null);
      return;
    }
    if (!lineup[slot]) return; // nothing to pick up from an empty slot
    setSelectedSlot(slot);
  }

  return (
    <div className="card space-y-3 p-5">
      <p className="stat-label">
        {editable ? "Your Lineup — click a filled slot, then click another to move or swap" : "Lineup"}
      </p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {slots.map((slot) => {
          const occupant = lineup[slot];
          const isSelected = selectedSlot === slot;
          return (
            <button
              key={slot}
              type="button"
              disabled={!editable}
              onClick={() => handleSlotClick(slot)}
              className={`rounded-lg border p-2 text-center transition ${
                isSelected
                  ? "border-court bg-court/20"
                  : occupant
                    ? "border-court/40 bg-court/10"
                    : "border-slate-800 bg-slate-950"
              } ${editable ? "hover:border-court/60" : ""}`}
            >
              <p className="stat-label text-[10px]">{slot}</p>
              {occupant ? (
                <>
                  <p className="mt-1 truncate text-xs font-semibold text-white">{occupant.name}</p>
                  <p className="truncate text-[10px] text-slate-500">
                    {occupant.teamName} · {occupant.decade}s
                  </p>
                  <p className="text-[10px] text-slate-500">{occupant.realPosition}</p>
                </>
              ) : (
                <p className="mt-3 text-xs text-slate-600">—</p>
              )}
            </button>
          );
        })}
      </div>
      {selectedSlot && (
        <p className="text-center text-xs text-court-glow">Selected {selectedSlot} — click another slot to move or swap.</p>
      )}
    </div>
  );
}
