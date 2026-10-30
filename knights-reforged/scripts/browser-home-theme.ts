// Actual realm HTML, browser scripts and commands on a disposable schema only.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { chromium } from "playwright-core";
import { createApp } from "../src/app.js";
import type { Player } from "../tests/helpers.js";
import { templateScreens } from "../src/http-contracts.js";
import { loadConfig } from "../src/config.js";
import { uiThemeFixture } from "../tests/home-theme-fixture.js";
import { profileBusinessSnapshot } from "../tests/classic-profile-fixture.js";
import { testDatabaseUrl } from "../tests/helpers.js";
if (!testDatabaseUrl)
  throw Error("A local disposable *_test database is required.");
const viewportModes = ["--quick", "--mobile", "--desktop"].filter((flag) =>
  process.argv.includes(flag),
);
assert.ok(viewportModes.length <= 1, "Viewport modes are mutually exclusive");
const viewportMode = viewportModes[0] ?? "all";
const widths =
  viewportMode === "--quick"
    ? [390]
    : viewportMode === "--mobile"
      ? [320, 390, 430]
      : viewportMode === "--desktop"
        ? [1024, 1280]
        : [320, 390, 430, 1024, 1280];
const initialCss = await readFile("public/realm-iron-brass.css");
const capture = process.argv.includes("--capture"),
  out = capture
    ? "docs/home-iron-brass/screenshots"
    : "test-results/home-iron-brass";
