import { useState } from "react";
import Timer from "../../components/Timer.jsx";

// Mirrors the server's MIN_BID_INCREMENT (services/arena-realtime/src/game-logic/hintAuction.js)
// -- server-authoritative timers/points are never imported client-side (see
// FiveHintsBuzzPanel's local COMPETITIVE_BUZZ_SECONDS for the same
// convention), only re-declared to match.
const MIN_BID_INCREMENT = 1;

// Live ascending auction: every player sees the same current-high-bid state
// and countdown in real time (bid state is intentionally public the whole
// time -- see sanitize.js's sanitizeHintAuction). auctionTimerSeconds comes
// straight from gameState.config (host-configurable, not a hidden server
// constant), so unlike the buzz-timer precedent this needs no local mirror
// beyond the bid increment itself. Timer's (startedAt, durationSeconds) pair
// just needs to sum to the real deadline -- any split works, and picking a
// fixed durationSeconds here means the effect naturally restarts (rebuilding
// startedAt) whenever auctionDeadlineAt moves on an extension.
export default function HintAuctionBidPanel({ round, myId, players, myBudget, myRosterFull, auctionTimerSeconds, onPlaceBid }) {
  const [amount, setAmount] = useState("");
  const minValid = round.highBid === 0 ? 1 : round.highBid + MIN_BID_INCREMENT;
  const highBidderName = round.highBidderSocketId ? players.find((p) => p.socketId === round.highBidderSocketId)?.name : null;
  const amHighBidder = round.highBidderSocketId === myId;

  function submit() {
    const bid = Math.floor(Number(amount));
    if (!Number.isFinite(bid) || bid < minValid || bid > myBudget) return;
    onPlaceBid(bid);
    setAmount("");
  }

  if (myRosterFull) {
    return (
      <div className="mx-auto max-w-lg text-center">
        <p className="text-sm text-slate-500">Your roster is full — spectating the rest of the draft.</p>
      </div>
    );
  }

  return (
    <div className="card mx-auto max-w-lg space-y-4 p-6 text-center">
      <div className="flex items-center justify-center gap-4">
        <div>
          <p className="stat-label">High Bid</p>
          <p className="stat-value text-2xl">{round.highBid > 0 ? round.highBid : "—"}</p>
          {highBidderName && <p className="text-xs text-slate-400">{amHighBidder ? "You" : highBidderName}</p>}
        </div>
        <Timer startedAt={round.auctionDeadlineAt - auctionTimerSeconds * 1000} durationSeconds={auctionTimerSeconds} />
      </div>

      <div className="flex gap-3">
        <input
          type="number"
          min={minValid}
          max={myBudget}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={`${minValid}+`}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-court"
        />
        <button className="btn-primary" onClick={submit} disabled={!amount || Number(amount) < minValid || Number(amount) > myBudget}>
          Bid
        </button>
      </div>
      <p className="text-xs text-slate-500">
        Budget remaining: {myBudget} · Minimum bid: {minValid}
      </p>
    </div>
  );
}
