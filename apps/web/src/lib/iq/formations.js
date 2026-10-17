/*
 * Shared setups for scenario authoring.
 *
 * A scenario is ten positions plus a question. Written out longhand that is
 * twenty coordinates per scenario and no reader can tell a 5-out from a horns
 * set by looking at it. These helpers name the shapes instead, so a setup
 * reads as the thing a coach would call it and only the detail that matters
 * to that particular read gets spelled out.
 */

import { SPOT, guarding, shadedToward } from "./court.js";

/** One offensive player. `ball` marks the handler, `you` the controlled man. */
export const O = (id, pos, spot, extra = {}) => ({ id, pos, spot: { ...spot }, ...extra });

/** One defender. `guards` is the offensive id they are matched up with. */
export const D = (id, pos, spot, guards, extra = {}) => ({
  id,
  pos,
  spot: { ...spot },
  guards,
  ...extra,
});

/** Defender in normal on-ball position: between their man and the rim. */
export const onBall = (id, pos, man, guards, gap = 3) =>
  D(id, pos, guarding(man, gap), guards);

/** Defender helping — shaded `shift` feet off their man toward the ball. */
export const helping = (id, pos, man, guards, toward, shift) =>
  D(id, pos, shadedToward(man, toward, shift), guards, { helping: true });

// ── Common offensive shapes ─────────────────────────────────────────────────

/** Five players spaced around the arc. Modern default: nobody in the paint,
 *  so every drive has a lane and every help defender has to leave somebody. */
export const fiveOut = () => [
  O("o1", "PG", SPOT.top3),
  O("o2", "SG", SPOT.wingR3),
  O("o3", "SF", SPOT.cornerR3),
  O("o4", "PF", SPOT.wingL3),
  O("o5", "C", SPOT.cornerL3),
];

/** Four around, one at the dunker spot. The big is a lob threat and the
 *  low-man help defender cannot fully leave him. */
export const fourOneIn = () => [
  O("o1", "PG", SPOT.top3),
  O("o2", "SG", SPOT.wingR3),
  O("o3", "SF", SPOT.cornerR3),
  O("o4", "PF", SPOT.wingL3),
  O("o5", "C", SPOT.dunkerL),
];

/** Horns: two bigs at the elbows, two shooters in the corners. */
export const horns = () => [
  O("o1", "PG", SPOT.top3),
  O("o2", "SG", SPOT.cornerR3),
  O("o3", "SF", SPOT.cornerL3),
  O("o4", "PF", SPOT.elbowL),
  O("o5", "C", SPOT.elbowR),
];

/** Standard man-to-man, everyone attached. The baseline to deviate from. */
export const manToMan = (offense, gaps = {}) =>
  offense.map((o, i) =>
    onBall(`d${i + 1}`, o.pos, o.spot, o.id, gaps[o.id] ?? 3.2),
  );

/** Move one player in a list to a new spot without mutating the original. */
export const at = (players, id, spot, extra = {}) =>
  players.map((p) => (p.id === id ? { ...p, spot: { ...spot }, ...extra } : p));

/** Give the ball to someone, and mark who the user controls. */
export const ball = (players, id) =>
  players.map((p) => ({ ...p, ball: p.id === id }));

export const you = (players, id) =>
  players.map((p) => ({ ...p, you: p.id === id }));
