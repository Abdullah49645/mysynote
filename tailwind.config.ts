import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        studio: {
          bg: "#0a0b0f",
          panel: "#111319",
          panel2: "#161923",
          line: "#232634",
          text: "#e7e9ee",
          muted: "#8890a4",
        },
        cyan: {
          glow: "#4ff2e0",
        },
        magenta: {
          glow: "#ff4fd8",
        },
        amber: {
          glow: "#ffb84f",
        },
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      boxShadow: {
        "glow-cyan": "0 0 12px rgba(79,242,224,0.35)",
        "glow-magenta": "0 0 12px rgba(255,79,216,0.35)",
        "glow-amber": "0 0 10px rgba(255,184,79,0.4)",
      },
    },
  },
  plugins: [],
};
export default config;
