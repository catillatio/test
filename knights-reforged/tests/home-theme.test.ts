import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { legacyThemePreview } from "../src/legacy-theme-preview.js";
test("Iron & Brass is the default; only the legacy comparison is test-only", () => {
  assert.equal(
    legacyThemePreview(undefined, {
      nodeEnv: "production",
      origin: "https://example.com",
    }),
    false,
  );
  assert.equal(
    legacyThemePreview(true, {
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
    assert.throws(() => legacyThemePreview(true, config));
  assert.throws(() =>
    legacyThemePreview("other", {
      nodeEnv: "test",
      origin: "http://localhost",
    }),
  );
});
test("one production realm stylesheet, internal legacy comparison, local artwork and accessible reduced-motion/forced-colors support", async () => {
  const css = await readFile("public/realm-iron-brass.css", "utf8"),
    layout = await readFile("views/layout.ejs", "utf8");
  assert.match(
    css,
    /@layer foundation, shell, resources, controls, artwork, home, auxiliary, markets, combat, profiles, responsive/,
  );
  assert.doesNotMatch(css, /@import|https?:\/\//);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /forced-colors/);
  assert.match(layout, /realm-iron-brass.css/);
  assert.match(layout, /profile-classic.css/);
  assert.match(layout, /ui-components.css/);
});

test("Home decorative sources and optimized atlases retain exact provenance within a bounded payload", async () => {
  const { createHash } = await import("node:crypto");
  const provenance = JSON.parse(
    await readFile("docs/home-iron-brass/ASSET_PROVENANCE.json", "utf8"),
  );
  assert.equal(provenance.generator, "image_gen");
  assert.equal(provenance.sources.length, 4);
  assert.equal(provenance.outputs.length, 4);
  for (const entry of [...provenance.sources, ...provenance.outputs]) {
    const data = await readFile(entry.file);
    assert.equal(data.length, entry.bytes);
    assert.equal(createHash("sha256").update(data).digest("hex"), entry.sha256);
  }
  assert.ok(
    provenance.outputs.reduce(
      (n: number, e: { bytes: number }) => n + e.bytes,
      0,
    ) < 250000,
    "Compact optimized UI atlas payload",
  );
  for (const entry of provenance.outputs) {
    const data = await readFile(entry.file);
    assert.equal(data.subarray(0, 4).toString(), "RIFF");
    assert.equal(data.subarray(8, 12).toString(), "WEBP");
  }
});


test("Approved Dark Medieval scenes are local, bounded and bound to their exact provenance", async () => {
  const { createHash } = await import("node:crypto");
  const source = JSON.parse(await readFile("public/art/dark-medieval-environments/provenance.json", "utf8"));
  assert.deepEqual(source.entries.map((entry: {id:string})=>entry.id), ["battle", "armory", "land", "profile"]);
  const css = await readFile("public/realm-iron-brass.css", "utf8");
  let total=0;
  for(const entry of source.entries){
    assert.match(entry.path, /^\/assets\/art\/dark-medieval-environments\/[a-z]+\.webp$/);
    const bytes=await readFile("public/"+entry.path.slice("/assets/".length));
    assert.equal(bytes.length,entry.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"),entry.sha256);
    assert.equal(bytes.subarray(8,12).toString(),"WEBP");
    assert.deepEqual(entry.dimensions,[1024,1536]);
    assert.ok(bytes.length<350000,"Each destination loads one bounded scene");
    assert.ok(css.includes(entry.path.slice("/assets/".length)));
    total+=bytes.length;
  }
  assert.ok(total<1000000,"All four scenic backgrounds stay below 1 MB combined");
  const scenes=[...css.matchAll(/--realm-scene:\s*url\("([^"]+)"\)/g)].map(match=>match[1]!);
  assert.equal(scenes.length,5);
  assert.ok(scenes.every(path=>path==="art/remaster-ui/castle-illustration.webp"||path.startsWith("art/dark-medieval-environments/")),"Property and equipment artwork never becomes a screen background");
  assert.doesNotMatch(css,/@font-face|@import|https?:\/\//);
});
