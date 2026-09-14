/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx,js}",
    // Streamdown's default markdown renderers (headings/lists/bold/etc.) are
    // plain Tailwind utility classes baked into its bundled JS, not covered
    // by its own styles.css — scan it and its plugins so those classes
    // actually get generated instead of silently doing nothing.
    "./node_modules/streamdown/**/*.js",
    "./node_modules/@streamdown/**/*.js",
  ],
  theme: {
    extend: {
      colors: {
        "gray-750": "#2d3748",
        "gray-950": "#030712",
        // Minimal shadcn/ui semantic tokens (dark values only — this app is
        // dark-mode only), needed by the hand-copied Badge/CodeBlock primitives
        // under src/ui/ and src/ai-elements/.
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
