export default {
  content: ["./index.html", "./apps/web/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: "#2855D9",
        navy: "#14243B",
        accent: "#EA6B32",
        canvas: "#F3F5F9",
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
