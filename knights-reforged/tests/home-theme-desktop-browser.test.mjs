import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
test(
  "Desktop beta theme preserves all live views, states, commands, artwork and data",
  {
    skip:
      !process.env.TEST_DATABASE_URL ||
      !existsSync(process.env.BROWSER_EXECUTABLE ?? "/usr/bin/chromium"),
    timeout: 600000,
  },
  () => {
    const r = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/browser-home-theme.ts", "--desktop"],
      { encoding: "utf8", timeout: 590000, maxBuffer: 4 * 1024 * 1024 },
    );
    assert.equal(r.status, 0, r.stdout + r.stderr);
    console.log(r.stdout.trim());
  },
);
