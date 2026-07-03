import { metrics } from "@opentelemetry/api";

// Deno's built-in OTel (--unstable-otel) picks this up; without it the API
// no-ops, so importing this module in dev costs nothing.
const startedAt = Date.now();

/** `deno task deploy` writes `git describe` here right before restarting us. */
function deployedCommit(): string {
  try {
    return Deno.readTextFileSync(".deploy-commit").trim() || "unknown";
  } catch {
    return "unknown";
  }
}

const meter = metrics.getMeter("family-cal");

meter
  .createObservableGauge("process.uptime", {
    unit: "s",
    description: "Seconds since the server process started (= since last deploy).",
  })
  .addCallback((result) => {
    result.observe((Date.now() - startedAt) / 1000);
  });

const commit = deployedCommit();
meter
  .createObservableGauge("deploy.info", {
    description: "Constant 1; the deployed commit rides along as the 'commit' attribute.",
  })
  .addCallback((result) => {
    result.observe(1, { commit });
  });
