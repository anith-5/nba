/*
 * Plain-text rendering for model-written copy.
 *
 * The AI features (scouting report, GM assistant, defense game plan, trade
 * summary) return prose that the UI prints directly. Models reach for markdown
 * and emoji whether or not the prompt asked for them, and nothing here renders
 * markdown — so **bold** used to arrive on screen as literal asterisks. The
 * prompts now ask for plain text with no emoji; this is the second line of
 * defence for when a model ignores that, which it sometimes will.
 */

// The section headers the scouting prompt asks for, used to style those lines
// as headings now that they no longer arrive wrapped in asterisks.
export const REPORT_SECTIONS = new Set([
  "Overview",
  "Offensive Profile",
  "Defensive Profile",
  "Best Comparable",
  "Outlook",
  "Trade Value",
]);

// Pictographic ranges only: the emoji planes, misc symbols (warning signs,
// no-entry), stars, and the variation/keycap joiners.
//
// Deliberately NOT included are the blocks the UI uses as typographic marks,
// which are kept site-wide: arrows (U+2190-21FF, →), geometric shapes
// (U+25A0-25FF, ▲ ▼ ●) and dingbats (U+2700-27BF, ✓ ✗ ✕). Nor can any of this
// touch the accented characters in player names.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{20E3}]/gu;

/**
 * One line of model output as plain text. Any bullet marker becomes a real
 * bullet, heading marks are dropped, and every remaining asterisk goes — the
 * app has no use for one, so removing them outright beats trying to parse
 * whichever emphasis syntax the model happened to reach for.
 */
export function plainLine(line) {
  let s = (line ?? "").replace(EMOJI, "").trim();
  s = s.replace(/^#{1,6}\s*/, "");
  // The bullet marker has to be read BEFORE asterisks are dropped, since "*"
  // is itself one of the markers a model might use for a list.
  const isBullet = /^[-*•]\s+/.test(s);
  if (isBullet) s = s.replace(/^[-*•]\s+/, "");
  s = s.replace(/\*/g, "").trim();
  return isBullet ? `• ${s}` : s;
}

/** The same, over a whole block of text. */
export function plainText(text) {
  return (text ?? "").split(/\r?\n/).map(plainLine).join("\n");
}
