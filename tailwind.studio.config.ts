import type { Config } from "tailwindcss";

/**
 * The Studio's own Tailwind build (`npm run studio:css`, from src/app/studio/studio.tailwind.css). It
 * carries the Astro Study's palette and type, not AGS's: AGS's theme already uses some of the same names
 * (ink, line, accent) for other colours, so every utility here is scoped under `.studio` and wins only
 * inside it. No preflight: AGS's own build has already applied it to the page.
 */
const config: Config = {
  content: ["./src/app/studio/**/*.{ts,tsx}", "./src/components/studio/**/*.{ts,tsx}", "./src/studio/**/*.{ts,tsx}"],
  important: ".studio",
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        paper: "#f3f1ea",
        card: "#faf9f5",
        ink: { DEFAULT: "#1c211b", 2: "#474e44", 3: "#6b7268" },
        line: { DEFAULT: "rgba(28,33,27,.14)", 2: "rgba(28,33,27,.3)" },
        accent: { DEFAULT: "#b5512c", ink: "#8f3d1f", soft: "#f4e3d9" },
        gold: { DEFAULT: "#c98a2e", soft: "#f6ead4" },
        moss: { DEFAULT: "#4f7a45", soft: "#e3ecdc" },
        sky: { DEFAULT: "#2f5d8a", soft: "#dfe8f1" },
        rust: { DEFAULT: "#a8322a", soft: "#f5dcd9" },
      },
      fontFamily: {
        serif: ['"Astro Symbols"', "Fraunces", '"Iowan Old Style"', "Georgia", "serif"],
        sans: ['"Astro Symbols"', "Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(28,33,27,.06), 0 8px 24px -12px rgba(28,33,27,.18)",
        sheet: "0 -12px 40px -12px rgba(28,33,27,.35)",
      },
    },
  },
  plugins: [],
};

export default config;
