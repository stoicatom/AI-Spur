/**
 * Hotkey capture helpers.
 *
 * Pure functions so the recorder's parsing logic is testable without
 * simulating a live keyboard.
 */

/** Keys that only ever act as modifiers and can never stand alone. */
const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock']);

/** KeyboardEvent.code values whose accelerator spelling is stable cross-platform. */
const STABLE_CODES = new Map<string, string>([
  ['Backquote', 'Backquote'],
  ['Backslash', 'Backslash'],
  ['BracketLeft', 'BracketLeft'],
  ['BracketRight', 'BracketRight'],
  ['Comma', 'Comma'],
  ['Equal', 'Equal'],
  ['Minus', 'Minus'],
  ['Period', 'Period'],
  ['Quote', 'Quote'],
  ['Semicolon', 'Semicolon'],
  ['Slash', 'Slash'],
  ['Backspace', 'Backspace'],
  ['CapsLock', 'CapsLock'],
  ['Delete', 'Delete'],
  ['End', 'End'],
  ['Enter', 'Enter'],
  ['Escape', 'Escape'],
  ['Home', 'Home'],
  ['Insert', 'Insert'],
  ['PageDown', 'PageDown'],
  ['PageUp', 'PageUp'],
  ['Pause', 'Pause'],
  ['PrintScreen', 'PrintScreen'],
  ['ScrollLock', 'ScrollLock'],
  ['Space', 'Space'],
  ['Tab', 'Tab'],
  ['ArrowDown', 'ArrowDown'],
  ['ArrowLeft', 'ArrowLeft'],
  ['ArrowRight', 'ArrowRight'],
  ['ArrowUp', 'ArrowUp'],
  ['NumLock', 'NumLock'],
  ['NumpadAdd', 'NumpadAdd'],
  ['NumpadDecimal', 'NumpadDecimal'],
  ['NumpadDivide', 'NumpadDivide'],
  ['NumpadEnter', 'NumpadEnter'],
  ['NumpadEqual', 'NumpadEqual'],
  ['NumpadMultiply', 'NumpadMultiply'],
  ['NumpadSubtract', 'NumpadSubtract'],
]);

/**
 * Build a Tauri accelerator string from a keyboard event.
 *
 * Returns `null` while only modifiers are held — the caller keeps recording
 * until a real key lands.
 *
 * Ctrl and Cmd both map to `CommandOrControl` so one stored accelerator works
 * across platforms, matching the default `CommandOrControl+Shift+W`.
 */
export function accelFromEvent(event: {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null;

  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push('CommandOrControl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');

  const key = normalizeCode(event.code, event.key);
  if (!key) return null;
  parts.push(key);

  // A bare key with no modifier would hijack normal typing globally.
  if (parts.length < 2) return null;
  return parts.join('+');
}

/** Prefer physical code so the same key produces one accelerator on every layout. */
function normalizeCode(code: string | undefined, key: string): string | null {
  if (!code) return normalizeKey(key);
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return code.slice(6);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  return STABLE_CODES.get(code) ?? null;
}

/** Normalize an event key into the spelling Tauri's parser expects. */
function normalizeKey(key: string): string | null {
  // Space must be checked before the single-character branch below, since
  // ' ' has length 1 and would otherwise pass straight through.
  if (key === ' ') return 'Space';
  if (key.length === 1) {
    // Punctuation is passed through as typed; Tauri accepts single characters.
    return key.toUpperCase();
  }
  // F1–F24, Tab, Enter, arrows, etc. already arrive capitalized.
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) return key;
  if (STABLE_CODES.has(key)) return STABLE_CODES.get(key) ?? null;
  return null;
}

/**
 * Render an accelerator for display, using platform-native symbols on macOS
 * and spelled-out names elsewhere.
 */
export function formatAccel(accel: string, isMac = detectMac()): string {
  return accel
    .split('+')
    .map((part) => {
      switch (part) {
        case 'CommandOrControl':
          return isMac ? '⌘' : 'Ctrl';
        case 'Shift':
          return isMac ? '⇧' : 'Shift';
        case 'Alt':
          return isMac ? '⌥' : 'Alt';
        default:
          return part;
      }
    })
    .join(isMac ? '' : ' + ');
}

function detectMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}
