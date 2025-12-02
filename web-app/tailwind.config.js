/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'severn-blue': '#1E40AF',
        'severn-green': '#059669',
      },
    },
  },
  plugins: [],
}
