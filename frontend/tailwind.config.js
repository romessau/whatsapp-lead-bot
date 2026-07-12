/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        wa: {
          green: "#075E54",
          light: "#25D366",
          bubble: "#DCF8C6",
          bg: "#ECE5DD",
        },
      },
    },
  },
  plugins: [],
};
