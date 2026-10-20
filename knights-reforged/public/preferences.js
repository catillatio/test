// Progressive sound-setting autosave. Existing authenticated command handling
// owns validation and persistence. No rewards or other player state is edited.
const form = document.querySelector('[data-sound-settings]');
if (form) {
  const identity = document.querySelector('[data-character-id]')?.dataset.characterId;
  const choice = form.querySelector('[name=enabled]'), range = form.querySelector('[name=volume]');
  const status = form.querySelector('[data-sound-status]'), retry = form.querySelector('[data-preference-save]');
  const read = () => ({enabled: choice.value, volume: Number(range.value)});
  const same = (a, b) => a?.enabled === b?.enabled && a?.volume === b?.volume;
  let saved = read(), pending = null, busy = false, blocked = false, timer = null;
  form.dataset.autosave = 'ready';
  retry.hidden = true;
  status.textContent = 'Changes save automatically. Playback begins after a tap.';

  async function save() {
    if (busy) return;
    clearTimeout(timer);
    const desired = read();
    if (!pending && same(desired, saved)) return;
    pending ??= {commandId: crypto.randomUUID(), ...desired};
    busy = true; blocked = false; retry.hidden = true;
    status.textContent = 'Saving sound settings…';
    form.setAttribute('aria-busy', 'true');
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
    let again = false;
    try {
      const current = await fetch('/api/v1/me', {credentials: 'same-origin', cache: 'no-store', signal: controller.signal});
      if (current.status === 401) throw new Error('session');
      if (!current.ok) throw new Error('unavailable');
      const state = await current.json();
      if (!identity || state.state?.id !== identity || typeof state.csrfToken !== 'string') throw new Error('identity');
      const response = await fetch('/api/v1/settings/sound', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        headers: {'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': state.csrfToken, 'Idempotency-Key': pending.commandId},
        body: JSON.stringify(pending),
      });
      if (response.status === 401) throw new Error('session');
      if (!response.ok) throw new Error('unavailable');
      const receipt = await response.json();
      if (receipt.commandId !== pending.commandId || receipt.kind !== 'sound') throw new Error('unavailable');
      saved = {enabled: pending.enabled, volume: pending.volume}; pending = null;
      again = !same(read(), saved);
      if (!again) {
        status.textContent = 'Sound settings saved.';
        document.dispatchEvent(new CustomEvent('kingdom-preference-saved', {detail: saved}));
      }
    } catch (error) {
      blocked = true; retry.hidden = false; retry.textContent = 'Retry Save';
      status.textContent = error.message === 'session' ? 'Sign in again to save. Your choice stays on this screen.' : error.message === 'identity' ? 'The signed-in player changed. Open Settings again before saving.' : 'Could not confirm the save. Retry to safely recover it.';
      if (error.message === 'session' && !form.querySelector('[data-preference-signin]')) {
        const link = document.createElement('a'); link.href = '/login?returnTo=%2Fgame%2Fsettings'; link.textContent = 'Sign in and return'; link.className = 'text-link'; link.dataset.preferenceSignin = ''; form.append(link);
      }
    } finally {
      clearTimeout(timeout); busy = false; form.removeAttribute('aria-busy');
    }
    if (again && !blocked) void save();
  }
  for (const input of [choice, range]) input.addEventListener('change', () => {
    clearTimeout(timer); if (!blocked) timer = setTimeout(() => { void save(); }, 200);
  });
  form.addEventListener('submit', event => { event.preventDefault(); void save(); });
}
