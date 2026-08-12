import { describe, it, expect } from 'vitest';
import { accelFromEvent, formatAccel } from '../settings/hotkey';

/** Build a keyboard-event-shaped object for the pure parser. */
function ev(
  key: string,
  mods: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}
) {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...mods,
  };
}

describe('accelFromEvent', () => {
  it('returns null while only modifiers are held', () => {
    expect(accelFromEvent(ev('Control', { ctrlKey: true }))).toBeNull();
    expect(accelFromEvent(ev('Shift', { shiftKey: true }))).toBeNull();
    expect(accelFromEvent(ev('Meta', { metaKey: true }))).toBeNull();
    expect(accelFromEvent(ev('Alt', { altKey: true }))).toBeNull();
  });

  it('maps both Ctrl and Cmd to CommandOrControl so one accel works cross-platform', () => {
    expect(accelFromEvent(ev('w', { ctrlKey: true, shiftKey: true }))).toBe(
      'CommandOrControl+Shift+W'
    );
    expect(accelFromEvent(ev('w', { metaKey: true, shiftKey: true }))).toBe(
      'CommandOrControl+Shift+W'
    );
  });

  it('orders modifiers consistently regardless of press order', () => {
    expect(accelFromEvent(ev('k', { shiftKey: true, altKey: true, ctrlKey: true }))).toBe(
      'CommandOrControl+Alt+Shift+K'
    );
  });

  it('uppercases letter keys', () => {
    expect(accelFromEvent(ev('a', { ctrlKey: true }))).toBe('CommandOrControl+A');
  });

  it('preserves F-keys', () => {
    expect(accelFromEvent(ev('F5', { ctrlKey: true }))).toBe('CommandOrControl+F5');
    expect(accelFromEvent(ev('F12', { altKey: true }))).toBe('Alt+F12');
  });

  it('normalizes the space key to Space', () => {
    expect(accelFromEvent(ev(' ', { ctrlKey: true }))).toBe('CommandOrControl+Space');
  });

  it('rejects a bare key with no modifier — it would hijack normal typing', () => {
    expect(accelFromEvent(ev('w'))).toBeNull();
    expect(accelFromEvent(ev('F5'))).toBeNull();
  });

  it('accepts named keys like Tab and Enter when modified', () => {
    expect(accelFromEvent(ev('Enter', { ctrlKey: true }))).toBe('CommandOrControl+Enter');
    expect(accelFromEvent(ev('Tab', { altKey: true }))).toBe('Alt+Tab');
  });
});

describe('formatAccel', () => {
  it('uses platform symbols on macOS', () => {
    expect(formatAccel('CommandOrControl+Shift+W', true)).toBe('⌘⇧W');
  });

  it('spells out modifiers elsewhere', () => {
    expect(formatAccel('CommandOrControl+Shift+W', false)).toBe('Ctrl + Shift + W');
  });

  it('renders Alt correctly on both platforms', () => {
    expect(formatAccel('Alt+F5', true)).toBe('⌥F5');
    expect(formatAccel('Alt+F5', false)).toBe('Alt + F5');
  });

  it('passes through a plain key unchanged', () => {
    expect(formatAccel('F5', false)).toBe('F5');
  });
});
