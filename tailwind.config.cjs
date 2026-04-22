/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      dropShadow: {
        "text-heavy": "0 1px 3px rgba(0,0,0,0.9)",
        "text-soft":  "0 1px 2px rgba(0,0,0,0.9)",
      },
    },
  },
  plugins: [],
};