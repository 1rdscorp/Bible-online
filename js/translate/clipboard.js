/**
 * Copy text to the clipboard. Call it from a click (browsers allow
 * clipboard writes only in response to the reader's own action).
 *
 * Uses the Clipboard API where the page is secure (https, localhost). On a
 * plain-http address, such as a phone testing the site over Wi-Fi, that API
 * doesn't exist, so it falls back to the older copy command on a hidden
 * text box. Resolves true if the text was copied.
 */
export async function copyText(text, { clipboard = globalThis.navigator?.clipboard, doc = globalThis.document } = {}) {
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // Blocked (e.g. permissions): try the fallback.
    }
  }
  if (!doc?.execCommand) return false;
  const box = doc.createElement('textarea');
  box.value = text;
  box.setAttribute('readonly', '');
  // Off-screen, and not resizing or scrolling the page.
  box.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
  const active = doc.activeElement;
  doc.body.append(box);
  box.select();
  let copied = false;
  try {
    copied = doc.execCommand('copy');
  } catch {
    copied = false;
  }
  box.remove();
  active?.focus?.({ preventScroll: true });
  return copied;
}
