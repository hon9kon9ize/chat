/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,js}"],
  theme: {
    extend: {
      colors: {
        "gray-750": "#2d3748",
        "gray-950": "#030712",
      },
    },
  },
  plugins: [],
}
