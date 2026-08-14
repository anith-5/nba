import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import BasketballIcon from "../../components/BasketballIcon.jsx";

// The homepage hero's right-hand illustration: a hoop above an arc of 5
// basketball nav icons.
//
// Does NOT use the shared FocusRecedeGroup here (unlike a plain grid) --
// each ball is already individually absolutely-positioned along the arc
// (left:X%, translateY(bounce)), and FocusRecedeGroup wraps children in a
// plain motion.div with no size/position of its own. An absolutely-
// positioned child is taken out of normal flow entirely, so that wrapper
// collapses to zero height; `transformOrigin: "center"` on a collapsed box
// resolves to a single shared point near the top of the arc, not each
// ball's own visual center -- so scaling any ball visibly shifted it
// (and, since every wrapper collapses to the same point, looked like all 5
// were reacting together even though the underlying hover state was
// correctly isolated per-ball). Confirmed via direct DOM measurement
// during debugging, not assumed. Local hover state + the animated
// motion.div living on the SAME element as the arc placement (so its own
// transform-origin matches its own visual box) avoids this entirely -- the
// Arena carousel already had to solve the same class of problem with its
// own custom positioning for the same underlying reason.
const NAV_ITEMS = [
  { label: "Players", to: "/players", leftPct: 6, bounce: 8 },
  { label: "Teams", to: "/lineups", leftPct: 27, bounce: -16 },
  { label: "AI Strategy", to: "/predictions", leftPct: 50, bounce: -28 },
  { label: "Scouting", to: "/scouting", leftPct: 73, bounce: -14 },
  { label: "Arena", to: "/arena", leftPct: 94, bounce: 10 },
];

const NET_STRANDS = 8;
const HOVER_SPRING = { type: "spring", stiffness: 320, damping: 22, mass: 0.6 };

// Placeholder shapes -- holding off on a real redesign of the hoop/net/ball
// geometry until the reference image is in hand; this pass only touches
// animation quality (easing, the strand-wave swish below), not the shapes.
function HoopIllustration({ rippleKey }) {
  const strands = Array.from({ length: NET_STRANDS }).map((_, i) => {
    const t = i / (NET_STRANDS - 1);
    const xTop = 64 + t * 72;
    const xBottom = 92 + t * 16;
    return { xTop, xBottom, key: i };
  });

  return (
    <svg viewBox="0 0 200 150" className="h-full w-full text-ink" fill="none" stroke="currentColor">
      {/* Backboard */}
      <rect x="55" y="6" width="90" height="52" rx="4" strokeWidth="3" />
      <rect x="86" y="34" width="28" height="18" rx="2" strokeWidth="2" />
      {/* Rim */}
      <ellipse cx="100" cy="64" rx="38" ry="9" strokeWidth="4" />
      {/* Net -- a real swish, not one whole-net pulse: each strand ripples in
          its own short sequential wave (staggered start), like a shot
          actually parting the net strand-by-strand rather than the net
          jiggling as a single rigid sheet. */}
      {strands.map((s, i) => (
        <motion.path
          key={`${rippleKey}-${s.key}`}
          d={`M${s.xTop} 66 Q${(s.xTop + s.xBottom) / 2} 98 ${s.xBottom} 128`}
          strokeWidth="1.5"
          initial={{ pathOffset: 0, scaleY: 1 }}
          animate={{ scaleY: [1, 1.22, 0.9, 1] }}
          transition={{ duration: 0.5, delay: i * 0.025, ease: "easeOut" }}
          style={{ transformOrigin: `${s.xTop}px 66px` }}
        />
      ))}
      <motion.path
        key={`${rippleKey}-cross1`}
        d="M70 88 Q100 94 130 88"
        strokeWidth="1.5"
        animate={{ scaleY: [1, 1.15, 0.95, 1] }}
        transition={{ duration: 0.45, delay: 0.08, ease: "easeOut" }}
        style={{ transformOrigin: "100px 88px" }}
      />
      <motion.path
        key={`${rippleKey}-cross2`}
        d="M78 110 Q100 116 122 110"
        strokeWidth="1.5"
        animate={{ scaleY: [1, 1.15, 0.95, 1] }}
        transition={{ duration: 0.45, delay: 0.14, ease: "easeOut" }}
        style={{ transformOrigin: "100px 110px" }}
      />
    </svg>
  );
}

const LAUNCH_DURATION_S = 0.65;
// The x/y keyframes below are [start, mid-arc, rim] at times [0, MID_FRACTION, 1]
// -- the ball only reaches the FULL measured rim offset at t=1, the mid
// keyframe is deliberately short of it (that's what makes it read as an
// arc, not a straight slide). ARRIVAL_FRACTION (the net-swish trigger) has
// to be driven off t=1, not off MID_FRACTION -- tried wiring it to
// MID_FRACTION first and confirmed live via measurement that the ripple
// fired while the ball was still 80-170px short of the rim for every ball
// except the one already horizontally centered. Set close to but just
// under 1 so the ripple fires right as the ball visually arrives, not
// after it's already faded out.
const MID_FRACTION = 0.5;
const ARRIVAL_FRACTION = 0.93;

