/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        // One typeface everywhere — Hanken Grotesk (free Calibre-style grotesque,
        // matching the StatMuse look). Body, headings, and numbers all share it.
        sans: ["Hanken Grotesk", "system-ui", "sans-serif"],
        display: ["Hanken Grotesk", "system-ui", "sans-serif"],
        // Same face for figures; tabular-nums keeps stat columns aligned.
        mono: ["Hanken Grotesk", "system-ui", "sans-serif"],
      },
      colors: {
        // Primary — red. Buttons, links, active nav, emphasis. (black/red/white)
        brand: {
          DEFAULT: "#EF4444",
          glow: "#F87171",
          dim: "#DC2626",
        },
        // Live / urgent — same red family, distinguished by the pulse animation.
        live: {
          DEFAULT: "#EF4444",
          glow: "#F87171",
          dim: "#DC2626",
        },
        // Surfaces — black / near-black
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
      },
      borderRadius: {
        card: "16px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.3), 0 8px 24px -12px rgba(0,0,0,0.5)",
        lift: "0 8px 30px -8px rgba(239,68,68,0.3)",
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
