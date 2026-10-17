// Dependency-free HTML inspection for the controlled template fixtures. These
// helpers do not replace a browser/HTML parser for arbitrary markup.
export const attributes = text => Object.fromEntries(
  [...text.matchAll(/([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]),
);

export function formContracts(html) {
  return [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)].map(match => {
    const form = attributes(match[1]);
    const fields = [...match[2].matchAll(/<(input|button|select|textarea)\b([^>]*)>/g)].map(field => {
      const attrs = attributes(field[2]);
      delete attrs.class;
      delete attrs.style;
      if (attrs.name === 'commandId') attrs.value = '<generated-command-id>';
      if (attrs.name === 'csrf') attrs.value = '<csrf-token>';
      const flags = ['disabled', 'required', 'readonly', 'multiple'].filter(flag => new RegExp('(?:^|\\s)' + flag + '(?:\\s|$)').test(field[2]));
      return { tag: field[1], attributes: attrs, flags };
    });
    return { method: form.method, action: form.action, fields };
  });
}

export function navigationLinks(html, label) {
  const nav = [...html.matchAll(/<nav\b([^>]*)>([\s\S]*?)<\/nav>/g)].find(match => attributes(match[1])['aria-label'] === label);
  if (!nav) return [];
  return [...nav[2].matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(match => {
    const attrs = attributes(match[1]);
    const image = /<img\b([^>]*)>/.exec(match[2]);
    const visible = match[2].replace(/<span\b[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/span>/g, '');
    return { href: attrs.href, label: visible.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(),
      current: attrs['aria-current'] === 'page', image: image ? attributes(image[1]).src : null };
  });
}
