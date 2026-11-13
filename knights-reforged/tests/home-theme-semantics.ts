// Test-only, browser-evaluated comparison of actual page content and commands.
// Correctly acknowledged notification controls may be hidden in the first DOM
// and omitted by a fresh server render. Canonicalize only that representation.
export function homeThemeSemantics() {
  // Validate read-snapshot bindings even when their zero-unread controls will
  // be omitted from the comparison. Never normalize a malformed nonce away.
  for (const input of document.querySelectorAll<HTMLInputElement>('form input[name="batchId"]')) {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(input.value))
      throw new Error("Read snapshot nonce is malformed");
  }
  for (const tools of document.querySelectorAll<HTMLElement>('[data-personal-notification-tools][hidden]')) {
    const link = tools.querySelector<HTMLAnchorElement>('[data-personal-events-link]');
    const form = tools.querySelector<HTMLFormElement>('form');
    const buttons = [...tools.querySelectorAll<HTMLButtonElement>('button')];
    const badge = document.querySelector<HTMLElement>('[data-notification-badge="home"]');
    if (link?.textContent?.replace(/\s+/g, ' ').trim() !== 'View 0 unread personal events ›' ||
        link.getAttribute('href') !== '/game/notifications' ||
        !form?.hidden || form.method !== 'post' || form.getAttribute('action') !== '/game/notifications/read-all' ||
        buttons.length === 0 || buttons.some(button => !button.disabled) ||
        (badge && !badge.hidden))
      throw new Error('Hidden personal notification controls must be acknowledged, zero and disabled');
  }
  for (const form of document.querySelectorAll<HTMLFormElement>('.notification-read-form[hidden]')) {
    if (form.method !== 'post' || form.getAttribute('action') !== '/game/notifications/read')
      throw new Error('Hidden viewed-event form must preserve its command');
  }
  // Work on a detached clone. Snapshotting must not alter the real page,
  // suppress its notification client, or acknowledge any event itself.
  const snapshot = document.body.cloneNode(true) as HTMLElement;
  for (const element of snapshot.querySelectorAll('[data-personal-notification-tools][hidden],.notification-read-form[hidden]'))
    element.remove();
  return ({
      headings: [...document.querySelectorAll("h1,h2,h3")].map(
        (e) => e.textContent,
      ),
      links: [...snapshot.querySelectorAll<HTMLAnchorElement>("a")].map(
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
      forms: [...snapshot.querySelectorAll<HTMLFormElement>("form")]
        .filter((f) => !f.matches(".notification-read-form"))
        .map((f) => ({
          action: f.getAttribute("action"),
          method: f.method,
          inputs: [...f.querySelectorAll<HTMLInputElement>("input")]
            .filter((i) => !["csrf", "commandId"].includes(i.name))
            .map((i) => {if(i.name==='batchId'){if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(i.value))throw new Error('Read snapshot nonce is malformed');return {name:i.name,value:'OWNER_BOUND_READ_SNAPSHOT'};}return {name:i.name,value:i.value};}),
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
        ...snapshot.querySelectorAll(
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
  });
}
