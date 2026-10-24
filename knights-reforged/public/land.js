// Display server state and an estimated countdown only. The browser never
// credits gold, computes a reward, or decides whether a purchase is valid.
const root = document.querySelector('[data-land-screen]');
if (root) {
  let serverTime = Date.parse(root.dataset.serverTime);
  let syncedAt = performance.now();
  let nextPayment = root.dataset.nextPayment || null;
  let inFlight = false;
  let retryAt = 0;
  let version = Number(document.querySelector('[data-realm-state]')?.dataset.stateVersion || 0);
  const countdown = root.querySelector('[data-land-countdown]');
  const renderCountdown = value => {
    if (countdown) countdown.textContent = value;
    setText('[data-land-summary-countdown]', nextPayment ? 'Next ' + value : 'No Land yet');
  };
  const status = root.querySelector('[data-land-status]');
  const number = value => Number(value).toLocaleString('en');
  const setText = (selector, value) => { const element = root.querySelector(selector); if (element) element.textContent = value; };
  const showTime = (element, value) => {
    if (!element) return;
    element.setAttribute('datetime', value || '');
    element.textContent = value ? new Date(value).toLocaleString() : 'Buy a property to start earning.';
  };

  async function refresh() {
    if (inFlight || document.hidden || performance.now() < retryAt) return;
    inFlight = true;
    retryAt = performance.now() + 5000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('/api/v1/land', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Income refresh unavailable');
      const state = await response.json();
      if (!state.land || !Number.isFinite(Date.parse(state.serverTime))) throw new Error('Invalid server state');
      if (state.state && state.state.stateVersion < version) return;
      if (state.state) version = state.state.stateVersion;
      serverTime = Date.parse(state.serverTime);
      syncedAt = performance.now();
      nextPayment = state.land.nextPaymentAt;
      setText('[data-land-gross]', number(state.land.hourlyIncome));
      setText('[data-land-upkeep]', number(state.land.hourlyUpkeep));
      setText('[data-equipment-upkeep]', number(state.economy?.equipmentUpkeep ?? state.land.equipmentUpkeep ?? 0));
      setText('[data-next-property-payment]', number(state.land.nextPropertyPaymentGold ?? 0));
      setText('[data-partial-payment]', state.land.partialNextPayment ? 'Includes a prorated first period.' : '');
      setText('[data-land-net-detail]', number(state.economy?.netHourlyIncome ?? state.land.netHourlyIncome));
      setText('[data-land-net]', number(state.economy?.netHourlyIncome ?? state.land.netHourlyIncome));
      const net = state.economy?.netHourlyIncome ?? state.land.netHourlyIncome;
      setText('[data-land-summary-net]', (net > 0 ? '+' : '') + number(net));
      document.querySelectorAll('[data-wallet-gold]').forEach(element => { element.textContent = number(state.gold); });
      showTime(root.querySelector('[data-land-payment-time]'), nextPayment);
      const pending = root.querySelector('[data-land-pending]');
      if (pending) pending.hidden = state.land.pendingGold === '0';
      setText('[data-land-pending-gold]', BigInt(state.land.pendingGold).toLocaleString('en'));
      for (const property of state.land.properties) {
        const card = [...root.querySelectorAll('[data-land-property]')].find(element => element.dataset.landProperty === property.id);
        if (!card) continue;
        card.querySelector('[data-land-owned]').textContent = String(property.owned);
        const price = card.querySelector('[data-land-unit-price]');
        if (price) price.textContent = property.price === null ? 'Quote unavailable' : number(property.price);
        if (property.priceSteps) card.dataset.priceSteps = JSON.stringify(property.priceSteps);
        card.querySelector('[data-land-buy-hint]').textContent = property.remaining === 0 ? 'Ownership limit reached.' :
          property.unlocked === false ? 'Unlocks at level ' + property.level + '.' :
          property.maxAffordable === 0 ? (property.quoteUnavailable || 'Earn more gold to buy this property.') : 'Joins the shared hourly cycle; first partial period is prorated.';
      }
      for (const holding of state.land.holdings) {
        const time = [...root.querySelectorAll('[data-holding-payment]')].find(element => element.dataset.holdingPayment === holding.id);
        showTime(time, holding.nextPaymentAt);
      }
      status.textContent = 'Income is up to date. Completed offline hours are included.';
      if (state.state && typeof document.dispatchEvent === 'function') document.dispatchEvent(new CustomEvent('realm-state', { detail: state.state }));
    } catch {
      retryAt = performance.now() + 15000;
      status.textContent = 'Connection interrupted. Your income stays on the server; reconnecting automatically.';
    } finally {
      clearTimeout(timeout);
      inFlight = false;
    }
    tick();
  }

  function tick() {
    if (!countdown) return;
    if (!nextPayment) { renderCountdown('No property owned'); return; }
    const now = serverTime + performance.now() - syncedAt;
    const seconds = Math.max(0, Math.ceil((Date.parse(nextPayment) - now) / 1000));
    if (!Number.isFinite(seconds)) { renderCountdown('Checking income…'); void refresh(); return; }
    renderCountdown(seconds === 0 ? 'Payment due — checking…' :
      [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map(value => String(value).padStart(2, '0')).join(':'));
    if (!seconds) void refresh();
  }
  showTime(root.querySelector('[data-land-payment-time]'), nextPayment);
  tick();
  setInterval(tick, 1000);
  setInterval(() => { void refresh(); }, 60000);
  document.addEventListener('land-refresh', () => { void refresh(); });
  if(typeof window!=='undefined'){window.addEventListener('online',()=>void refresh());window.addEventListener('pageshow',event=>{if(event.persisted)void refresh();});}
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
}