export default function NavBallArc() {
  const navigate = useNavigate();
  const [launchingIndex, setLaunchingIndex] = useState(null);
  const [launchOffset, setLaunchOffset] = useState({ dx: 0, dy: -150 });
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [rippleKey, setRippleKey] = useState(0);
  const hoopRef = useRef(null);
  const ballRefs = useRef([]);

  function handleClick(item, index) {
    if (launchingIndex !== null) return; // ignore clicks mid-flight

    // The old version just animated `y` by a fixed amount, the same for
    // every ball regardless of where it actually sits along the arc -- so
    // only the ball nearest horizontal center ever looked like it reached
    // the rim; the rest flew straight up and past the hoop entirely, while
    // the net-swish still fired on its own timer regardless. Measuring the
    // ball's and the rim's real rendered positions here and animating
    // toward the actual delta fixes both: every ball's shot now actually
    // targets the rim, and the timings below are derived from the same
    // duration/fraction the animation itself uses, not guessed separately.
    const ballEl = ballRefs.current[index];
    const hoopEl = hoopRef.current;
    if (ballEl && hoopEl) {
      const ballRect = ballEl.getBoundingClientRect();
      const hoopRect = hoopEl.getBoundingClientRect();
      // Rim ellipse sits at (cx=100, cy=64) inside the hoop SVG's 200x150
      // viewBox -- expressed as a fraction of the rendered box so it still
      // lines up at any hoop size/breakpoint.
      const rimX = hoopRect.left + hoopRect.width * (100 / 200);
      const rimY = hoopRect.top + hoopRect.height * (64 / 150);
      const ballCenterX = ballRect.left + ballRect.width / 2;
      const ballCenterY = ballRect.top + ballRect.height / 2;
      setLaunchOffset({ dx: rimX - ballCenterX, dy: rimY - ballCenterY });
    }

    setLaunchingIndex(index);
    window.setTimeout(() => setRippleKey((k) => k + 1), LAUNCH_DURATION_S * 1000 * ARRIVAL_FRACTION);
    window.setTimeout(() => navigate(item.to), LAUNCH_DURATION_S * 1000 + 30);
  }

  return (
    <div className="relative flex h-64 flex-col items-center sm:h-72">
      <div ref={hoopRef} className="h-24 w-40 sm:h-28 sm:w-48">
        <HoopIllustration rippleKey={rippleKey} />
      </div>
      <div className="relative mt-2 h-32 w-full sm:h-36">
        {NAV_ITEMS.map((item, i) => {
          const rotationDeg = (item.leftPct - 50) * 0.3;
          const isHovered = hoveredIndex === i;
          const anyHovered = hoveredIndex !== null;
          const hoverScale = isHovered ? 1.4 : anyHovered ? 0.8 : 1;
          const hoverOpacity = isHovered ? 1 : anyHovered ? 0.55 : 1;
          const hoverLift = isHovered ? -14 : 0;
          const isLaunching = launchingIndex === i;

          return (
            <button
              key={item.to}
              type="button"
              onClick={() => handleClick(item, i)}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              className="absolute bottom-0 cursor-pointer bg-transparent"
              style={{ left: `${item.leftPct}%`, transform: "translateX(-50%)" }}
              aria-label={item.label}
            >
              {/* Position (x/y) lives on this outer container; scale/opacity
                  live on the ball-graphic motion.div below instead of here.
                  Keeping them together with transformOrigin:center on this
                  whole flex box (ball + label stacked) meant "center" was
                  the midpoint of ball+label combined, not the ball's own
                  center -- as scale shrank toward the end of a shot, the
                  ball visibly drifted toward that lower combined-center
                  instead of staying on the computed rim target. Confirmed
                  via measurement: horizontal error converged to ~0 as
                  intended, but vertical error plateaued around ~30px even
                  at 99% of the flight. Scoping scale to a motion.div that
                  contains ONLY the ball fixes that at the source. */}
              <motion.div
                animate={
                  isLaunching
                    ? {
                        x: [0, launchOffset.dx * 0.5, launchOffset.dx],
                        // Midpoint overshoots higher than a straight
                        // lerp toward the rim -- that's what reads as a
                        // real shot arc rather than a mechanical slide.
                        y: [
                          item.bounce,
                          item.bounce + launchOffset.dy * 0.55 - 36,
                          item.bounce + launchOffset.dy,
                        ],
                      }
                    : { x: 0, y: item.bounce + hoverLift }
                }
                transition={
                  isLaunching
                    ? { duration: LAUNCH_DURATION_S, ease: ["easeOut", "easeIn"], times: [0, MID_FRACTION, 1] }
                    : HOVER_SPRING
                }
                className="flex flex-col items-center gap-1"
              >
                <motion.div
                  ref={(el) => (ballRefs.current[i] = el)}
                  animate={
                    isLaunching
                      ? { scale: [1, 1.05, 0.25], opacity: [1, 1, 0], rotate: rotationDeg }
                      : { scale: hoverScale, opacity: hoverOpacity, rotate: rotationDeg }
                  }
                  transition={
                    isLaunching
                      ? { duration: LAUNCH_DURATION_S, ease: ["easeOut", "easeIn"], times: [0, MID_FRACTION, 1] }
                      : HOVER_SPRING
                  }
                  style={{ transformOrigin: "center" }}
                >
                  <BasketballIcon className="h-10 w-10 drop-shadow-[3px_3px_0_rgba(0,0,0,0.9)] sm:h-12 sm:w-12" />
                </motion.div>
                <motion.span
                  animate={{ opacity: isLaunching ? 0 : hoverOpacity }}
                  transition={{ duration: isLaunching ? 0.15 : 0.2 }}
                  className="font-hoop text-xs font-semibold text-ink"
                  style={{ transform: `rotate(${rotationDeg * 0.5}deg)` }}
                >
                  {item.label}
                </motion.span>
              </motion.div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
