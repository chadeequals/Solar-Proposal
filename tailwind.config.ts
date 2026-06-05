import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Sundial brand palette — deep navy + amber gold
        navy: {
          950: "#05071a",
          900: "#0a0e27",
          800: "#0f1540",
          700: "#141c55",
          600: "#1a246a",
          500: "#202d80",
        },
        amber: {
          // Standard Tailwind amber extended
          DEFAULT: "#f59e0b",
        },
        gold: {
          50: "#fffbeb",
          100: "#fef3c7",
          200: "#fde68a",
          300: "#fcd34d",
          400: "#fbbf24",
          500: "#f59e0b",
          600: "#d97706",
          700: "#b45309",
        },
      },
      fontFamily: {
        // Serif for display/headings (loaded via Google Fonts in layout.tsx)
        serif: ["Playfair Display", "Georgia", "serif"],
        // Sans for body
        sans: ["Inter", "system-ui", "sans-serif"],
        // Mono for data/code
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      backgroundImage: {
        // Solar grid pattern — used as CSS-only decorative background
        "solar-grid": `
          linear-gradient(rgba(245, 158, 11, 0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(245, 158, 11, 0.04) 1px, transparent 1px)
        `,
      },
      backgroundSize: {
        "grid-40": "40px 40px",
        "grid-60": "60px 60px",
      },
      animation: {
        "pulse-slow": "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        shimmer: "shimmer 2s linear infinite",
        "fade-in": "fadeIn 0.5s ease-in-out",
        "slide-up": "slideUp 0.4s ease-out",
        "glow-pulse": "glowPulse 3s ease-in-out infinite",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        glowPulse: {
          "0%, 100%": { boxShadow: "0 0 20px rgba(245, 158, 11, 0.3)" },
          "50%": { boxShadow: "0 0 40px rgba(245, 158, 11, 0.6)" },
        },
      },
      boxShadow: {
        gold: "0 0 30px rgba(245, 158, 11, 0.4)",
        "gold-sm": "0 0 12px rgba(245, 158, 11, 0.3)",
        navy: "0 4px 24px rgba(5, 7, 26, 0.6)",
      },
    },
  },
  plugins: [],
};

export default config;
