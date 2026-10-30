import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
test(
  "Home theme preserves all modules, routes, forms and data, with keyboard disclosures and working original commands",
  {
    skip:
      !process.env.TEST_DATABASE_URL ||
      !existsSync(process.env.BROWSER_EXECUTABLE ?? "/usr/bin/chromium"),
    timeout: 300000,
  },
  () => {
    const r = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/browser-home-theme.ts"],
      { encoding: "utf8", timeout: 290000, maxBuffer: 4 * 1024 * 1024 },
    );
    assert.equal(r.status, 0, r.stdout + r.stderr);
    console.log(r.stdout.trim());
  },
);
