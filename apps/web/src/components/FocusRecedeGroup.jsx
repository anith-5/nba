import { Children, useState } from "react";
import { motion } from "framer-motion";

// Shared "one focused, rest recede" interaction: hover any child and it
// scales up with spring/overshoot physics + lifts, while every sibling
// scales down and fades. One reusable pattern, not duplicated per page —
// see the redesign plan for where this gets applied (nav-ball arc, Arena
// carousel, and any other hover-to-focus grid/list flagged along the way).
//
// Wraps each child in its own motion.div and renders them inside a single
// container that takes `className`, so the caller's existing grid/flex
// layout classes (e.g. "grid grid-cols-3 gap-4") apply to the container and
// each child still behaves as a normal grid/flex item.
//
// Scale/recede intensity is configurable, not fixed — a compact nav item, a
// dense card grid, and a big illustrated hero icon all want different
// amounts of "how much does the focused one blow up." Defaults are tuned
// for nav/card-grid contexts (moderate ~1.15x); the homepage hero's ball arc
// opts into the larger 1.35-1.5x range explicitly via scaleAmount.
const NEUTRAL = { scale: 1, y: 0, opacity: 1, zIndex: 1 };
const SPRING = { type: "spring", stiffness: 320, damping: 22, mass: 0.6 };

// `onFocusChange(index | null)` is an optional escape hatch for consumers
// that need to know which item is focused beyond the visual effect itself
// (e.g. a carousel re-centering on the hovered card) — the recede/focus
// visuals below work on their own without it.
export default function FocusRecedeGroup({
  children,
  className = "",
  onFocusChange,
  scaleAmount = 1.15,
  recedeScale = 0.85,
  recedeOpacity = 0.65,
  lift = -10,
  ...rest
}) {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const items = Children.toArray(children);

  const focused = { scale: scaleAmount, y: lift, opacity: 1, zIndex: 10 };
  const receded = { scale: recedeScale, y: 0, opacity: recedeOpacity, zIndex: 1 };

  function handleEnter(i) {
    setHoveredIndex(i);
    onFocusChange?.(i);
  }
  function handleLeave() {
    setHoveredIndex(null);
    onFocusChange?.(null);
  }

  return (
    <div className={className} {...rest}>
      {items.map((child, i) => {
        const isFocused = hoveredIndex === i;
        const anyFocused = hoveredIndex !== null;
        const animateState = isFocused ? focused : anyFocused ? receded : NEUTRAL;
        return (
          <motion.div
            key={child.key ?? i}
            animate={animateState}
            transition={SPRING}
            style={{ transformOrigin: "center" }}
            onHoverStart={() => handleEnter(i)}
            onHoverEnd={handleLeave}
          >
            {child}
          </motion.div>
        );
      })}
    </div>
  );
}
