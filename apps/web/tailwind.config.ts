import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#111827",
        ink: "#f8fafc",
        accent: "#38bdf8"
      },
      boxShadow: {
        panel: "0 20px 45px rgba(15, 23, 42, 0.18)"
      }
    }
  },
  plugins: []
} satisfies Config;

