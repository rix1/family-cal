import { createLogger, defineConfig } from "vite";
import { fresh } from "@fresh/plugin-vite";
import tailwindcss from "@tailwindcss/vite";

// sanitize-html (pulled in by @deno/gfm, server-only) ships sourcemaps whose
// TypeScript sources aren't published to npm, so Vite's SSR transform warns
// "points to missing source files" for its whole dep tree on every dev start.
// Harmless but noisy; ssr.external can't help because the Fresh plugin resolves
// the specifier before Vite's externality check, so filter the message instead.
const logger = createLogger();
const warn = logger.warn.bind(logger);
const warnOnce = logger.warnOnce.bind(logger);
logger.warn = (msg, options) => {
  if (msg.includes("points to missing source files")) return;
  warn(msg, options);
};
logger.warnOnce = (msg, options) => {
  if (msg.includes("points to missing source files")) return;
  warnOnce(msg, options);
};

export default defineConfig({
  customLogger: logger,
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
