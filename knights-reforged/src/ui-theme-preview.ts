import type { Config } from "./config.js";
// Review composition only: never selected by an HTTP input or production startup.
export function uiThemePreview(
  value: unknown,
  config: Pick<Config, "nodeEnv" | "origin">,
) {
  if (value === undefined) return false;
  if (
    value !== "iron-brass" ||
    config.nodeEnv !== "test" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(
      new URL(config.origin).hostname,
    )
  )
    throw Error(
      "Realm theme review requires an isolated loopback test preview.",
    );
  return true;
}
