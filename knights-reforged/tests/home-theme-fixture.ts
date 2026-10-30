// Synthetic isolated schema only. Never imports production operator commands.
import { randomUUID } from "node:crypto";
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
    // Ensure all lazy read projections settle before comparing unchanged GETs.
    for (const actor of [r.owner, r.rival, r.patron]) await r.me(actor);
    return r;
  } catch (e) {
    await r.close();
    throw e;
  }
}
