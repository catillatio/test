// Actual realm HTML, browser scripts and commands on a disposable schema only.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { chromium } from "playwright-core";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { uiThemeFixture } from "../tests/home-theme-fixture.js";
import { profileBusinessSnapshot } from "../tests/classic-profile-fixture.js";
import { testDatabaseUrl } from "../tests/helpers.js";
if (!testDatabaseUrl)
  throw Error("A local disposable *_test database is required.");
const initialCss = await readFile("public/realm-iron-brass.css");
const capture = process.argv.includes("--capture"),
  out = capture
    ? "docs/home-iron-brass/screenshots"
    : "test-results/home-iron-brass";
await mkdir(out, { recursive: true });
const fixture = await uiThemeFixture(),
  apps: Awaited<ReturnType<typeof createApp>>[] = [],
  errors: string[] = [],
  checks: unknown[] = [];
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  const origins: { themed: boolean; origin: string }[] = [];
  for (const themed of [false, true]) {
    const config = loadConfig({
        NODE_ENV: "test",
        APP_ORIGIN: "http://127.0.0.1:3000",
      }),
      app = await createApp({
        db: fixture.db,
        config,
        ...(themed ? { uiTheme: "iron-brass" as const } : {}),
      });
    apps.push(app);
    const origin = await app.listen({ host: "127.0.0.1", port: 0 });
    config.origin = origin;
    origins.push({ themed, origin });
  }
  browser = await chromium.launch({
    executablePath:
      process.env.BROWSER_EXECUTABLE ??
      (existsSync("/usr/bin/chromium")
        ? "/usr/bin/chromium"
        : "/usr/bin/google-chrome"),
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
    timezoneId: "America/New_York",
  });
  await context.route("**/*", (route) =>
    origins.some((e) => new URL(route.request().url()).origin === e.origin)
      ? route.continue()
      : route.abort(),
  );
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(15000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400 && new URL(r.url()).pathname.startsWith("/assets/"))
      errors.push("Missing local asset: " + new URL(r.url()).pathname);
  });
  async function visit(origin: string, path: string) {
    await context.clearCookies();
    await context.addCookies([
      {
        name: "kr_session",
        value: fixture.owner.cookie.split("=")[1]!,
        url: origin,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    assert.equal((await page.goto(origin + path))?.status(), 200, path);
    await page.waitForLoadState("networkidle");
    await page.evaluate(async () => {
      await document.fonts.ready;
      for (const img of document.querySelectorAll<HTMLImageElement>("img")) {
        img.loading = "eager";
        await img.decode();
      }
    });
  }
  // Compare all product content and command contracts, excluding volatile tokens.
  async function semantics() {
    return page.evaluate(() => ({
      headings: [...document.querySelectorAll("h1,h2,h3")].map(
        (e) => e.textContent,
      ),
      links: [...document.querySelectorAll<HTMLAnchorElement>("a")].map(
        (e) => ({
          href: (() => {
            const href = e.getAttribute("href");
            if (!href) return href;
            const u = new URL(href, location.origin);
            if (u.origin !== location.origin) return href;
            if (u.pathname === "/game/battle")
              u.searchParams.delete("rotation");
            return u.pathname + u.search + u.hash;
          })(),
          text: e.textContent?.replace(/\s+/g, " ").trim(),
          current: e.getAttribute("aria-current"),
        }),
      ),
      forms: [...document.querySelectorAll<HTMLFormElement>("form")]
        .filter((f) => !f.matches(".notification-read-form"))
        .map((f) => ({
          action: f.getAttribute("action"),
          method: f.method,
          inputs: [...f.querySelectorAll<HTMLInputElement>("input")]
            .filter((i) => !["csrf", "commandId"].includes(i.name))
            .map((i) => ({ name: i.name, value: i.value })),
          buttons: [...f.querySelectorAll<HTMLButtonElement>("button")].map(
            (b) => ({ text: b.textContent?.trim(), disabled: b.disabled }),
          ),
          selects: [...f.querySelectorAll("select")].map((s) => s.outerHTML),
          textareas: [...f.querySelectorAll("textarea")].map((s) => ({
            name: s.name,
            max: s.maxLength,
          })),
        })),
      modules: [
        ...document.querySelectorAll(
          "main>section,main>article,main>.compact-help,main>nav",
        ),
      ].map((e) => ({
        class: e.className,
        text: e.textContent?.replace(/\s+/g, " ").trim(),
      })),
      artwork: [...document.querySelectorAll(".catalog-art")].map((e) => ({
        id:
          e.getAttribute("data-expansion-item") ?? e.getAttribute("aria-label"),
        source:
          e.getAttribute("src") ??
          getComputedStyle(e).backgroundImage.replaceAll(location.origin, ""),
      })),
      icons: [...document.querySelectorAll("svg use")].map((e) =>
        e.getAttribute("href"),
      ),
      resourceValues: [
        ...document.querySelectorAll(
          "[data-wallet-gold],[data-level],[data-level-xp],[data-level-required],[data-resource-value],[data-resource-max]",
        ),
      ].map((e) => e.textContent),
    }));
  }
  const paths = [
    "/game/home",
    "/game/home?feed=battles",
    "/game/home?feed=comments",
    "/game/home?feed=broadcasts",
    "/game/home?calling=1#calling",
    "/game/quests",
    "/game/battle",
    "/game/battles/" + fixture.victory.battleId,
    "/game/battles/" + fixture.returned.battleId,
    "/game/armory",
    "/game/armory?category=armor",
    "/game/armory?category=spell",
    "/game/land",
    "/game/profile",
    "/game/players/" + fixture.rival.id,
    "/game/army?tab=army",
  ];
  const scenes = new Map([
    ["/game/home", "home"],
    ["/game/quests", "quests"],
    ["/game/battle", "battle"],
    ["/game/battles/" + fixture.victory.battleId, "victory"],
    ["/game/battles/" + fixture.returned.battleId, "defeat"],
    ["/game/armory", "weapons"],
    ["/game/armory?category=armor", "armor"],
    ["/game/armory?category=spell", "spells"],
    ["/game/land", "land"],
    ["/game/profile", "profile"],
    ["/game/players/" + fixture.rival.id, "public-profile"],
    ["/game/army?tab=army", "army"],
  ]);
  for (const path of paths) await visit(origins[0]!.origin, path);
  await visit(origins[1]!.origin, "/game/home");
  await page.evaluate(async () => {
    for (const name of ["icons", "resources", "panels", "iron"]) {
      const image = new Image();
      image.src = "/assets/art/home-ui-review-1/" + name + ".webp";
      await image.decode();
      if (image.naturalWidth < 200 || image.naturalHeight < 200)
        throw Error("Invalid Home UI atlas");
    }
  });
  const saved = await profileBusinessSnapshot(fixture.db);
  const widths = process.argv.includes("--quick")
    ? [390]
    : [320, 390, 430, 1024, 1280];
  for (const width of widths) {
    await page.setViewportSize({ width, height: width >= 700 ? 1000 : 844 });
    for (const path of paths) {
      let before: Awaited<ReturnType<typeof semantics>> | undefined;
      for (const { themed, origin } of origins) {
        await visit(origin, path);
        const contract = await semantics();
        if (!themed) before = contract;
        else {
          assert.deepEqual(
            contract,
            before,
            "Same content/modules/links/forms/icons/resources: " + path,
          );
          assert.equal(await page.locator("link[rel=stylesheet]").count(), 1);
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            "overflow " + width + " " + path,
          );
          for (const selector of [".royal-announcement", ".tutorial-resume"]) {
            const panel = page.locator(selector);
            if (await panel.count())
              assert.ok(
                await panel.evaluate((e) => {
                  const parent = e.getBoundingClientRect(),
                    p = getComputedStyle(e, "::before");
                  return (
                    getComputedStyle(e).position === "relative" &&
                    p.backgroundImage.includes("panels.webp") &&
                    parseFloat(p.left) >= 0 &&
                    parseFloat(p.width) < parent.width / 3
                  );
                }),
                "Decorative art must be positioned within its panel",
              );
          }
          const header = await page.locator(".topbar").evaluate((e) => {
            const brand = e
                .querySelector(".realm-brand")!
                .getBoundingClientRect(),
              account = e
                .querySelector(".account-menu")!
                .getBoundingClientRect(),
              bar = e.getBoundingClientRect();
            return {
              separated: brand.right <= account.left,
              contained: account.right <= bar.right,
            };
          });
          assert.ok(
            header.separated && header.contained,
            "header fits " + width,
          );
          const menu = await page.locator(".home-menu>a").evaluateAll((es) =>
            es.map((e) => {
              const r = e.getBoundingClientRect();
              return { w: r.width, h: r.height };
            }),
          );
          assert.equal(menu.length, path.startsWith("/game/home") ? 8 : 0);
          assert.ok(menu.every((b) => b.w >= 44 && b.h >= 44));
          const nav = await page.locator(".primary-nav>a").evaluateAll((es) =>
            es.map((e) => {
              const r = e.getBoundingClientRect();
              return { w: r.width, h: r.height };
            }),
          );
          assert.equal(nav.length, 5);
          assert.ok(nav.every((b) => b.w >= 44 && b.h >= 44));
          const resources = await page
            .locator(".realm-resources")
            .evaluate((e) => {
              const area = e.getBoundingClientRect();
              return [
                ...e.querySelectorAll(
                  ".gold-resource>.gold,.resource-reading strong,.resource-reading small",
                ),
              ].every((v) => {
                const r = v.getBoundingClientRect();
                return r.left >= area.left && r.right <= area.right;
              });
            });
          assert.ok(resources, "resources fit");
          if (path.includes("calling=1")) {
            const bonuses = page.locator(".calling-details");
            await bonuses.locator("summary").focus();
            await page.keyboard.press("Enter");
            assert.equal(await bonuses.getAttribute("open"), "");
            assert.equal(await bonuses.locator(".calling-row").count(), 3);
            assert.ok(await bonuses.locator(".calling-list").isVisible());
          }
          const artFrames = await page
            .locator(".equipment-art-frame>.catalog-art")
            .evaluateAll((es) =>
              es.map((e) => {
                const r = e.getBoundingClientRect();
                return {
                  width: r.width,
                  height: r.height,
                  fit: getComputedStyle(e).objectFit,
                };
              }),
            );
          assert.ok(
            artFrames.every(
              (a) => Math.abs(a.width - a.height) < 1 && a.fit === "contain",
            ),
            "Uncropped square approved equipment art: " + path,
          );
          const rows = await page
            .locator(".catalog-row")
            .evaluateAll((es) =>
              es.slice(0, 5).map((e) => e.getBoundingClientRect().height),
            );
          assert.ok(
            rows.every((h) => h <= 180),
            "Compact catalog " + path + " " + width + ": " + rows,
          );
          checks.push({
            width,
            path,
            contentAndCommandsUnchanged: true,
            headerFits: true,
            menu,
            nav,
          });
        }
        if (
          capture &&
          [390, 1280].includes(width) &&
          scenes.has(path) &&
          path !== "/game/home"
        ) {
          const scene = scenes.get(path)!;
          await page.screenshot({
            path:
              out +
              "/" +
              width +
              "-" +
              scene +
              "-" +
              (themed ? "after" : "before") +
              ".jpg",
            type: "jpeg",
            quality: 88,
            animations: "disabled",
          });
          if (scene === "victory" && themed && width === 390)
            await page
              .locator(".battle-rewards")
              .screenshot({
                path: out + "/390-victory-gold-detail-after.jpg",
                type: "jpeg",
                quality: 92,
                animations: "disabled",
              });
          if (scene === "profile") {
            const inventory = page.locator(".profile-inventory");
            await inventory.evaluate((e) =>
              e.scrollIntoView({ block: "start" }),
            );
            await page.screenshot({
              path:
                out +
                "/" +
                width +
                "-profile-inventory-" +
                (themed ? "after" : "before") +
                ".jpg",
              type: "jpeg",
              quality: 88,
              animations: "disabled",
            });
          }
          if (["victory", "defeat"].includes(scene))
            await page.screenshot({
              path:
                out +
                "/" +
                width +
                "-" +
                scene +
                "-" +
                (themed ? "after" : "before") +
                "-full.jpg",
              type: "jpeg",
              quality: 88,
              fullPage: true,
              animations: "disabled",
            });
          if (["weapons", "armor", "land"].includes(scene)) {
            const label =
              scene === "weapons"
                ? "Order Marshal Greatsword"
                : scene === "armor"
                  ? "Royal Garrison Plate"
                  : "Marcher Stronghold";
            const row = page
              .locator(".catalog-row")
              .filter({ hasText: label })
              .first();
            assert.equal(await row.count(), 1, label);
            await row.evaluate((e) => e.scrollIntoView({ block: "start" }));
            await page.screenshot({
              path:
                out +
                "/" +
                width +
                "-" +
                scene +
                "-regional-" +
                (themed ? "after" : "before") +
                ".jpg",
              type: "jpeg",
              quality: 88,
              animations: "disabled",
            });
          }
        }
        if (capture && width === 390 && themed && path === "/game/home")
          await page
            .locator(".resource-upper")
            .screenshot({
              path: out + "/390-balance-detail-after.jpg",
              type: "jpeg",
              quality: 92,
              animations: "disabled",
            });
        if (capture && [390, 1280].includes(width) && path === "/game/home")
          for (const full of [false, true])
            await page.screenshot({
              path:
                out +
                "/" +
                width +
                "-" +
                (themed ? "after" : "before") +
                (full ? "-full" : "") +
                ".jpg",
              type: "jpeg",
              quality: 88,
              fullPage: full,
              animations: "disabled",
            });
      }
    }
  }
  assert.deepEqual(
    await profileBusinessSnapshot(fixture.db),
    saved,
    "presentation does not modify business data",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  const themedOrigin = origins[1]!.origin;
  await visit(themedOrigin, "/game/home");
  for (const selector of [
    ".xp-resource",
    ".income-disclosure",
    ".resource-disclosure.health",
    ".resource-disclosure.mana",
    ".resource-disclosure.spirit",
  ]) {
    const disclosure = page.locator(selector);
    await disclosure.locator("summary").focus();
    await page.keyboard.press("Enter");
    assert.equal(await disclosure.getAttribute("open"), "");
    assert.ok(await disclosure.locator(".status-panel").isVisible());
    await page.keyboard.press("Enter");
    assert.equal(await disclosure.getAttribute("open"), null);
  }
  await visit(themedOrigin, "/game/profile");
  const preview = page.locator("[data-equipment-preview]").first();
  await preview.locator("summary").scrollIntoViewIfNeeded();
  await preview.locator("summary").tap();
  assert.equal(await preview.getAttribute("open"), "");
  const previewBounds = await preview
    .locator(".equipment-preview-content")
    .boundingBox();
  assert.ok(
    previewBounds &&
      previewBounds.x >= 0 &&
      previewBounds.x + previewBounds.width <= 390 &&
      previewBounds.y >= 0 &&
      previewBounds.y + previewBounds.height < 790,
  );
  if (capture)
    await page.screenshot({
      path: out + "/390-item-detail-after.jpg",
      type: "jpeg",
      quality: 88,
      animations: "disabled",
    });
  await preview.locator("[data-equipment-close]").tap();
  assert.equal(await preview.getAttribute("open"), null);
  const mouseContext = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    reducedMotion: "reduce",
  });
  await mouseContext.route("**/*", (route) =>
    origins.some((e) => new URL(route.request().url()).origin === e.origin)
      ? route.continue()
      : route.abort(),
  );
  await mouseContext.addCookies([
    {
      name: "kr_session",
      value: fixture.owner.cookie.split("=")[1]!,
      url: themedOrigin,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const mousePage = await mouseContext.newPage();
  await mousePage.goto(themedOrigin + "/game/profile");
  await mousePage.waitForLoadState("networkidle");
  const mousePreview = mousePage.locator("[data-equipment-preview]").first();
  await mousePreview.locator("summary").hover();
  await mousePage.waitForFunction(() =>
    document.querySelector("[data-equipment-preview]")?.hasAttribute("open"),
  );
  const summaryBox = await mousePreview.locator("summary").boundingBox(),
    panelBox = await mousePreview
      .locator(".equipment-preview-content")
      .boundingBox();
  assert.ok(summaryBox && panelBox);
  const travelX = Math.max(
    panelBox.x + 4,
    Math.min(
      summaryBox.x + summaryBox.width / 2,
      panelBox.x + panelBox.width - 4,
    ),
  );
  const travelY =
    panelBox.y < summaryBox.y
      ? panelBox.y + panelBox.height - 2
      : panelBox.y + 2;
  await mousePage.mouse.move(travelX, travelY, { steps: 20 });
  assert.equal(await mousePreview.getAttribute("open"), "");
  if (capture)
    await mousePage.screenshot({
      path: out + "/1280-item-detail-after.jpg",
      type: "jpeg",
      quality: 88,
      animations: "disabled",
    });
  await mousePreview.locator("[data-equipment-close]").click();
  assert.equal(await mousePreview.getAttribute("open"), null);
  await mouseContext.close();
  await visit(themedOrigin, "/game/armory");
  await page
    .locator(".catalog-row")
    .first()
    .getByRole("button", { name: /^Buy / })
    .click();
  await page.waitForLoadState("networkidle");
  assert.equal(await page.locator(".notice-error").count(), 0);
  await visit(themedOrigin, "/game/home?feed=broadcasts");
  const message = page.locator('form[action="/game/social/broadcast"]');
  assert.equal(await message.count(), 1);
  await message
    .locator("textarea")
    .fill("Synthetic preview: the realm stands ready.");
  await message.getByRole("button").click();
  await page.waitForLoadState("networkidle");
  assert.equal(await page.locator(".notice-error").count(), 0);
  assert.match(
    await page.locator(".activity-feed").innerText(),
    /Synthetic preview: the realm stands ready/,
  );
  // Original tutorial and market routes remain functional under the shared theme.
  await visit(themedOrigin, "/game/home");
  const resume = page.locator(".tutorial-resume button");
  assert.equal(await resume.count(), 1);
  await resume.click();
  await page.waitForLoadState("networkidle");
  assert.match(page.url(), /\/game\/tutorial/);
  assert.equal(await page.locator(".iron-brass-review").count(), 1);
  await visit(themedOrigin, "/game/armory");
  assert.equal(await page.locator(".iron-brass-review").count(), 1);
  assert.equal(await page.locator("link[rel=stylesheet]").count(), 1);
  await visit(origins[0]!.origin, "/game/home?uiTheme=iron-brass");
  assert.equal(await page.locator(".iron-brass-review").count(), 0);
  assert.deepEqual(errors, []);
  const css = await readFile("public/realm-iron-brass.css");
  assert.ok(
    css.equals(initialCss),
    "Stylesheet must stay immutable throughout browser verification",
  );
  const result = {
    passed: true,
    widths,
    views: checks.length,
    checks,
    contentAndCommandsPreserved: true,
    businessRowsPreserved: true,
    keyboardResourceDisclosures: true,
    touchAndMouseEquipmentPreviews: true,
    realPurchaseBroadcastAndTutorialCommands: true,
    otherScreensRemainFunctional: true,
    productionContacted: false,
    cssBytes: css.length,
    cssSha256: createHash("sha256").update(css).digest("hex"),
    errors,
  };
  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/home-theme.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  if (capture)
    await writeFile(
      "docs/home-iron-brass/verification.json",
      JSON.stringify(result, null, 2) + "\n",
    );
  console.log(
    "REALM_THEME: PASS — " +
      checks.length +
      " paired realm views, unchanged content/forms/data/art, keyboard resources, real purchase/broadcast/tutorial.",
  );
} finally {
  if (browser) await browser.close();
  for (const app of apps) await app.close();
  await fixture.close();
}
