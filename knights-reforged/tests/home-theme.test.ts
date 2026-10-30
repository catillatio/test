import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { homeThemePreview } from "../src/home-theme-preview.js";
test("Home presentation is internal/local-test-only and off in production", () => {
  assert.equal(
    homeThemePreview(undefined, {
      nodeEnv: "production",
      origin: "https://example.com",
    }),
    false,
  );
  assert.equal(
    homeThemePreview("iron-brass", {
      nodeEnv: "test",
      origin: "http://127.0.0.1:4100",
    }),
    true,
  );
  for (const config of [
    { nodeEnv: "production", origin: "http://localhost" },
    { nodeEnv: "development", origin: "http://localhost" },
    { nodeEnv: "test", origin: "https://example.com" },
  ])
    assert.throws(() => homeThemePreview("iron-brass", config));
  assert.throws(() =>
    homeThemePreview("other", { nodeEnv: "test", origin: "http://localhost" }),
  );
});
test("one Home stylesheet, existing production fallback, local artwork and accessible reduced-motion/forced-colors support", async () => {
  const css = await readFile("public/home-iron-brass.css", "utf8"),
    layout = await readFile("views/layout.ejs", "utf8");
  assert.match(
    css,
    /@layer foundation, shell, resources, controls, home, responsive/,
  );
  assert.doesNotMatch(css, /@import|https?:\/\//);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /forced-colors/);
  assert.match(layout, /home-iron-brass.css/);
  assert.match(layout, /profile-classic.css/);
  assert.match(layout, /ui-components.css/);
});
