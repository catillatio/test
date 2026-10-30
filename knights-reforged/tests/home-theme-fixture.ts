// Synthetic isolated schema only. Never imports production operator commands.
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import type { Player } from "./helpers.js";
import { classicProfileFixture } from "./classic-profile-fixture.js";
import { syntheticCutover } from "./level100-e2b-fixture.js";
import {
  equipmentPresentation,
  presentationDigest,
} from "../src/equipment-presentation.js";
import { transaction } from "../src/db.js";
import { purchaseItems } from "../src/inventory.js";
import { buyEstate } from "../src/estate.js";
import { expandedContent } from "../src/expansion-content.js";
export async function uiThemeFixture() {
  const r = await classicProfileFixture();
  try {
    for (const actor of [r.owner, r.rival, r.patron])
      await r.db.query("UPDATE characters SET attained_level=75 WHERE id=$1", [
        actor.id,
      ]);
    await r.prepare(r.owner, 100000000);
    await syntheticCutover(r.db, false);
    const activation = (
      await r.db.query("SELECT id FROM realm_expansion_state")
    ).rows[0]!.id;
    const selected = [
      "Order Marshal Greatsword",
      "Highland Claymore",
      "Sunscar Officer’s Saber",
      "Royal Garrison Plate",
      "Sunscar Marshal Harness",
      "Northern Thane’s Warplate",
      "Royal War Invocation",
      "Sunscar Bannerfire",
      "Northern Ironwall Covenant",
    ];
    const ids = equipmentPresentation.entries
      .filter((e) => selected.includes(e.name.replaceAll("'", "’")))
      .map((e) => e.id);
    await transaction(r.db, async (sql) => {
      await sql.query(
        "INSERT INTO realm_expansion_events(id,kind,manifest_id,approval_digest,details) VALUES($1,'activate','level100-expansion-1',$2,$3)",
        [
          activation,
          "a".repeat(64),
          {
            equipmentPresentation: {
              id: equipmentPresentation.id,
              digest: presentationDigest(),
              reviewed: true,
            },
          },
        ],
      );
      await purchaseItems(
        sql,
        r.owner.id,
        75,
        Object.fromEntries(ids.map((id) => [id, 2])),
        randomUUID(),
        r.now(),
      );
      for (const p of expandedContent.properties
        .filter((p) => p.level > 50 && p.level <= 75)
        .slice(0, 3))
        await buyEstate(sql, r.owner.id, 75, p.id, 1, randomUUID(), r.now());
    });
    for (const actor of [r.owner, r.rival, r.patron]) {
      const state = await r.me(actor);
      if (state.health < state.maxHealth)
        await r.ok(actor, "/api/v1/health/restorations");
    }
    await r.ok(r.owner, "/api/v1/army/invitations", {
      targetCharacterId: r.rival.id,
    });
    await r.ok(r.rival, "/api/v1/army/acceptances", {
      targetCharacterId: r.owner.id,
    });
    // Additional UI states are created with real, existing account/guide/market
    // commands in this disposable schema. No production operator path is used.
    async function fresh(name: string): Promise<Player> {
      const form = await r.app.inject({ method: "GET", url: "/register" });
      const cookieOf = (response: { headers: Record<string, unknown> }) => {
        const value = response.headers["set-cookie"];
        const line = (
          Array.isArray(value) ? value.map(String) : [String(value)]
        ).find((value) => value.startsWith("kr_session="));
        assert.ok(line);
        return line.split(";")[0]!;
      };
      const csrf = /name="csrf" value="([a-f0-9]{64})"/.exec(form.body)![1]!;
      const created = await r.app.inject({
        method: "POST",
        url: "/register",
        headers: { cookie: cookieOf(form), origin: "http://localhost:3000" },
        payload: {
          csrf,
          username: "ui_" + randomUUID().replaceAll("-", "").slice(0, 20),
          name,
          password: "AlphaTest!2026",
        },
      });
      assert.equal(created.statusCode, 303, created.body);
      const cookie = cookieOf(created),
        me = await r.app.inject({
          method: "GET",
          url: "/api/v1/me",
          headers: { cookie },
        });
      assert.equal(me.statusCode, 200, me.body);
      const state = me.json().state;
      const accountId = (
        await r.db.query("SELECT account_id FROM characters WHERE id=$1", [
          state.id,
        ])
      ).rows[0]!.account_id as string;
      return { id: state.id, accountId, cookie, csrf: me.json().csrfToken };
    }
    const newcomer = await fresh("Elowen Firstlight");
    const students: Player[] = [];
    for (let step = 1; step <= 8; step++) {
      const student = await fresh("Guide Learner " + step);
      await r.ok(student, "/api/v1/tutorial", { action: "start" });
      for (let n = 1; n < step; n++)
        await r.ok(student, "/api/v1/tutorial", { action: "next" });
      students.push(student);
    }
    async function completed(name: string) {
      const actor = await fresh(name);
      await r.ok(actor, "/api/v1/tutorial", { action: "start" });
      for (let n = 1; n < 8; n++)
        await r.ok(actor, "/api/v1/tutorial", { action: "next" });
      await r.ok(actor, "/api/v1/tutorial", { action: "finish" });
      return actor;
    }
    const graduate = await completed("Seren the Prepared"),
      replay = await completed("Rowan Returning");
    await r.ok(replay, "/api/v1/tutorial", { action: "replay" });
    const poor = await r.player("Mira Empty Purse", 5);
    await r.ok(poor, "/api/v1/vault/deposits", {
      amount: (await r.me(poor)).gold,
    });
    await r.ok(r.owner, "/api/v1/vault/deposits", { amount: 120 });
    await r.ok(graduate, "/api/v1/settings/sound", {
      enabled: "1",
      volume: 37,
    });
    await r.ok(newcomer, "/api/v1/army/invitations", {
      targetCharacterId: r.owner.id,
    });
    await r.ok(r.owner, "/api/v1/army/invitations", {
      targetCharacterId: students[0]!.id,
    });
    const activeBounty = await r.ok(r.patron, "/api/v1/bounties/placements", {
      targetCharacterId: r.rival.id,
      amount: 1200,
    });
    const ownerState = await r.me(r.owner);
    const readyQuest = ownerState.quests.find((quest) => quest.ready)!;
    assert.ok(readyQuest);
    const questResult = await r.ok(
      r.owner,
      "/api/v1/quests/" + readyQuest.id + "/runs",
    );
    const missingQuest = ownerState.quests.find(
      (quest) =>
        quest.level <= ownerState.level && Object.keys(quest.missing).length,
    )!;
    const lockedQuest = ownerState.quests.find(
      (quest) => quest.level > ownerState.level,
    )!;
    assert.ok(missingQuest && lockedQuest);
    const purchases = (
      await r.db.query(
        "SELECT command_id,kind FROM command_receipts WHERE account_id=$1 AND kind IN ('buy','land_buy') ORDER BY created_at,command_id",
        [r.owner.accountId],
      )
    ).rows;
    const equipmentPurchase = purchases.find((row) => row.kind === "buy")!
      .command_id as string;
    const landPurchase = purchases.find((row) => row.kind === "land_buy")!
      .command_id as string;
    // Explicit unavailable-item legacy receipt shape; a synthetic saved record,
    // not a new purchase, financial entry, or reconstruction of production history.
    const historicalPurchase = randomUUID();
    await r.db.query(
      "INSERT INTO command_receipts(account_id,command_id,kind,intent_hash,result) VALUES($1,$2,'buy',$3,$4)",
      [
        r.owner.accountId,
        historicalPurchase,
        "0".repeat(64),
        {
          commandId: historicalPurchase,
          kind: "buy",
          message: "This historical purchase is recorded.",
          data: { itemId: "retired-ui-fixture", category: "weapon" },
        },
      ],
    );
    const bulkItem = ownerState.inventory.find(
      (item) =>
        item.quantity > 0 &&
        item.category === "weapon" &&
        item.acquisition !== "quest-exclusive",
    )!;
    const bulkLand = ownerState.land.properties.find(
      (property) => property.owned > 0,
    )!;
    assert.ok(bulkItem && bulkLand);
    const coverage = {
      newcomer,
      students,
      graduate,
      replay,
      poor,
      activeBounty,
      readyQuestId: readyQuest.id,
      missingQuestId: missingQuest.id,
      lockedQuestId: lockedQuest.id,
      questCommandId: questResult.commandId as string,
      equipmentPurchase,
      landPurchase,
      historicalPurchase,
      bulkItemId: bulkItem.id,
      bulkLandId: bulkLand.id,
    };
    // Settle all lazy read projections before preservation comparisons.
    for (const actor of [
      r.owner,
      r.rival,
      r.patron,
      newcomer,
      ...students,
      graduate,
      replay,
      poor,
    ])
      await r.me(actor);
    return { ...r, coverage };
  } catch (e) {
    await r.close();
    throw e;
  }
}
