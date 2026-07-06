import { defineConfig } from "vite";
import { fresh } from "@fresh/plugin-vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Baked into the bundles at build time so /health can report which commit is
  // actually running — `deno task deploy` compares it against .deploy-commit.
  define: {
    __DEPLOY_COMMIT__: JSON.stringify(Deno.env.get("DEPLOY_COMMIT") ?? "dev"),
  },
  plugins: [tailwindcss(), fresh()],
  server: {
    port: 8000,
    host: "0.0.0.0",
  },
});
