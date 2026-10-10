import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        monad: "#836EF9",
        yes: "#22c55e",
        no: "#ef4444",
      },
    },
  },
  plugins: [],
};
export default config;
