// Private cloud preview with synthetic local test data; never a production realm.
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { homeThemeFixture } from "../tests/home-theme-fixture.js";
import { testDatabaseUrl } from "../tests/helpers.js";
if (!testDatabaseUrl)
  throw Error("A designated local *_test TEST_DATABASE_URL is required.");
const fixture = await homeThemeFixture(),
  apps: Awaited<ReturnType<typeof createApp>>[] = [];
async function close() {
  for (const app of apps) await app.close();
  await fixture.close();
}
try {
  for (const [themed, port] of [
    [true, 4100],
    [false, 4101],
  ] as const) {
    const config = loadConfig({
        NODE_ENV: "test",
        APP_ORIGIN: "http://127.0.0.1:" + port,
      }),
      app = await createApp({
        db: fixture.db,
        config,
        ...(themed ? { homeTheme: "iron-brass" as const } : {}),
      });
    apps.push(app);
    console.log(
      (themed ? "Home review" : "Current UI") +
        ": " +
        (await app.listen({ host: "127.0.0.1", port })) +
        "/game/home",
    );
  }
  const account = (
    await fixture.db.query("SELECT username FROM accounts WHERE id=$1", [
      fixture.owner.accountId,
    ])
  ).rows[0]!;
  console.log(
    "Synthetic fixture sign-in only: " + account.username + " / AlphaTest!2026",
  );
  console.log(
    "Private cloud preview only. Ctrl+C removes this isolated fixture schema.",
  );
  let closing = false;
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => {
      if (!closing) {
        closing = true;
        void close();
      }
    });
} catch (error) {
  await close();
  throw error;
}
