import test from "node:test";
import {createHash} from "node:crypto";
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


test("Property and equipment thumbnail bindings retain their approved identities", async () => {
  const css=await readFile("public/realm-iron-brass.css","utf8");
  const approved={
    "property-art-49-0":"properties-49/wyrmcrest-keep.webp",
    "property-art-49-1":"properties-49/gold-mine.webp",
    "property-art-51b-0":"properties-51b-fullbleed-2/dawnspire-cathedral.webp",
    "property-art-51b-1":"properties-51b-fullbleed-2/wyrmcrest-keep.webp",
    "property-art-51b-2":"properties-51b-fullbleed-2/astral-observatory.webp",
    "property-art-51b-3":"properties-51b-fullbleed-2/throne-of-ash.webp",
    "property-art-51b-4":"properties-51b-fullbleed-2/eclipse-citadel.webp",
    "property-art-51b-5":"properties-51b-fullbleed-2/tempest-port.webp",
    "equipment-art-51b-0":"equipment-51b-current-1/oathbound-greatsword.webp",
    "equipment-art-51b-1":"equipment-51b-current-1/crown-of-ash-blade.webp",
    "equipment-art-51b-2":"equipment-51b-current-1/eclipse-greatsword.webp",
    "equipment-art-51b-3":"equipment-51b-current-1/sovereigns-bastion.webp",
    "equipment-art-51b-4":"equipment-51b-current-1/eclipse-citadel-plate.webp",
  };
  for(const [className,asset] of Object.entries(approved)){
    const block=css.split("."+className+" {")[1]?.split("}")[0];
    assert.ok(block?.includes('url("art/'+asset+'")'),className+" keeps its exact approved thumbnail");
  }
});

test('three original class portraits retain verified full-bleed square source assets',async()=>{
 const directory='public/art/class-portraits-1/',provenance=JSON.parse(await readFile(directory+'provenance.json','utf8'));
 assert.deepEqual(Object.keys(provenance.files).sort(),['freeblade.png','spellward.png','warden.png']);
 const digests=[];
 for(const [file,digest] of Object.entries(provenance.files)){
  const bytes=await readFile(directory+file);assert.equal(bytes.subarray(1,4).toString(),'PNG');assert.equal(bytes.readUInt32BE(16),120);assert.equal(bytes.readUInt32BE(20),120);assert.equal(bytes[25],2,'Opaque full-bleed RGB');assert.ok(bytes.length<64000,'Small runtime portrait at 2x display density');const actual=createHash('sha256').update(bytes).digest('hex');assert.equal(actual,digest);digests.push(actual);
  const master=provenance.masters[file];assert.match(master.path,/^docs\/complete-rebuild-20261111\/portrait-masters\//);const original=await readFile(master.path);assert.equal(createHash('sha256').update(original).digest('hex'),master.sha256);assert.equal(original.readUInt32BE(16),original.readUInt32BE(20));assert.ok(original.readUInt32BE(16)>=1024);
 }
 assert.equal(new Set(digests).size,3);assert.match(provenance.status,/review/i);
});
