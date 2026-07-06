/**
 * Post-deploy check, run last by `deno task deploy`: the restarted server must
 * report the commit that was just built (baked into the bundle via vite
 * `define`, see vite.config.ts). Catches the stale-bundle desync where the
 * service entrypoint and the build output directory drift apart — a plain
 * "ok" health check passes even when an old bundle is still serving.
 */

const commit = (await Deno.readTextFile(".deploy-commit")).trim();
const want = `ok ${commit}`;

let got = "";
for (let attempt = 0; attempt < 10; attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  try {
    const response = await fetch("http://localhost:8000/health");
    got = (await response.text()).trim();
    if (response.ok) break;
  } catch {
    // Server still restarting — retry.
  }
}

if (got !== want) {
  console.error(
    `Deploy desync: /health reports "${got}", expected "${want}".\n` +
      "The server is likely serving a stale bundle — check that the launchd " +
      "plist entrypoint matches the deploy outDir (_prod/server.js).",
  );
  Deno.exit(1);
}
console.log(`Deployed ${commit}`);
