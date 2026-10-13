import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "hsl(var(--surface))",
          raised: "hsl(var(--surface-raised))",
          overlay: "hsl(var(--surface-overlay))",
          sunken: "hsl(var(--surface-sunken))",
        },
        line: {
          DEFAULT: "hsl(var(--line))",
          strong: "hsl(var(--line-strong))",
        },
        ink: {
          DEFAULT: "hsl(var(--ink))",
          secondary: "hsl(var(--ink-secondary))",
          muted: "hsl(var(--ink-muted))",
          faint: "hsl(var(--ink-faint))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          hover: "hsl(var(--accent-hover))",
          soft: "hsl(var(--accent-soft))",
          foreground: "hsl(var(--accent-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          soft: "hsl(var(--success-soft))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          soft: "hsl(var(--warning-soft))",
        },
        highlight: "hsl(var(--highlight))",
        danger: {
          DEFAULT: "hsl(var(--danger))",
          soft: "hsl(var(--danger-soft))",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        DEFAULT: "0.5rem",
        card: "0.75rem",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        pop: "var(--shadow-pop)",
        glow: "0 0 0 1px hsl(var(--accent) / 0.35), 0 4px 24px hsl(var(--accent) / 0.25)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.35s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
