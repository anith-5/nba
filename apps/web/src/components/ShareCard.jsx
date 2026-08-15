import { useRef, useState } from "react";
import { toPng } from "html-to-image";

/*
 * Purpose-built share card — NOT a screenshot of the live page.
 *
 * We render a fixed 1080x1350 (Instagram portrait) card off-screen with the
 * HoopIQ logo + URL baked in, and capture that. Same clean, branded output
 * every time, on every device.
 *
 * Gotchas handled here:
 *  - Off-screen via position:absolute/left:-9999px (NOT display:none, which
 *    captures blank).
 *  - Fonts awaited (document.fonts.ready) before capture, or text renders blank.
 *  - Logo is an inline SVG (same-origin, no CORS) so it never comes back blank.
 */

// Inline hex (not Tailwind classes) because html-to-image captures computed
// inline styles most reliably. These mirror the hoop-* tokens in
// tailwind.config.js — keep the two in step.
const PAPER = "#F2F1EA";
const CARD = "#FAFAF6";
const BASKETBALL = "#E67E3C";
const TERRACOTTA = "#C15B3C";
const TEXT = "#2431C4";
const MUTED = "#6B72D8";
const RULE = "rgba(36,49,196,0.18)";

function LogoMark({ size = 64 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <div
        style={{
          width: size, height: size, borderRadius: 18, background: BASKETBALL,
          display: "flex", alignItems: "center", justifyContent: "center",
          border: `2px solid ${TEXT}`, boxShadow: `4px 4px 0 0 #131313`,
        }}
      >
        <svg viewBox="0 0 24 24" width={size * 0.56} height={size * 0.56} fill="none" stroke={PAPER} strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3v18M3 12h18M5.6 5.6c3 2.4 3 10.4 0 12.8M18.4 5.6c-3 2.4-3 10.4 0 12.8" />
        </svg>
      </div>
      <div style={{ lineHeight: 1.05 }}>
        <div style={{ fontFamily: "Fredoka, system-ui, sans-serif", fontWeight: 700, fontSize: 34, color: TEXT }}>
          HoopIQ
        </div>
        <div style={{ fontSize: 15, letterSpacing: 3, textTransform: "uppercase", color: MUTED }}>
          NBA Analytics
        </div>
      </div>
    </div>
  );
}

/** The visual card. Rendered off-screen; captured to PNG. */
export function ShareCard({ cardRef, eyebrow, title, subtitle, bigValue, bigLabel, accent = TERRACOTTA, rows = [] }) {
  return (
    <div
      ref={cardRef}
      style={{
        position: "absolute", left: "-9999px", top: 0,
        width: 1080, height: 1350,
        background: `radial-gradient(1200px 700px at 50% -10%, ${CARD} 0%, ${PAPER} 55%)`,
        color: TEXT, padding: 72, boxSizing: "border-box",
        display: "flex", flexDirection: "column",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {/* Header */}
      <LogoMark />

      {/* Body */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", marginTop: 24 }}>
        {eyebrow && (
          <div style={{ fontSize: 26, letterSpacing: 5, textTransform: "uppercase", color: accent, fontWeight: 600 }}>
            {eyebrow}
          </div>
        )}
        {title && (
          <div style={{ fontFamily: "Fredoka, system-ui, sans-serif", fontWeight: 700, fontSize: 76, lineHeight: 1.05, marginTop: 14 }}>
            {title}
          </div>
        )}
        {subtitle && <div style={{ fontSize: 30, color: MUTED, marginTop: 12 }}>{subtitle}</div>}

        {/* Big value */}
        {bigValue != null && (
          <div style={{ marginTop: 56, display: "flex", alignItems: "flex-end", gap: 28 }}>
            <div
              style={{
                fontFamily: "Fredoka, system-ui, sans-serif", fontWeight: 700,
                fontSize: 300, lineHeight: 0.85, color: accent,
              }}
            >
              {bigValue}
            </div>
            {bigLabel && (
              <div style={{ fontSize: 34, color: MUTED, paddingBottom: 24, maxWidth: 320 }}>{bigLabel}</div>
            )}
          </div>
        )}

        {/* Secondary rows */}
        {rows.length > 0 && (
          <div
            style={{
              marginTop: 64, display: "grid",
              gridTemplateColumns: `repeat(${Math.min(rows.length, 3)}, 1fr)`, gap: 24,
            }}
          >
            {rows.slice(0, 6).map((r, i) => (
              <div key={i} style={{ background: CARD, borderRadius: 20, padding: "28px 24px", border: `2px solid ${RULE}` }}>
                <div style={{ fontFamily: "Fredoka, system-ui, sans-serif", fontWeight: 700, fontSize: 52, color: TEXT }}>
                  {r.value}
                </div>
                <div style={{ fontSize: 22, color: MUTED, marginTop: 6, textTransform: "uppercase", letterSpacing: 2 }}>
                  {r.label}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: `2px solid ${RULE}`, paddingTop: 30 }}>
        <div style={{ fontSize: 30, color: MUTED }}>Generated on HoopIQ</div>
        <div style={{ fontFamily: "Fredoka, system-ui, sans-serif", fontWeight: 600, fontSize: 32, color: TERRACOTTA }}>
          hoopiq.com
        </div>
      </div>
    </div>
  );
}

/**
 * Drop-in Share button. Renders the off-screen ShareCard and captures it.
 * Native share sheet on mobile, PNG download on desktop.
 *
 * Usage:
 *   <ShareButton eyebrow="Shot Grade" title="L. Doncic vs R. Gobert"
 *     bigValue="A-" bigLabel="Contested pull-up 3" accent="#2F7D5B"
 *     rows={[{label:"PPP", value:"1.18"}, {label:"FG%", value:"39%"}]} />
 */
export default function ShareButton({ className = "", label = "Share", ...cardProps }) {
  const cardRef = useRef(null);
  const [busy, setBusy] = useState(false);

  async function onShare() {
    if (!cardRef.current || busy) return;
    setBusy(true);
    try {
      // Fonts must be ready or text captures blank.
      if (document.fonts && document.fonts.ready) await document.fonts.ready;

      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true });
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], "hoopiq-card.png", { type: "image/png" });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "HoopIQ" });
      } else {
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = "hoopiq-card.png";
        link.click();
      }
    } catch (e) {
      // User cancelling the native share sheet throws — ignore that.
      if (e && e.name !== "AbortError") console.error("Share failed:", e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onShare}
        disabled={busy}
        className={className || "inline-flex items-center gap-2 rounded-lg border border-ink/10 bg-ink/5 px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-ink/10 disabled:opacity-50"}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v13" />
        </svg>
        {busy ? "Saving…" : label}
      </button>
      <ShareCard cardRef={cardRef} {...cardProps} />
    </>
  );
}
