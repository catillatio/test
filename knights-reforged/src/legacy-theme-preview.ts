import type { Config } from "./config.js";
// Historical stylesheet comparison only; normal startup always uses Iron & Brass.
export function legacyThemePreview(
  value: unknown,
  config: Pick<Config, "nodeEnv" | "origin">,
) {
  if (value === undefined) return false;
  if (
    value !== true ||
    config.nodeEnv !== "test" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(
      new URL(config.origin).hostname,
    )
  )
    throw Error(
      "The legacy comparison requires an isolated loopback test preview.",
    );
  return true;
}
