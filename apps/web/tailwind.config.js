/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        // Body copy — calm, readable
        sans: ["Inter", "system-ui", "sans-serif"],
        // Headings, scores, big numbers — rounded, friendly, bold
        display: ["Fredoka", "system-ui", "sans-serif"],
        // Tabular figures for stat tables / timers (prevents layout shift)
        mono: ["JetBrains Mono", "monospace"],
      },
      colors: {
        // Primary — blue. Buttons, links, active nav.
        brand: {
          DEFAULT: "#2563EB",
          glow: "#3B82F6",
          dim: "#1D4ED8",
        },
        // Live / urgent ONLY — a running sim, a live game, "on the clock".
        live: {
          DEFAULT: "#EA580C",
          glow: "#FB923C",
          dim: "#C2410C",
        },
        // Surfaces — deep navy
        surface: {
          DEFAULT: "#0F172A", // background
          raised: "#1E293B", // cards
          border: "#334155",
        },
        // Legacy alias: existing pages reference `court-*`. Repointed
        // from the old green to the new blue so they inherit the restyle.
        court: {
          DEFAULT: "#2563EB",
          dim: "#1D4ED8",
          glow: "#3B82F6",
        },
      },
      borderRadius: {
        card: "16px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.3), 0 8px 24px -12px rgba(0,0,0,0.5)",
        lift: "0 8px 30px -8px rgba(37,99,235,0.35)",
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
