import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { api } from "../api.js";
import LatestNewsModule from "./home/LatestNewsModule.jsx";
import NavBallArc from "./home/NavBallArc.jsx";

const STANDINGS = {
  East: [["BOS", "Celtics", 41, 12], ["CLE", "Cavaliers", 39, 14], ["NYK", "Knicks", 36, 17],
    ["MIL", "Bucks", 33, 20], ["ORL", "Magic", 32, 22], ["IND", "Pacers", 30, 23]],
  West: [["OKC", "Thunder", 43, 10], ["DEN", "Nuggets", 38, 15], ["MEM", "Grizzlies", 36, 18],
    ["HOU", "Rockets", 34, 19], ["LAL", "Lakers", 32, 21], ["DAL", "Mavericks", 31, 22]],
};
const SCORING_LEADERS = [
  ["Shai Gilgeous-Alexander", "OKC", 32.6], ["Giannis Antetokounmpo", "MIL", 30.4],
  ["Nikola Jokić", "DEN", 29.7], ["Luka Dončić", "DAL", 28.1], ["Jayson Tatum", "BOS", 27.8],
];
const CLUTCH_LEADERS = [
  ["Shai Gilgeous-Alexander", "OKC", 6.5], ["Anthony Edwards", "MIN", 5.6],
  ["Luka Dončić", "DAL", 5.4], ["Jalen Brunson", "NYK", 5.1], ["Nikola Jokić", "DEN", 4.8],
];

// Dashboard content sits above the hero, both in NORMAL page flow -- real
// page scroll, real content height, no pinned/sticky viewport-height frame.
// A prior version pinned both sections as absolutely-positioned overlapping
// layers inside an artificial 220vh spacer, cross-fading between them --
// that produced two visually-separate stacked panels (each only occupying
// a small centered island inside a full-viewport-height frame, with large
// empty margins) rather than one continuous page. Normal flow fixes that
// directly: total page height is just the real content height.
//
// Each section still gets its own scroll-reveal, tied to ITS OWN scroll
// progress through the viewport (not a shared pinned-window progress) --
// the hero eases in as it scrolls up into view, the dashboard eases down
// slightly as it scrolls out. That's what keeps this feeling like one
// dynamic page rather than two static blocks, without needing the pinned
// overlay trick.
export default function Home() {
  const [summary, setSummary] = useState(null);
  const dashboardRef = useRef(null);
  const heroRef = useRef(null);

  useEffect(() => {
    api.standings().then(setSummary).catch(() => {});
  }, []);

  // 0 when the dashboard's top hits the viewport top, 1 once it's fully
  // scrolled past (its bottom reaches the viewport top).
  const { scrollYProgress: dashboardProgress } = useScroll({
    target: dashboardRef,
    offset: ["start start", "end start"],
  });
  const dashboardOpacity = useTransform(dashboardProgress, [0, 0.75, 1], [1, 1, 0.5]);
  const dashboardScale = useTransform(dashboardProgress, [0, 1], [1, 0.97]);

  // 0 when the hero's top is still at the viewport bottom (just entering),
  // 1 once its top reaches the viewport top -- a standard scroll-reveal.
  const { scrollYProgress: heroProgress } = useScroll({
    target: heroRef,
    offset: ["start end", "start start"],
  });
  const heroOpacity = useTransform(heroProgress, [0, 1], [0.35, 1]);
  const heroScale = useTransform(heroProgress, [0, 1], [0.92, 1.04]);

  const standings = summary?.standings?.East?.length
    ? { East: summary.standings.East.map((t) => [t.tri, t.name, t.w, t.l]),
        West: summary.standings.West.map((t) => [t.tri, t.name, t.w, t.l]) }
    : STANDINGS;
  const scoring = summary?.scoring_leaders?.length
    ? summary.scoring_leaders.map((s) => [s.name, s.tri, s.ppg])
    : SCORING_LEADERS;
  const clutch = summary?.clutch_leaders?.length
    ? summary.clutch_leaders.map((c) => [c.name, c.tri, c.ppg])
    : CLUTCH_LEADERS;

  return (
    <div className="animate-fade-in -mx-4 -my-6 min-h-[calc(100dvh-4rem)] bg-paper px-4 py-10 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <motion.div
        ref={dashboardRef}
        style={{ opacity: dashboardOpacity, scale: dashboardScale }}
        className="mx-auto max-w-5xl"
      >
        <LatestNewsModule scoring={scoring} clutch={clutch} standings={standings} />
      </motion.div>

      <motion.div
        ref={heroRef}
        style={{ opacity: heroOpacity, scale: heroScale }}
        className="mx-auto mt-16 max-w-3xl pb-12"
      >
        <NavBallArc />
      </motion.div>
    </div>
  );
}
