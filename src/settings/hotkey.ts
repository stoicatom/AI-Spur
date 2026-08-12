/**
 * Hotkey capture helpers.
 *
 * Pure functions so the recorder's parsing logic is testable without
 * simulating a live keyboard.
 */

/** Keys that only ever act as modifiers and can never stand alone. */
const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock']);

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

  const key = normalizeKey(event.key);
  if (!key) return null;
  parts.push(key);

  // A bare key with no modifier would hijack normal typing globally.
  if (parts.length < 2) return null;
  return parts.join('+');
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
  if (/^F\d{1,2}$/.test(key)) return key;
  if (/^[A-Z][A-Za-z]+$/.test(key)) return key;
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
