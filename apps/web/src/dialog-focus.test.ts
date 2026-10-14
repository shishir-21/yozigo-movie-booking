import { describe, expect, it, vi } from 'vitest';
import { trapDialogFocus } from './dialog-focus';

describe('trapDialogFocus', () => {
  it('focuses the first available control and wraps Tab from the last control', () => {
    const first = { focus: vi.fn(), getAttribute: vi.fn(() => null) };
    const last = { focus: vi.fn(), getAttribute: vi.fn(() => null) };
    let keydown: ((event: KeyboardEvent) => void) | undefined;
    const dialog = {
      querySelectorAll: vi.fn(() => [first, last]),
      focus: vi.fn(),
      contains: vi.fn(() => true),
      addEventListener: vi.fn((_name: string, handler: (event: KeyboardEvent) => void) => { keydown = handler; }),
      removeEventListener: vi.fn(),
    } as unknown as HTMLElement;

    const cleanup = trapDialogFocus(dialog);
    expect(first.focus).toHaveBeenCalledOnce();

    const preventDefault = vi.fn();
    vi.stubGlobal('document', { activeElement: last });
    keydown?.({ key: 'Tab', shiftKey: false, preventDefault } as unknown as KeyboardEvent);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(first.focus).toHaveBeenCalledTimes(2);

    cleanup();
    expect(dialog.removeEventListener).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('keeps focus on the dialog when no focusable controls exist', () => {
    let keydown: ((event: KeyboardEvent) => void) | undefined;
    const dialog = {
      querySelectorAll: vi.fn(() => []),
      focus: vi.fn(),
      contains: vi.fn(() => false),
      addEventListener: vi.fn((_name: string, handler: (event: KeyboardEvent) => void) => { keydown = handler; }),
      removeEventListener: vi.fn(),
    } as unknown as HTMLElement;

    trapDialogFocus(dialog);
    const preventDefault = vi.fn();
    keydown?.({ key: 'Tab', shiftKey: false, preventDefault } as unknown as KeyboardEvent);
    expect(preventDefault).toHaveBeenCalledOnce();
    // The dialog receives focus on initialization and again when Tab is pressed.
    expect(dialog.focus).toHaveBeenCalledTimes(2);
  });
});
