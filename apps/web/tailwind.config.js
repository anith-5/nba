/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        // One typeface everywhere — Hanken Grotesk (free Calibre-style grotesque,
        // matching the StatMuse look). Body, headings, and numbers all share it.
        // LEGACY — kept as-is for every page not yet migrated to the new "hoop"
        // visual identity (see fontFamily.hoop below). Do not touch until the
        // final cleanup phase once nothing references it.
        sans: ["Hanken Grotesk", "system-ui", "sans-serif"],
        display: ["Hanken Grotesk", "system-ui", "sans-serif"],
        // Same face for figures; tabular-nums keeps stat columns aligned.
        mono: ["Hanken Grotesk", "system-ui", "sans-serif"],
        // NEW — the redesign's rounded/bubble display face (wordmark, headings,
        // buttons on migrated pages). Fredoka's O/rounded-letter shapes are the
        // closest match to the basketball-bubble treatment in the reference
        // visuals. Added alongside `display`, not replacing it, so unmigrated
        // pages keep rendering in Hanken Grotesk exactly as today.
        hoop: ["Fredoka", "system-ui", "sans-serif"],
      },
      colors: {
        // LEGACY (black/red/white StatMuse system) — kept alive until every
        // page has migrated off it; see the new hoop-* tokens below for the
        // redesign. Do not remove/repurpose these mid-rollout — several pages
        // still reference them directly (`brand`, `court`, `surface`, `live`).
        brand: {
          DEFAULT: "#EF4444",
          glow: "#F87171",
          dim: "#DC2626",
        },
        live: {
          DEFAULT: "#EF4444",
          glow: "#F87171",
          dim: "#DC2626",
        },
        surface: {
          DEFAULT: "#000000", // background
          raised: "#121214", // cards
          border: "#2A2A2E",
        },
        // Legacy alias: existing pages reference `court-*` → red.
        court: {
          DEFAULT: "#EF4444",
          dim: "#DC2626",
          glow: "#F87171",
        },

        // NEW — the "HoopIQ" redesign palette. Additive alongside the legacy
        // tokens above; pages opt in by switching their classNames when their
        // own rollout phase comes up (see the redesign plan). `court` was
        // deliberately NOT reused for the new basketball-orange accent even
        // though the word fits semantically — it's already a legacy alias for
        // red, and reusing it here for an unrelated color would make the same
        // token name mean two different colors depending on which page you're
        // reading, which is exactly the confusion a dual-token rollout needs
        // to avoid.
        paper: {
          DEFAULT: "#F2F1EA", // base background, every migrated page/chrome
          raised: "#FAFAF6", // slightly lighter, for a card-on-paper distinction if needed
        },
        ink: {
          DEFAULT: "#2431C4", // primary text, headings, nav — deep royal blue
          dim: "#1C2699",
          glow: "#3F4EE0",
        },
        terracotta: {
          DEFAULT: "#C15B3C", // secondary labels, card fills, UI accents
          dim: "#9E4A30",
          glow: "#D37456",
        },
        // Reserved specifically for interactive basketball-icon elements
        // (wordmark O's, nav-ball arc, carousel) — distinct from terracotta.
        basketball: {
          DEFAULT: "#E67E3C",
          dim: "#C6672E",
          glow: "#F0985F",
        },
      },
      borderRadius: {
        card: "16px",
        // NEW — the redesign's card radius range (16-20px); "hoop" name
        // mirrors the new color/shadow/font token naming convention.
        hoop: "18px",
      },
      boxShadow: {
        // LEGACY glassmorphism shadows — kept for unmigrated pages.
        card: "0 1px 2px rgba(0,0,0,0.3), 0 8px 24px -12px rgba(0,0,0,0.5)",
        lift: "0 8px 30px -8px rgba(239,68,68,0.3)",
        // NEW — hard offset "screen-printed sticker" shadow, crisp not blurred.
        // `-sm` is for smaller primitives (inputs, badges); `-pressed` is the
        // collapsed-to-zero-offset state buttons animate to on :active, giving
        // the physical "pushed into the page" feel.
        hoop: "5px 5px 0 0 #131313",
        "hoop-sm": "3px 3px 0 0 #131313",
        "hoop-pressed": "0 0 0 0 #131313",
      },
      animation: {
        "fade-in": "fadeIn 0.4s ease-out",
        "slide-up": "slideUp 0.35s ease-out",
        "pulse-live": "pulseLive 1.6s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseLive: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.45", transform: "scale(0.85)" },
        },
      },
    },
  },
  plugins: [],
};
