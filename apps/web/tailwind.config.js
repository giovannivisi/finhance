/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
    "../../packages/ui/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
        heading: ["var(--font-manrope)", "sans-serif"],
      },
      colors: {
        background: "var(--background)",
        surface: "var(--surface)",
        surfaceContainerLowest: "var(--surface-container-lowest)",
        surfaceContainerLow: "var(--surface-container-low)",
        surfaceContainer: "var(--surface-container)",
        surfaceContainerHigh: "var(--surface-container-high)",
        surfaceContainerHighest: "var(--surface-container-highest)",
        primary: "var(--primary)",
        primaryContainer: "var(--primary-container)",
        onPrimary: "var(--on-primary)",
        onSurface: "var(--on-surface)",
        onSurfaceVariant: "var(--on-surface-variant)",
        outlineVariant: "var(--outline-variant)",
        secondary: "var(--secondary)",
        tertiary: "var(--tertiary)",
      },
      borderRadius: {
        full: "9999px",
        xl: "3rem",
        lg: "2rem",
        md: "1.5rem",
        sm: "0.5rem",
      },
      boxShadow: {
        ambient: "0px 4px 40px -10px rgba(25, 28, 30, 0.08)",
        ambientDark: "0px 4px 60px -10px rgba(0, 0, 0, 0.4)",
      },
    },
  },
  plugins: [],
};
