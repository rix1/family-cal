import { defineConfig } from "vite";
import { fresh } from "@fresh/plugin-vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), fresh()],
  server: {
    port: 8000,
    host: "0.0.0.0",
  },
});
