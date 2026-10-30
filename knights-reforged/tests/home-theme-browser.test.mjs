import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
test(
  "Shared realm theme preserves all screen content, routes, forms, artwork and data with original interactions",
  {
    skip:
      !process.env.TEST_DATABASE_URL ||
      !existsSync(process.env.BROWSER_EXECUTABLE ?? "/usr/bin/chromium"),
    timeout: 600000,
  },
  () => {
    const r = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/browser-home-theme.ts"],
      { encoding: "utf8", timeout: 590000, maxBuffer: 4 * 1024 * 1024 },
    );
    assert.equal(r.status, 0, r.stdout + r.stderr);
    console.log(r.stdout.trim());
  },
);
