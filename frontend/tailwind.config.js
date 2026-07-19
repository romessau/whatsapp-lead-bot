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
      boxShadow: {
        panel: "0 12px 40px rgba(15, 23, 42, 0.05)",
        chat: "0 30px 90px rgba(15, 23, 42, 0.16)",
      },
    },
  },
  plugins: [],
};
