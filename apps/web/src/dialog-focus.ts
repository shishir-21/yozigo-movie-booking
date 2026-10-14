const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Keep keyboard navigation inside a modal while it is mounted.
 * Returns a cleanup callback for React effect teardown.
 */
export function trapDialogFocus(dialog: HTMLElement): () => void {
  const getFocusable = () => Array.from(
    dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((element) => element.getAttribute('aria-hidden') !== 'true');

  const focusable = getFocusable();
  (focusable[0] ?? dialog).focus();

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return;
    const current = getFocusable();

    if (current.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = current[0];
    const last = current[current.length - 1];
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  };

  dialog.addEventListener('keydown', handleKeyDown);
  return () => dialog.removeEventListener('keydown', handleKeyDown);
}
