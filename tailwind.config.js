/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        rose: {
          500: '#f43f5e',
          400: '#fb7185',
          300: '#fda4af',
        }
      }
    },
  },
  plugins: [],
}