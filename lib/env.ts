/**
 * The single DEV|PROD switch. It decides which database the process opens and
 * whether session cookies may skip `Secure` (DEV runs on plain http).
 *
 * PROD comes from `.env` (this working tree is production); the `dev` task
 * overrides it with ENVIRONMENT=DEV in the task definition — real environment
 * variables win over `--env-file` values, so the override is reliable.
 */
export type Environment = "DEV" | "PROD";

export function environment(): Environment {
  const value = Deno.env.get("ENVIRONMENT");
  if (value === "DEV" || value === "PROD") return value;
  throw new Error(
    `ENVIRONMENT must be DEV or PROD (got ${JSON.stringify(value ?? null)}). ` +
      "The dev/start tasks set it; for scripts run e.g. `ENVIRONMENT=DEV deno task seed`.",
  );
}

export function isDev(): boolean {
  return Deno.env.get("ENVIRONMENT") === "DEV";
}
