import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { api } from "../api.js";
import LatestNewsModule from "./home/LatestNewsModule.jsx";
import NavBallArc from "./home/NavBallArc.jsx";

// Fallback for when the standings API can't be reached. The API is the source
// of truth; this only renders while it's unavailable -- which on Render's free
// tier means the ~70s cold start on the first visit after an idle period, i.e.
// for a lot of real first impressions.
//
// These were previously invented mid-season 2024-25 numbers (Celtics 41-12,
// Luka on Dallas), so a cold start showed records that had never been final and
// a player on the wrong team. They are now the real 2025-26 final figures, so
// the cold-start view matches what loads a moment later instead of contradicting
// it.
const FALLBACK_SEASON = "2025-26";
const STANDINGS = {
  East: [["DET", "Pistons", 60, 22], ["BOS", "Celtics", 56, 26], ["NYK", "Knicks", 53, 29],
    ["CLE", "Cavaliers", 52, 30], ["TOR", "Raptors", 46, 36], ["ATL", "Hawks", 46, 36]],
  West: [["OKC", "Thunder", 64, 18], ["SAS", "Spurs", 62, 20], ["DEN", "Nuggets", 54, 28],
    ["LAL", "Lakers", 53, 29], ["HOU", "Rockets", 52, 30], ["MIN", "Timberwolves", 49, 33]],
};
const SCORING_LEADERS = [
  ["Luka Dončić", "LAL", 33.5], ["Shai Gilgeous-Alexander", "OKC", 31.1],
  ["Anthony Edwards", "MIN", 28.8], ["Jaylen Brown", "BOS", 28.7], ["Tyrese Maxey", "PHI", 28.3],
];
const CLUTCH_LEADERS = [
  ["Shai Gilgeous-Alexander", "OKC", 6.5], ["Anthony Edwards", "MIN", 5.6],
  ["Nikola Jokić", "DEN", 4.8], ["Stephen Curry", "GSW", 4.5], ["Jamal Murray", "DEN", 4.4],
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
  const season = summary?.season || FALLBACK_SEASON;

  return (
    <div className="animate-fade-in -mx-4 -my-6 min-h-[calc(100dvh-4rem)] bg-paper px-4 py-10 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <motion.div
        ref={dashboardRef}
        style={{ opacity: dashboardOpacity, scale: dashboardScale }}
        className="mx-auto max-w-5xl"
      >
        <LatestNewsModule scoring={scoring} clutch={clutch} standings={standings} season={season} />
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
