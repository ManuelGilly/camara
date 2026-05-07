import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b1020",
        panel: "#11172b",
        accent: "#5b8cff",
        accent2: "#7b5bff",
        ok: "#22c55e",
        danger: "#ef4444",
        muted: "#7c8aa6",
      },
    },
  },
  plugins: [],
};

export default config;
