// Single-item buttons and bulk controls share the same recovery protocol.
// A pending intent is immutable; retrying always reuses its command ID.
const actor = document.querySelector('[data-character-id]')?.dataset.characterId;
const trades = new Map();
for (const form of document.querySelectorAll('form')) {
  const control = form.querySelector('[data-quantity-control]');
  if (!form.hasAttribute('data-market-form') && !control) continue;
  const definition = form.dataset.definitionId || control?.dataset.definitionId;
  const button = form.querySelector('[type="submit"]');
  if (!actor || !definition || !button) continue;
  const key = 'kingdom-market-pending:' + actor + ':' + form.getAttribute('action') + ':' + definition;
  let trade = trades.get(key);
  if (!trade) {
    trade = { pending: null, busy: false, navigating: false, forms: [] };
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (saved?.id && saved.fields?.commandId === saved.id) trade.pending = saved;
    } catch {}
    trades.set(key, trade);
  }
  const message = document.createElement('p');
  message.className = 'market-feedback field-hint'; message.setAttribute('role', 'status'); form.append(message);
  const retry = document.createElement('button');
  retry.type = 'button'; retry.className = 'button button-outline market-retry';
  retry.textContent = 'Check / Retry Safely'; retry.hidden = !trade.pending; form.append(retry);
  const entry = { form, control, button, retry, message, initiallyDisabled: button.disabled };
  trade.forms.push(entry);
  function paint() {
    for (const item of trade.forms) {
      const metadata = item.control?.dataset || item.form.dataset;
      const max = Number(metadata.max);
      const quantity = Number(item.form.querySelector('[name="quantity"]')?.value || 1);
      item.button.disabled = trade.busy || trade.navigating || !!trade.pending ||
        (Number.isFinite(max) ? max < quantity : item.initiallyDisabled);
      item.retry.hidden = !trade.pending;
      item.retry.disabled = trade.busy || trade.navigating;
      if (trade.busy) item.form.setAttribute('aria-busy', 'true');
      else { item.form.removeAttribute('aria-busy'); delete item.form.dataset.submitting; }
    }
  }
  function feedback(text, error = false) {
    message.textContent = text;
    if (error) document.dispatchEvent(new CustomEvent('kingdom-action-error'));
  }
  function signIn() {
    feedback('Your session ended. Sign in, then return here; your selection is saved.');
    const link = document.createElement('a'); link.className = 'text-link';
    link.href = '/login?returnTo=' + encodeURIComponent(location.pathname + location.search + location.hash);
    link.textContent = 'Sign in and return'; message.append(' ', link);
  }
  function forget() { trade.pending = null; try { sessionStorage.removeItem(key); } catch {} }
  async function run(retrying = false) {
    if (trade.busy || trade.navigating) return;
    if (trade.pending && !retrying) { feedback('Check the earlier request before trading again.'); return; }
    const intent = Object.fromEntries(new FormData(form)); delete intent.csrf;
    trade.busy = true; paint();
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
    try {
      feedback('Checking your trade…');
      const response = await fetch('/api/v1/me', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
      if (response.status === 401) { signIn(); return; }
      if (!response.ok) throw new Error('State unavailable');
      const current = await response.json();
      if (current.state?.id !== actor) { feedback('A different character is signed in. Open this marketplace again before continuing.', true); return; }
      if (!trade.pending) {
        trade.pending = { id: intent.commandId, fields: intent };
        try { sessionStorage.setItem(key, JSON.stringify(trade.pending)); } catch {}
      }
      document.dispatchEvent(new CustomEvent('realm-state', { detail: current.state }));
      const fields = new URLSearchParams({ ...trade.pending.fields, csrf: current.csrfToken });
      feedback('Completing your trade…');
      const resultResponse = await fetch(form.getAttribute('action'), {
        method: 'POST', credentials: 'same-origin', headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
        body: fields, signal: controller.signal,
      });
      if (resultResponse.status === 401) { signIn(); return; }
      if (resultResponse.status >= 500) throw new Error('Completion unknown');
      const result = await resultResponse.json();
      if (!resultResponse.ok) {
        forget(); form.querySelector('[name="commandId"]').value = crypto.randomUUID();
        feedback(result.error?.message || 'Review the current price and try again.', true); return;
      }
      feedback(result.message); forget(); trade.navigating = true;
      const land = result.kind === 'land_buy' || result.kind === 'land_sell';
      const savedCategory = result.data?.category ?? result.state?.inventory?.find(item => item.id === result.data?.itemId)?.category ?? new URL(location.href).searchParams.get('category');
      const category = ['weapon','armor','spell'].includes(savedCategory) ? savedCategory : 'weapon';
      const definitionId = land ? result.data?.propertyId : result.data?.itemId;
      const anchor = (result.kind === 'buy' || result.kind === 'land_buy') && typeof definitionId === 'string' && /^[a-z0-9-]+$/.test(definitionId) ?
        '#' + (land ? 'property-' : 'item-') + definitionId : '';
      const destination = (land ? '/game/land?command=' : '/game/armory?category=' + category + '&command=') + result.commandId + anchor;
      location.assign(destination);
    } catch {
      feedback(trade.pending ? 'Connection interrupted. Your trade may have completed. Check / Retry Safely cannot charge twice.' :
        'Connection interrupted. Your menu and selection are still here.', true);
    } finally { clearTimeout(timeout); trade.busy = false; paint(); }
  }
  if (trade.pending) feedback('An earlier trade needs confirmation. Check it safely before trading again.');
  form.addEventListener('submit', event => { event.preventDefault(); event.stopImmediatePropagation(); void run(); }, true);
  retry.addEventListener('click', () => void run(true));
  document.addEventListener('realm-state', event => {
    if (control || !event.detail) { paint(); return; }
    const state = event.detail, selling = form.dataset.tradeMode === 'sell';
    const item = state.inventory?.find(item => item.id === definition);
    const property = state.land?.properties.find(item => item.id === definition);
    const max = form.dataset.purchaseType === 'land' ? selling ? property?.maxSell : property?.unlocked ? property.maxAffordable : 0 :
      selling ? item?.maxSell : state.level >= Number(form.dataset.requiredLevel) ? Math.min(100, 1000 - (item?.quantity || 0), Math.floor(state.gold / Number(form.dataset.unitPrice))) : 0;
    form.dataset.max = String(max || 0);
    const refund = form.querySelector('[data-single-return]');
    if (refund) refund.textContent = Number((form.dataset.purchaseType === 'land' ? property?.saleRefundSteps : item?.resaleSteps)?.[0] || 0).toLocaleString('en');
    paint();
  });
  // Reapply the shared lock after quantity eligibility handlers have finished.
  document.addEventListener('realm-state', () => queueMicrotask(paint));
  form.addEventListener('click', () => queueMicrotask(paint));
  window.addEventListener('pageshow', () => { trade.navigating = false; paint(); });
  paint();
}
