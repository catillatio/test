// Presentation helpers only. Never submit gameplay actions or change resources.
for (const button of document.querySelectorAll('[data-copy-code]')) {
  button.addEventListener('click', async () => {
    const code = document.getElementById(button.dataset.copyTarget);
    const status = document.querySelector('[data-copy-status]');
    if (!code || button.disabled) return;
    button.disabled = true;
    try {
      await navigator.clipboard.writeText(code.textContent.trim());
      status.textContent = 'Invitation code copied.';
    } catch {
      const selection = window.getSelection();
      selection?.selectAllChildren(code);
      status.textContent = 'Code selected. Use your device’s Copy command.';
    } finally {
      button.disabled = false;
    }
  });
}
const guide = document.querySelector('[data-guide-target]');
const target = guide && document.getElementById(guide.dataset.guideTarget);
if (target) {
  target.classList.add('guide-highlight');
  const describedBy = target.getAttribute('aria-describedby');
  target.setAttribute('aria-describedby', [describedBy, 'tutorial-instruction'].filter(Boolean).join(' '));
  for (const link of document.querySelectorAll('[data-guide-destination]')) {
    if (link.dataset.guideDestination !== target.id) continue;
    link.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault();
      target.scrollIntoView({block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
      const action = target.querySelector('button:not(:disabled),a[href]');
      action?.focus({preventScroll: true});
    });
  }
}
