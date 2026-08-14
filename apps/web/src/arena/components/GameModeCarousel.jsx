import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import GameModeCard from "./GameModeCard.jsx";

// Center-large/edges-shrink-and-arc-down carousel. `centerPosition` is a
// continuous float (not an integer index) driven either by a constant-speed
// requestAnimationFrame loop while an edge zone is hovered, or by a drag
// gesture -- every card's distance-from-center is recomputed each frame from
// that single float, so cards fluidly follow the arc instead of jumping
// between fixed slots.
//
// This replaces the old hover-any-card-to-recenter model entirely, which
// removes its whole class of bugs by construction: that model needed
// time-locked guards because re-centering shifted every card's position,
// which could slide a DIFFERENT card under a stationary cursor and
// re-trigger hover on it, cascading. Hovering a card no longer changes
// position at all here -- only the two edge zones drive centerPosition, and
// per-card hover now only toggles that one card's text visibility (see
// GameModeCard's showDetails), which has no effect on any card's layout. No
// layout-shift-under-cursor is possible, so no lock/guard is needed for it.
const SLOT_WIDTH = 280;
const CARD_WIDTH = 256; // matches GameModeCard's w-64 wrapper below
const SETTLE_SPRING = { type: "spring", stiffness: 300, damping: 28, mass: 0.7 };
const SPIN_SPEED = 2.6; // slots per second while an edge zone is hovered
const EDGE_ZONE_WIDTH = 150; // px from each side that triggers spin -- wide, not pixel-precise
const FLICK_VELOCITY = 500; // px/s -- a quick swipe counts as "move one slot"

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function styleForDistance(distance) {
  const abs = Math.abs(distance);
  const scale = clamp(1 - abs * 0.16, 0.5, 1);
  const opacity = clamp(1 - abs * 0.3, 0.12, 1);
  // Quadratic, not linear -- the downward dip accelerates with distance so
  // the row reads as following a shallow arc rather than cards just
  // shrinking on a flat line.
  const y = Math.min(abs * abs * 9, 85);
  return { scale, opacity, y };
}

export default function GameModeCarousel({ modes }) {
  const [centerPosition, setCenterPosition] = useState(Math.floor(modes.length / 2));
  const [isSpinning, setIsSpinning] = useState(false);
  const [hoveredCard, setHoveredCard] = useState(null);
  const spinDirRef = useRef(0);
  const rafRef = useRef(null);
  const lastTimeRef = useRef(null);
  const draggingRef = useRef(false);

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  // While actively spinning, cards get a zero-duration transition (see the
  // per-card `animate` below) -- centerPosition is already updated every
  // rAF frame here, so it's already a smooth 60fps signal on its own.
  // Layering a spring transition ON TOP of that continuously-moving target
  // doesn't add smoothness (there's no jitter to smooth), it adds a
  // steady-state lag: the spring perpetually chases a moving target and
  // settles into trailing behind it, which read as sluggish/slow-creep
  // regardless of how high SPIN_SPEED was set. Springing back in only once
  // spin actually stops (the settle-to-nearest-card hop) is the right place
  // for eased motion -- there the target is static, so a spring has
  // something real to settle into.
  function tick(now) {
    if (lastTimeRef.current == null) lastTimeRef.current = now;
    const dt = (now - lastTimeRef.current) / 1000;
    lastTimeRef.current = now;

    if (spinDirRef.current !== 0) {
      setCenterPosition((pos) => clamp(pos + spinDirRef.current * SPIN_SPEED * dt, 0, modes.length - 1));
      rafRef.current = requestAnimationFrame(tick);
    } else {
      rafRef.current = null;
      lastTimeRef.current = null;
      setIsSpinning(false);
      setCenterPosition((pos) => Math.round(clamp(pos, 0, modes.length - 1)));
    }
  }

  function startSpin(direction) {
    if (draggingRef.current) return;
    spinDirRef.current = direction;
    setIsSpinning(true);
    if (!rafRef.current) {
      lastTimeRef.current = null;
      rafRef.current = requestAnimationFrame(tick);
    }
  }

  function stopSpin() {
    spinDirRef.current = 0;
  }

  function handleDragStart() {
    draggingRef.current = true;
    stopSpin();
  }

  function handleDragEnd(_event, info) {
    draggingRef.current = false;
    const { x: offset } = info.offset;
    const { x: velocity } = info.velocity;
    let slotsMoved = Math.round(-offset / SLOT_WIDTH);
    if (slotsMoved === 0 && Math.abs(velocity) > FLICK_VELOCITY) {
      slotsMoved = velocity < 0 ? 1 : -1;
    }
    if (slotsMoved !== 0) {
      setCenterPosition((current) => clamp(Math.round(current) + slotsMoved, 0, modes.length - 1));
    }
  }

  return (
    <motion.div
      className="relative h-[360px] w-full select-none overflow-hidden cursor-grab active:cursor-grabbing"
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.15}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {/* Edge hover zones -- z-index kept above every card so a card sitting
          near an edge can never steal the hover that should trigger spin. */}
      <div
        className="absolute inset-y-0 left-0 cursor-w-resize"
        style={{ width: EDGE_ZONE_WIDTH, zIndex: 200 }}
        onMouseEnter={() => startSpin(-1)}
        onMouseLeave={stopSpin}
        aria-hidden="true"
      />
      <div
        className="absolute inset-y-0 right-0 cursor-e-resize"
        style={{ width: EDGE_ZONE_WIDTH, zIndex: 200 }}
        onMouseEnter={() => startSpin(1)}
        onMouseLeave={stopSpin}
        aria-hidden="true"
      />

      {/* Each card gets two nested layers: an OUTER div that does static
          "anchor at container center" positioning via a plain Tailwind
          transform, and an INNER motion.div that owns the animated
          x/y/scale/opacity via framer -- framer's `animate` prop sets
          `transform` directly and would silently clobber a Tailwind
          transform class on the same element otherwise. Pointer events live
          only on the inner motion.div, never the outer div, since all outer
          divs share the same un-transformed center rect. */}
      {modes.map((mode, i) => {
        const distance = i - centerPosition;
        const abs = Math.abs(distance);
        const { scale, opacity, y } = styleForDistance(distance);
        const isFront = abs < 0.5;
        const showDetails = isFront || hoveredCard === i;
        return (
          <div
            key={mode.id}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ width: CARD_WIDTH }}
          >
            <motion.div
              animate={{ x: distance * SLOT_WIDTH, y, scale, opacity, zIndex: Math.round(100 - abs) }}
              transition={isSpinning ? { duration: 0 } : SETTLE_SPRING}
              onHoverStart={() => setHoveredCard(i)}
              onHoverEnd={() => setHoveredCard((current) => (current === i ? null : current))}
              style={{ pointerEvents: abs > 3 ? "none" : "auto" }}
            >
              <GameModeCard mode={mode} showDetails={showDetails} />
            </motion.div>
          </div>
        );
      })}
    </motion.div>
  );
}
