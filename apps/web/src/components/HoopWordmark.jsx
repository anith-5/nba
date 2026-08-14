// The "HoopIQ" wordmark for the redesign. Composed, not literal font-glyph
// styling — the two O's in "Hoop" are basketball-icon elements standing in
// for the letterform (a filled circle with seam-line strokes through it),
// not the font's own O glyph recolored. There's no reliable cross-browser
// CSS/font trick to render seam lines "through" a real O glyph tied to
// font metrics, so this buys pixel control by not depending on the glyph
// shape for the O's at all — same reasoning for the basketball-outline
// behind the H, which is an absolutely-positioned SVG, not a background
// image clipped to text.
function BasketballO({ className = "" }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className={className}>
      <circle cx="20" cy="20" r="18" className="fill-ink" />
      <path
        d="M2 20h36M20 2v36M7 7c9 7 9 26 0 33M33 7c-9 7-9 26 0 33"
        stroke="#F2F1EA"
        strokeWidth="1.8"
        fill="none"
      />
    </svg>
  );
}

export default function HoopWordmark({ className = "" }) {
  return (
    <div className={`relative flex items-end ${className}`} role="img" aria-label="HoopIQ">
      {/* Basketball outline (seam lines only, no fill) behind/overlapping the H.
          Sized via h-full + aspect-square (not a % width) -- the root div's
          width is content-driven/auto (it's just however wide H+O+O+P+IQ add
          up to), so a percentage WIDTH here has no reliable ancestor to
          resolve against and silently computes to something tiny or huge.
          h-full resolves cleanly against the root's own EXPLICIT height (the
          caller always passes one, e.g. h-8), and aspect-square derives width
          from that same height directly, so this can't drift with content
          width the way the original percentage-based version did. */}
      <svg
        viewBox="0 0 100 100"
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 aspect-square h-full origin-top-left scale-[1.35] text-ink"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      >
        <circle cx="50" cy="50" r="46" />
        <path d="M4 50h92M50 4v92M17 17c18 14 18 52 0 66M83 17c-18 14-18 52 0 66" />
      </svg>

      <span className="relative font-hoop text-4xl font-bold leading-none text-ink">H</span>
      <BasketballO className="relative h-9 w-9 shrink-0" />
      <BasketballO className="relative h-9 w-9 shrink-0" />
      <span className="relative font-hoop text-4xl font-bold leading-none text-ink">P</span>
      <span className="relative ml-1 font-hoop text-xl font-bold leading-none text-basketball">IQ</span>
    </div>
  );
}