assert.ok(
  !capture || viewportMode === "all",
  "Documentation capture requires all five viewports",
);
await mkdir(out, { recursive: true });
const fixture = await uiThemeFixture(),
  apps: Awaited<ReturnType<typeof createApp>>[] = [],
  errors: string[] = [],
  checks: unknown[] = [],
  glowChecks: unknown[] = [],
  coverageChecks: unknown[] = [],
  productionSsrChecks: unknown[] = [],
  transitionChecks: unknown[] = [];
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
        ...(themed ? {} : { legacyTheme: true as const }),
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
  async function visit(
    origin: string,
    path: string,
    actor: Player | null = fixture.owner,
    expectedStatus = 200,
    settle = true,
  ) {
    await context.clearCookies();
    if (actor)
      await context.addCookies([
        {
          name: "kr_session",
          value: actor.cookie.split("=")[1]!,
          url: origin,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
    assert.equal(
      (await page.goto(origin + path))?.status(),
      expectedStatus,
      path,
    );
    await page.waitForLoadState(settle ? "networkidle" : "load");
    await page.evaluate(async () => {
      await document.fonts.ready;
      for (const img of document.querySelectorAll<HTMLImageElement>("img")) {
        img.loading = "eager";
        await img.decode();
      }
    });
  }
  async function checkGlowAlignment(width: number, scene: string) {
    // Compare the halo and rendered-text centers after positioning/transforms.
    const samples = await page.evaluate((varyBalance) => {
      const selectors = [
        ["balance", ".gold-resource > .gold > [data-wallet-gold]"],
        ["victory", ".victory-celebration .battle-outcome-heading h2"],
        ["reward", ".victory-celebration .battle-gold-reward dd"],
      ];
      return selectors.flatMap(([label, selector]) => {
        const element = document.querySelector<HTMLElement>(selector!);
        if (!element) return [];
        const original = element.textContent;
        const texts =
          label === "balance" && varyBalance
            ? [original, "7", "12,345", "109,161,431"]
            : [original];
        try {
          return texts.map((text, sample) => {
            element.textContent = text;
            const box = element.getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(element);
            const textBox = range.getBoundingClientRect();
            const glow = getComputedStyle(element, "::after");
            const w = parseFloat(glow.width);
            const h = parseFloat(glow.height);
            const x =
              glow.left === "auto"
                ? box.width - parseFloat(glow.right) - w
                : parseFloat(glow.left) *
                  (glow.left.endsWith("%") ? box.width / 100 : 1);
            const y =
              glow.top === "auto"
                ? box.height - parseFloat(glow.bottom) - h
                : parseFloat(glow.top) *
                  (glow.top.endsWith("%") ? box.height / 100 : 1);
            const transform = new DOMMatrix(
              glow.transform === "none" ? undefined : glow.transform,
            );
            return {
              label,
              sample,
              dx:
                box.left +
                x +
                w / 2 +
                transform.e -
                (textBox.left + textBox.width / 2),
              dy:
                box.top +
                y +
                h / 2 +
                transform.f -
                (textBox.top + textBox.height / 2),
            };
          });
        } finally {
          element.textContent = original;
        }
      });
    }, scene === "home");
    for (const sample of samples) {
      assert.ok(
        Math.abs(sample.dx) <= 2.5 && Math.abs(sample.dy) <= 2.5,
        `Glow centered behind rendered text: ${width}px ${scene} ${JSON.stringify(sample)}`,
      );
      glowChecks.push({ width, scene, ...sample });
    }
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
  type StoredReport = {
    attacker_id: string;
    defender_id: string;
    outcome: string;
    result: {
      loot: number;
      pvpRulesetId?: string;
      attackerDamage: number;
      defenderDamage: number;
      bountyClaim?: { reward: number };
    };
  };
  const storedReports = new Map<string, StoredReport>();
  for (const id of [fixture.victory.battleId, fixture.returned.battleId]) {
    const saved = (
      await fixture.db.query(
        "SELECT attacker_id,defender_id,outcome,result FROM battles WHERE id=$1",
        [id],
      )
    ).rows[0] as StoredReport;
    assert.ok(saved && saved.result.bountyClaim);
    storedReports.set("/game/battles/" + id, saved);
  }
  async function checkStoredReport(path: string) {
    const stored = storedReports.get(path);
    assert.ok(stored);
    const battle = stored.result;
    const attacking = stored.attacker_id === fixture.owner.id;
    const victory = (stored.outcome === "attacker_win") === attacking;
    const receivedGold = battle.pvpRulesetId ? attacking : victory;
    const amount =
      (receivedGold ? "+" : battle.loot ? "-" : "") +
      battle.loot.toLocaleString("en");
    assert.equal(
      await page.locator(".battle-gold-reward dd").innerText(),
      amount,
    );
    assert.equal(
      await page.locator(".battle-damage-dealt dd").innerText(),
      String(attacking ? battle.defenderDamage : battle.attackerDamage),
    );
    assert.equal(
      await page.locator(".battle-damage-received dd").innerText(),
      String(attacking ? battle.attackerDamage : battle.defenderDamage),
    );
    assert.equal(
      await page.locator(".bounty-escrow strong.gold").innerText(),
      battle.bountyClaim!.reward.toLocaleString("en") + " bounty gold",
    );
    assert.equal(
      await page
        .locator(
          ".battle-rewards > div > :not(dt):not(dd), .battle-damage > div > :not(dt):not(dd)",
        )
        .count(),
      0,
      "Description-list groups retain valid DT/DD structure",
    );
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
  type CoverageCase = {
    name: string;
    path: string;
    template: string;
    actor: Player | null;
    status?: number;
    mode?: "bounty-preview" | "login-error" | "register-error";
    selector?: string;
    screenshot?: boolean;
  };
  const c = fixture.coverage;
  const extraCases: CoverageCase[] = [
    {
      name: "login",
      path: "/login",
      template: "auth",
      actor: null,
      selector: ".auth-form",
      screenshot: true,
    },
    {
      name: "register",
      path: "/register",
      template: "auth",
      actor: null,
      selector: "#warrior-name",
      screenshot: true,
    },
    {
      name: "login-error",
      path: "/login",
      template: "auth",
      actor: null,
      status: 401,
      mode: "login-error",
      selector: ".notice-error",
    },
    {
      name: "register-error",
      path: "/register",
      template: "auth",
      actor: null,
      status: 422,
      mode: "register-error",
      selector: ".notice-error",
    },
    {
      name: "rules-public",
      path: "/rules",
      template: "rules",
      actor: null,
      selector: ".rules-page",
    },
    {
      name: "error-public",
      path: "/not-a-realm-route",
      template: "error",
      actor: null,
      status: 404,
      selector: ".error-page",
      screenshot: true,
    },
    {
      name: "rules",
      path: "/rules",
      template: "rules",
      actor: fixture.owner,
      selector: ".rules-page",
      screenshot: true,
    },
    {
      name: "error-signed-in",
      path: "/game/unknown-ui-fixture",
      template: "error",
      actor: fixture.owner,
      status: 404,
      selector: ".error-page",
    },
    {
      name: "error-invalid-battle",
      path: "/game/battles/not-a-uuid",
      template: "error",
      actor: fixture.owner,
      status: 404,
      selector: ".error-page",
    },
    {
      name: "settings",
      path: "/game/settings",
      template: "settings",
      actor: fixture.owner,
      selector: ".sound-settings",
      screenshot: true,
    },
    {
      name: "settings-enabled",
      path: "/game/settings",
      template: "settings",
      actor: c.graduate,
      selector: "#sound-enabled",
    },
    {
      name: "vault",
      path: "/game/vault",
      template: "vault",
      actor: fixture.owner,
      selector: "form[action='/game/vault/deposit']",
      screenshot: true,
    },
    {
      name: "vault-empty",
      path: "/game/vault",
      template: "vault",
      actor: c.newcomer,
      selector: "form[action='/game/vault/withdraw']",
    },
    {
      name: "achievements",
      path: "/game/achievements",
      template: "achievements",
      actor: fixture.owner,
      selector: ".achievement-row",
      screenshot: true,
    },
    {
      name: "achievements-locked",
      path: "/game/achievements",
      template: "achievements",
      actor: c.newcomer,
      selector: ".achievement-row.is-locked",
    },
    ...["victories", "kills", "kd", "bounties", "wanted", "land", "level"].map(
      (category) => ({
        name: "champions-" + category,
        path: "/game/champions?category=" + category,
        template: "champions",
        actor: fixture.owner,
        screenshot: category === "victories",
      }),
    ),
    {
      name: "champions-unranked",
      path: "/game/champions?category=kd",
      template: "champions",
      actor: c.newcomer,
    },
    {
      name: "tutorial-intro",
      path: "/game/tutorial",
      template: "tutorial",
      actor: c.newcomer,
      selector: ".guide-welcome",
      screenshot: true,
    },
    {
      name: "tutorial-skipped",
      path: "/game/tutorial",
      template: "tutorial",
      actor: fixture.owner,
      selector: ".guide-welcome",
    },
    ...c.students.map((actor, index) => ({
      name: "tutorial-step-" + (index + 1),
      path: "/game/tutorial",
      template: "tutorial",
      actor,
      selector: ".guide-lesson",
      screenshot: [0, 3, 7].includes(index),
    })),
    {
      name: "tutorial-complete",
      path: "/game/tutorial",
      template: "tutorial",
      actor: c.graduate,
      selector: ".tutorial-complete",
      screenshot: true,
    },
    {
      name: "tutorial-replay",
      path: "/game/tutorial",
      template: "tutorial",
      actor: c.replay,
      selector: ".guide-lesson",
    },
    {
      name: "home-newcomer",
      path: "/game/home",
      template: "home",
      actor: c.newcomer,
      selector: ".tutorial-invitation",
    },
    {
      name: "home-completed",
      path: "/game/home",
      template: "home",
      actor: c.graduate,
    },
    {
      name: "quest-requirements-missing",
      path: "/game/quests/" + c.missingQuestId + "/requirements",
      template: "quest-equipment",
      actor: fixture.owner,
      selector: ".requirements-shopping-list",
      screenshot: true,
    },
    {
      name: "quest-requirements-ready",
      path: "/game/quests/" + c.readyQuestId + "/requirements",
      template: "quest-equipment",
      actor: fixture.owner,
    },
    {
      name: "quest-requirements-locked",
      path: "/game/quests/" + c.lockedQuestId + "/requirements",
      template: "quest-equipment",
      actor: fixture.owner,
      selector: ".warning",
    },
    {
      name: "quest-requirements-poor",
      path: "/game/quests/" + c.missingQuestId + "/requirements",
      template: "quest-equipment",
      actor: c.poor,
      selector: ".warning",
    },
    {
      name: "quest-result",
      path: "/game/quests?command=" + c.questCommandId,
      template: "quests",
      actor: fixture.owner,
      selector: ".quest-result",
      screenshot: true,
    },
    {
      name: "quests-nearby",
      path: "/game/quests?area=nearby",
      template: "quests",
      actor: fixture.owner,
    },
    {
      name: "quests-locked",
      path: "/game/quests?area=nearby",
      template: "quests",
      actor: c.newcomer,
      selector: ".quest-card.is-locked",
    },
    {
      name: "bulk-equipment",
      path: "/game/armory?category=weapon&bulk=" + c.bulkItemId,
      template: "armory",
      actor: fixture.owner,
      selector: ".market-bulk-panel",
      screenshot: true,
    },
    {
      name: "bulk-land",
      path: "/game/land?bulk=" + c.bulkLandId,
      template: "land",
      actor: fixture.owner,
      selector: ".market-bulk-panel",
      screenshot: true,
    },
    {
      name: "purchase-equipment",
      path: "/game/purchases/" + c.equipmentPurchase,
      template: "purchase",
      actor: fixture.owner,
      selector: ".purchase-receipt",
      screenshot: true,
    },
    {
      name: "purchase-land",
      path: "/game/purchases/" + c.landPurchase,
      template: "purchase",
      actor: fixture.owner,
      selector: ".purchase-receipt",
    },
    {
      name: "purchase-historical",
      path: "/game/purchases/" + c.historicalPurchase,
      template: "purchase",
      actor: fixture.owner,
      selector: ".purchase-receipt",
    },
    {
      name: "army-recruit",
      path: "/game/army",
      template: "army",
      actor: fixture.owner,
      selector: "[data-copy-code]",
      screenshot: true,
    },
    {
      name: "army-dashboard",
      path: "/game/army?tab=dashboard",
      template: "army",
      actor: fixture.owner,
      selector: ".army-counts",
      screenshot: true,
    },
    ...["accepted", "incoming", "outgoing"].map((roster) => ({
      name: "army-" + roster,
      path: "/game/army?tab=army&roster=" + roster,
      template: "army",
      actor: fixture.owner,
    })),
    ...["skills", "comments", "battles"].map((tab) => ({
      name: "profile-" + tab,
      path: "/game/profile?tab=" + tab,
      template: "profile",
      actor: fixture.owner,
      screenshot: tab === "skills",
    })),
    ...["comments", "battles"].map((tab) => ({
      name: "public-profile-" + tab,
      path: "/game/players/" + fixture.rival.id + "?tab=" + tab,
      template: "profile",
      actor: fixture.owner,
    })),
    {
      name: "bounties",
      path: "/game/bounties",
      template: "bounties",
      actor: fixture.owner,
      selector: ".bounty-list",
      screenshot: true,
    },
    {
      name: "bounties-sponsor",
      path: "/game/bounties",
      template: "bounties",
      actor: fixture.patron,
    },
    {
      name: "bounties-target",
      path: "/game/bounties",
      template: "bounties",
      actor: fixture.rival,
    },
    {
      name: "bounties-ineligible",
      path: "/game/bounties",
      template: "bounties",
      actor: c.newcomer,
    },
    {
      name: "bounty-new",
      path: "/game/bounties/new?target=" + fixture.patron.id,
      template: "bounty-new",
      actor: fixture.owner,
      selector: ".bounty-new",
      screenshot: true,
    },
    {
      name: "bounty-self-blocked",
      path: "/game/bounties/new?target=" + fixture.owner.id,
      template: "bounty-new",
      actor: fixture.owner,
      selector: ".bounty-new .warning",
    },
    {
      name: "bounty-active-blocked",
      path: "/game/bounties/new?target=" + fixture.rival.id,
      template: "bounty-new",
      actor: c.poor,
      selector: ".bounty-new .warning",
    },
    {
      name: "bounty-confirm",
      path: "/game/bounties/new?target=" + fixture.patron.id,
      template: "bounty-confirm",
      actor: fixture.owner,
      mode: "bounty-preview",
      selector: ".bounty-confirm",
      screenshot: true,
    },
    {
      name: "bounty-confirm-poor",
      path: "/game/bounties/new?target=" + fixture.patron.id,
      template: "bounty-confirm",
      actor: c.poor,
      mode: "bounty-preview",
      selector: ".bounty-confirm button[disabled]",
    },
  ];
  async function coverageVisit(
    origin: string,
    entry: CoverageCase,
    width: number,
    settle = false,
  ) {
    await visit(
      origin,
      entry.path,
      entry.actor,
      entry.mode ? 200 : (entry.status ?? 200),
      settle,
    );
    if (entry.mode === "bounty-preview") {
      await page.locator('input[name="amount"]').fill("1000");
      const [response] = await Promise.all([
        page.waitForNavigation(),
        page
          .locator(
            'form[action="/game/bounties/preview"] button[type="submit"]',
          )
          .click(),
      ]);
      assert.equal(response?.status(), 200, entry.name);
    } else if (
      entry.mode === "login-error" ||
      entry.mode === "register-error"
    ) {
      await page.locator('input[name="username"]').fill("ui_missing_" + width);
      await page
        .locator('input[name="password"]')
        .fill("NotARealPassword!2026");
      if (entry.mode === "register-error") {
        await page.locator('input[name="name"]').fill("X");
        await page.locator(".auth-form").evaluate((form) => {
          (form as HTMLFormElement).noValidate = true;
        });
      }
      const [response] = await Promise.all([
        page.waitForNavigation(),
        page.locator('.auth-form button[type="submit"]').click(),
      ]);
      assert.equal(response?.status(), entry.status, entry.name);
    }
    await page.waitForLoadState("load");
    await page.evaluate(async () => {
      await document.fonts.ready;
      for (const img of document.querySelectorAll<HTMLImageElement>("img")) {
        img.loading = "eager";
        await img.decode();
      }
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
    const quoteInput = page.locator(
      'form[data-bounty-quote] input[name="amount"]',
    );
    if ((await quoteInput.count()) && !(await quoteInput.isDisabled()))
      await page.waitForFunction(() => {
        const status = document.querySelector(
          "[data-bounty-quote-status]",
        )?.textContent;
        return !!status && !status.startsWith("Requesting");
      });
    if (entry.selector)
      assert.ok(
        await page.locator(entry.selector).count(),
        entry.name + " must render its actual view/state",
      );
  }
  for (const path of paths) await visit(origins[0]!.origin, path);
  for (const entry of extraCases.filter((entry) => !entry.mode))
    await coverageVisit(origins[0]!.origin, entry, 390);
  // Region selection is an existing persisted UI preference. Keep the original
  // default-route scene at All Regions; the secondary case covers Nearby.
  await visit(
    origins[0]!.origin,
    "/game/quests?area=all",
    fixture.owner,
    200,
    false,
  );

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
  for (const width of widths) {
    await page.setViewportSize({ width, height: width >= 700 ? 1000 : 844 });
    await visit(
      origins[0]!.origin,
      "/game/quests?area=all",
      fixture.owner,
      200,
      false,
    );
    for (const path of paths) {
      let before: Awaited<ReturnType<typeof semantics>> | undefined;
      for (const { themed, origin } of origins) {
        await visit(origin, path);
        const contract = await semantics();
        if (path === "/game/quests")
          assert.equal(
            await page.locator(".region-picker summary strong").innerText(),
            "All Regions",
          );
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
            const profile = e
              .querySelector(".profile-link")
              ?.getBoundingClientRect();
            return {
              separated: brand.right <= account.left,
              contained: account.right <= bar.right,
              compact: bar.height <= (innerWidth >= 700 ? 30.5 : 28.5),
              profileFits:
                !profile ||
                (profile.height >= 24 &&
                  profile.width >= 24 &&
                  profile.top >= bar.top &&
                  profile.bottom <= bar.bottom),
            };
          });
          assert.ok(
            header.separated &&
              header.contained &&
              header.compact &&
              header.profileFits,
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
          if (path === "/game/home" || scenes.get(path) === "victory")
            await checkGlowAlignment(width, scenes.get(path)!);
          if (["victory", "defeat"].includes(scenes.get(path) ?? ""))
            await checkStoredReport(path);
          if (scenes.get(path) === "victory") {
            const repeat = await page
              .locator(".follow-up-combat .attack-again")
              .evaluate((button) => {
                const action = button.getBoundingClientRect();
                const nav = document
                  .querySelector(".primary-nav")!
                  .getBoundingClientRect();
                return {
                  top: action.top,
                  bottom: action.bottom,
                  height: action.height,
                  navTop: nav.top,
                };
              });
            assert.ok(
              repeat.top >= 0 &&
                repeat.height >= 44 &&
                repeat.bottom <= repeat.navTop,
              "Victory repeat action visible above fixed navigation: " +
                width +
                " " +
                JSON.stringify(repeat),
            );
          }
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
          [320, 390, 430, 1280].includes(width) &&
          scenes.has(path) &&
          path !== "/game/home"
        ) {
          const scene = scenes.get(path)!;
          if (
            themed ||
            !["victory", "defeat"].includes(scene) ||
            !existsSync(
              "docs/home-iron-brass/beta-before/" +
                width +
                "-" +
                scene +
                "-after.jpg",
            )
          )
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
            await page.locator(".battle-rewards").screenshot({
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
          if (
            ["victory", "defeat"].includes(scene) &&
            (themed ||
              !existsSync(
                "docs/home-iron-brass/beta-before/" +
                  width +
                  "-" +
                  scene +
                  "-after-full.jpg",
              ))
          )
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
          await page.locator(".resource-upper").screenshot({
            path: out + "/390-balance-detail-after.jpg",
            type: "jpeg",
            quality: 92,
            animations: "disabled",
          });
        if (
          capture &&
          [320, 390, 430, 1280].includes(width) &&
          path === "/game/home"
        )
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
  for (const width of widths) {
    await page.setViewportSize({ width, height: width >= 700 ? 1000 : 844 });
    for (const entry of extraCases) {
      let baseline: Awaited<ReturnType<typeof semantics>> | undefined;
      for (const { themed, origin } of origins) {
        await coverageVisit(origin, entry, width);
        const contract = await semantics();
        if (!themed) baseline = contract;
        else {
          assert.deepEqual(
            contract,
            baseline,
            "Preserved secondary state: " + entry.name + " " + width,
          );
          assert.equal(await page.locator("link[rel=stylesheet]").count(), 1);
          assert.equal(await page.locator("body.iron-brass").count(), 1);
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            "secondary overflow " + entry.name + " " + width,
          );
          assert.equal(
            await page.locator(".primary-nav>a").count(),
            entry.actor ? 5 : 0,
          );
          const header = await page.locator(".topbar").evaluate((element) => {
            const brand = element
                .querySelector(".realm-brand")!
                .getBoundingClientRect(),
              account = element
                .querySelector(".account-menu")!
                .getBoundingClientRect(),
              bar = element.getBoundingClientRect();
            const profile = element
              .querySelector(".profile-link")
              ?.getBoundingClientRect();
            return (
              brand.right <= account.left &&
              account.right <= bar.right &&
              bar.height <= (innerWidth >= 700 ? 30.5 : 28.5) &&
              (!profile ||
                (profile.width >= 24 &&
                  profile.height >= 24 &&
                  profile.top >= bar.top &&
                  profile.bottom <= bar.bottom))
            );
          });
          assert.ok(header, "secondary header fit " + entry.name + " " + width);
          coverageChecks.push({
            width,
            name: entry.name,
            path:
              entry.mode === "bounty-preview"
                ? "POST /game/bounties/preview"
                : entry.path,
            template: entry.template,
            status: entry.status ?? 200,
            signedIn: !!entry.actor,
            contentAndCommandsUnchanged: true,
          });
          if (entry.name.startsWith("tutorial-step-"))
            assert.match(
              await page.locator(".guide-progress-label").innerText(),
              new RegExp("Step " + entry.name.split("-").at(-1) + " of 8"),
            );
          if (entry.name === "tutorial-step-4")
            assert.equal(await page.locator(".guide-calling").count(), 1);
          if (entry.name === "bounty-active-blocked")
            assert.match(
              await page.locator(".bounty-new .warning").first().innerText(),
              /already.*active bounty/i,
            );
          if (entry.name === "settings-enabled")
            assert.equal(
              await page.locator("#sound-enabled").inputValue(),
              "1",
            );
          if (entry.name === "bulk-equipment" || entry.name === "bulk-land") {
            const tabs = page.locator("[data-bulk-mode-tab]");
            assert.equal(await tabs.count(), 2);
            await tabs.last().focus();
            await page.keyboard.press("Enter");
            assert.equal(
              await tabs.last().getAttribute("aria-selected"),
              "true",
            );
            await page.keyboard.press("Home");
            assert.equal(
              await tabs.first().getAttribute("aria-selected"),
              "true",
            );
          }
        }
        if (
          capture &&
          [320, 390, 430, 1280].includes(width) &&
          entry.screenshot
        )
          await page.screenshot({
            path:
              out +
              "/" +
              width +
              "-" +
              entry.name +
              "-" +
              (themed ? "after" : "before") +
              ".jpg",
            type: "jpeg",
            quality: 86,
            animations: "disabled",
          });
      }
    }
  }
  // Real production configuration, same disposable DB, injection only: no
  // public network, insecure production origin override, or release workflow.
  const productionConfig = loadConfig({
    NODE_ENV: "production",
    APP_ORIGIN: "https://realm.example.test",
  });
  const productionApp = await createApp({
    db: fixture.db,
    config: productionConfig,
  });
  apps.push(productionApp);
  for (const entry of extraCases.filter((entry) => !entry.mode)) {
    const response = await productionApp.inject({
      method: "GET",
      url: entry.path,
      headers: entry.actor ? { cookie: entry.actor.cookie } : {},
    });
    assert.equal(
      response.statusCode,
      entry.status ?? 200,
      "production-mode SSR " + entry.name,
    );
    assert.match(response.body, /realm-iron-brass.css/);
    assert.doesNotMatch(response.body, /assets\/styles.css/);
    productionSsrChecks.push({
      name: entry.name,
      template: entry.template,
      status: response.statusCode,
    });
  }
  for (const entry of extraCases.filter((entry) => !!entry.mode)) {
    let cookie: string;
    let csrf: string;
    if (entry.actor) {
      cookie = entry.actor.cookie;
      csrf = entry.actor.csrf;
    } else {
      const form = await productionApp.inject({
        method: "GET",
        url: entry.path,
      });
      assert.equal(form.statusCode, 200);
      const cookies = form.headers["set-cookie"];
      const session = (
        Array.isArray(cookies) ? cookies.map(String) : [String(cookies)]
      ).find((value) => value.startsWith("kr_session="));
      assert.ok(session);
      cookie = session.split(";")[0]!;
      csrf = /name="csrf" value="([a-f0-9]{64})"/.exec(form.body)![1]!;
    }
    const response = await productionApp.inject({
      method: "POST",
      url:
        entry.mode === "bounty-preview" ? "/game/bounties/preview" : entry.path,
      headers: { cookie, origin: productionConfig.origin },
      payload:
        entry.mode === "bounty-preview"
          ? { csrf, targetCharacterId: fixture.patron.id, amount: 1000 }
          : {
              csrf,
              username: "ui_" + randomUUID().replaceAll("-", "").slice(0, 20),
              name: "X",
              password: "NotARealPassword!2026",
            },
    });
    assert.equal(
      response.statusCode,
      entry.mode === "bounty-preview" ? 200 : entry.status,
      "production-mode POST SSR " + entry.name,
    );
    assert.match(response.body, /realm-iron-brass.css/);
    assert.doesNotMatch(response.body, /assets\/styles.css/);
    productionSsrChecks.push({
      name: entry.name,
      template: entry.template,
      method: "POST",
      status: response.statusCode,
    });
  }
  await productionApp.inject({
    method: "GET",
    url: "/game/quests?area=all",
    headers: { cookie: fixture.owner.cookie },
  });
  for (const route of paths) {
    const response = await productionApp.inject({
      method: "GET",
      url: route,
      headers: { cookie: fixture.owner.cookie },
    });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /realm-iron-brass.css/);
    productionSsrChecks.push({ name: route, status: 200 });
  }
  const renderedTemplates = new Set([
    "home",
    "quests",
    "battle",
    "report",
    "armory",
    "land",
    "profile",
    "army",
    ...extraCases.map((entry) => entry.template),
  ]);
  assert.deepEqual(
    [...renderedTemplates].sort(),
    templateScreens.filter((screen) => screen !== "trade-confirm").sort(),
    "Every live render template is browser-covered; historical trade-confirm has no current render route",
  );
  const redirects = [
    { name: "root-public", url: "/", actor: null, location: "/login" },
    {
      name: "root-signed-in",
      url: "/",
      actor: fixture.owner,
      location: "/game/home",
    },
    {
      name: "login-signed-in",
      url: "/login",
      actor: fixture.owner,
      location: "/game/home",
    },
    {
      name: "register-signed-in",
      url: "/register",
      actor: fixture.owner,
      location: "/game/home",
    },
    {
      name: "private-signed-out",
      url: "/game/profile",
      actor: null,
      location: "/login?returnTo=%2Fgame%2Fhome",
    },
    {
      name: "self-public-profile",
      url: "/game/players/" + fixture.owner.id,
      actor: fixture.owner,
      location: "/game/profile?tab=player",
    },
  ];
  for (const entry of redirects) {
    const response = await productionApp.inject({
      method: "GET",
      url: entry.url,
      headers: entry.actor ? { cookie: entry.actor.cookie } : {},
    });
    assert.equal(response.statusCode, 302, entry.name);
    assert.equal(response.headers.location, entry.location, entry.name);
    transitionChecks.push({
      name: entry.name,
      status: 302,
      destination: entry.location,
    });
  }
  const jsonRoutes = [
    ["/healthz", "status"],
    ["/api/v1/me", "state"],
    ["/api/v1/opponents", "opponents"],
    ["/api/v1/champions", "entries"],
    ["/api/v1/achievements", "achievements"],
    ["/api/v1/notifications", "home"],
    ["/api/v1/bounties", "active"],
    [
      "/api/v1/bounties/quote?targetCharacterId=" +
        fixture.patron.id +
        "&amount=1",
      "quote",
    ],
    ["/api/v1/feed", "entries"],
    ["/api/v1/land", "land"],
    ["/api/v1/battles/" + fixture.victory.battleId, "battle"],
    ["/api/v1/players/" + fixture.rival.id, "character"],
    ["/api/v1/players/" + fixture.rival.id + "/combat", "combatTarget"],
    ["/api/v1/players/" + fixture.rival.id + "/tales", "entries"],
  ];
  for (const [url, key] of jsonRoutes) {
    const response = await productionApp.inject({
      method: "GET",
      url: url!,
      headers: { cookie: fixture.owner.cookie },
    });
    assert.equal(response.statusCode, 200, url);
    assert.match(String(response.headers["content-type"]), /application\/json/);
    assert.ok(key! in response.json(), url);
    transitionChecks.push({ name: url, type: "JSON-only", status: 200 });
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
  assert.equal(await page.locator(".iron-brass").count(), 1);
  await visit(themedOrigin, "/game/armory");
  assert.equal(await page.locator(".iron-brass").count(), 1);
  assert.equal(await page.locator("link[rel=stylesheet]").count(), 1);
  await visit(origins[0]!.origin, "/game/home?uiTheme=iron-brass");
  assert.equal(await page.locator(".iron-brass").count(), 0);
  await context.clearCookies();
  await page.goto(themedOrigin + "/register");
  const browserUsername = "ui_" + randomUUID().replaceAll("-", "").slice(0, 18);
  await page.locator("#username").fill(browserUsername);
  await page.locator("#warrior-name").fill("Aster New Banner");
  await page.locator("#password").fill("AlphaTest!2026");
  await Promise.all([
    page.waitForNavigation(),
    page.locator('.auth-form button[type="submit"]').click(),
  ]);
  assert.match(page.url(), /\/game\/tutorial/);
  assert.equal(await page.locator(".guide-welcome").count(), 1);
  await Promise.all([
    page.waitForNavigation(),
    page
      .locator("form")
      .filter({ has: page.locator('input[name="action"][value="start"]') })
      .getByRole("button")
      .click(),
  ]);
  for (let step = 1; step < 4; step++) {
    const next = page.getByRole("button", { name: /Next Lesson/i });
    if (!(await next.isVisible()))
      await page.locator(".guide-options>summary").click();
    await Promise.all([page.waitForNavigation(), next.click()]);
  }
  assert.match(
    await page.locator(".guide-progress-label").innerText(),
    /Step 4 of 8/,
  );
  await page.locator(".guide-calling>summary").click();
  await page.locator("#tutorial-calling-choice").selectOption("Spellward");
  await Promise.all([
    page.waitForNavigation(),
    page
      .locator(".guide-calling")
      .getByRole("button", { name: "Choose Calling", exact: true })
      .click(),
  ]);
  await page.goto(themedOrigin + "/game/settings");
  await Promise.all([
    page.waitForNavigation(),
    page.locator('form[action="/logout"]').getByRole("button").click(),
  ]);
  assert.match(page.url(), /\/login/);
  await page.locator("#username").fill(browserUsername);
  await page.locator("#password").fill("AlphaTest!2026");
  await Promise.all([
    page.waitForNavigation(),
    page.locator('.auth-form button[type="submit"]').click(),
  ]);
  assert.match(page.url(), /\/game\/home/);
  assert.equal(await page.locator("body.iron-brass").count(), 1);
  transitionChecks.push({
    name: "native-registration-tutorial-calling-signout-login",
    passed: true,
  });
  // Native finance controls retain the authoritative transfer and ledger path.
  await visit(themedOrigin, "/game/vault");
  const purseBefore = (
    await (await page.request.get(themedOrigin + "/api/v1/me")).json()
  ).state;
  await page.locator("#vault-deposit").fill("27");
  await Promise.all([
    page.waitForNavigation(),
    page
      .locator('form[action="/game/vault/deposit"]')
      .getByRole("button")
      .click(),
  ]);
  const deposited = (
    await (await page.request.get(themedOrigin + "/api/v1/me")).json()
  ).state;
  assert.equal(deposited.gold, purseBefore.gold - 27);
  assert.equal(deposited.bankedGold, purseBefore.bankedGold + 27);
  await page.locator("#vault-withdraw").fill("27");
  await Promise.all([
    page.waitForNavigation(),
    page
      .locator('form[action="/game/vault/withdraw"]')
      .getByRole("button")
      .click(),
  ]);
  const withdrawn = (
    await (await page.request.get(themedOrigin + "/api/v1/me")).json()
  ).state;
  assert.equal(withdrawn.gold, purseBefore.gold);
  assert.equal(withdrawn.bankedGold, purseBefore.bankedGold);
  transitionChecks.push({
    name: "native-vault-deposit-withdraw",
    amount: 27,
    balancesConserved: true,
  });
  // Exercise the existing preference autosave, then reload for stored values.
  await visit(themedOrigin, "/game/settings");
  assert.equal(
    await page.locator("[data-sound-settings]").getAttribute("data-autosave"),
    "ready",
  );
  await page.locator("#sound-enabled").selectOption("1");
  await page.locator("#sound-volume").evaluate((element) => {
    if (!(element instanceof HTMLInputElement))
      throw Error("Missing volume input");
    element.value = "37";
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForFunction(
    () =>
      document.querySelector("[data-sound-status]")?.textContent ===
      "Sound settings saved.",
  );
  const savedSound = (
    await (await page.request.get(themedOrigin + "/api/v1/me")).json()
  ).sound;
  assert.deepEqual(
    { enabled: savedSound.enabled, volume: savedSound.volume },
    { enabled: true, volume: 37 },
  );
  await page.reload();
  assert.equal(await page.locator("#sound-enabled").inputValue(), "1");
  assert.equal(await page.locator("#sound-volume").inputValue(), "37");
  transitionChecks.push({
    name: "native-sound-autosave",
    savedAndReloaded: true,
  });
  // Native no-script acknowledgment fallback: deliver one personal event after
  // auto-read tests and exercise the existing HTML form itself.
  await fixture.ok(fixture.patron, "/api/v1/comments", {
    profileId: fixture.owner.id,
    body: "Synthetic personal event for native acknowledgment.",
  });
  const noScript = await browser.newContext({
    viewport: { width: 390, height: 844 },
    javaScriptEnabled: false,
  });
  await noScript.route("**/*", (route) =>
    origins.some((e) => new URL(route.request().url()).origin === e.origin)
      ? route.continue()
      : route.abort(),
  );
  await noScript.addCookies([
    {
      name: "kr_session",
      value: fixture.owner.cookie.split("=")[1] ?? "",
      url: themedOrigin,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const noScriptPage = await noScript.newPage();
  await noScriptPage.goto(themedOrigin + "/game/profile?tab=comments");
  const readForm = noScriptPage.locator(
    'form[action="/game/notifications/read"]',
  );
  assert.equal(await readForm.count(), 1);
  assert.ok(await readForm.isVisible());
  const attentionBefore = await (
    await noScriptPage.request.get(themedOrigin + "/api/v1/notifications")
  ).json();
  assert.ok(attentionBefore.home > 0);
  await Promise.all([
    noScriptPage.waitForNavigation(),
    readForm.getByRole("button", { name: "Mark shown events read" }).click(),
  ]);
  const attentionAfter = await (
    await noScriptPage.request.get(themedOrigin + "/api/v1/notifications")
  ).json();
  assert.ok(attentionAfter.home < attentionBefore.home);
  assert.equal(attentionAfter.army, attentionBefore.army);
  await noScript.close();
  transitionChecks.push({
    name: "native-notification-read-fallback",
    personalEventsAcknowledged: true,
    armyInvitationCountPreserved: true,
  });

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
    totalPairedViews: checks.length + coverageChecks.length,
    routeStateCases: paths.length + extraCases.length,
    checks,
    secondaryViews: coverageChecks.length,
    secondaryCoverage: coverageChecks,
    productionSsr: productionSsrChecks,
    transitionsAndJson: transitionChecks,
    declaredTemplates: templateScreens,
    liveTemplatesCovered: 21,
    historicalTemplateOnly: ["trade-confirm"],
    sceneInventory: [
      ...new Set([
        ...scenes.values(),
        ...extraCases
          .filter((entry) => entry.screenshot)
          .map((entry) => entry.name),
      ]),
    ],
    glowAlignment: glowChecks,
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
    viewportMode === "--mobile"
      ? "test-results/home-theme-mobile.json"
      : viewportMode === "--desktop"
        ? "test-results/home-theme-desktop.json"
        : "test-results/home-theme.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  if (capture)
    await writeFile(
      "docs/home-iron-brass/verification.json",
      JSON.stringify(result, null, 2) + "\n",
    );
  if (capture)
    await writeFile(
      "docs/home-iron-brass/SCENE_INVENTORY.json",
      JSON.stringify(
        {
          viewports: [320, 390, 430, 1280],
          scenes: result.sceneInventory,
          cssSha256: result.cssSha256,
          visualBeforeArchive: "beta-before/PROVENANCE.json",
          secondaryBefore:
            "current-template internal legacy stylesheet baseline",
          reportsBefore:
            "390/1280: actual prior beta archive; 320/430: current-template classic baseline",
        },
        null,
        2,
      ) + "\n",
    );
  console.log(
    "REALM_THEME: PASS — " +
      (checks.length + coverageChecks.length) +
      " paired realm views, unchanged content/forms/data/art, keyboard resources, real purchase/broadcast/tutorial.",
  );
} finally {
  if (browser) await browser.close();
  for (const app of apps) await app.close();
  await fixture.close();
}
