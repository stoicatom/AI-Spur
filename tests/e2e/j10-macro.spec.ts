/**
 * E2E Journey J10: Cross-platform keyboard input
 *
 * J10: trigger_macro 发��� Ctrl+C + text + Enter（三平台统一行为验证）
 *
 * Run: npx wdio run wdio.conf.ts --spec tests/e2e/j10-macro.spec.ts
 */

describe('J10: Cross-platform keyboard input synthesis', () => {
  it('trigger_macro invokes the macro sender without crashing', async () => {
    // The enigo backend is only exercised when a real display is available.
    // This test verifies that the IPC path completes (no panic, no hang),
    // not the pixel-level keypress result — the latter is covered by the
    // MacroSender unit tests that run without a display.
    const result = await browser.execute(
      () =>
        (window as any).__TAURI__.invoke('trigger_macro', { phrase: 'FASTER' })
          .then(() => 'ok')
          .catch((err: Error) => `err:${err.message}`)
    );
    expect(result as string).toBe('ok');
  });

  it('trigger_macro accepts a custom phrase without crashing', async () => {
    const result = await browser.execute(
      () =>
        (window as any).__TAURI__.invoke('trigger_macro', { phrase: 'KEEP GOING' })
          .then(() => 'ok')
          .catch((err: Error) => `err:${err.message}`)
    );
    expect(result as string).toBe('ok');
  });

  it('trigger_macro works without an explicit phrase (uses the default selection)', async () => {
    const result = await browser.execute(
      () =>
        (window as any).__TAURI__.invoke('trigger_macro', {})
          .then(() => 'ok')
          .catch((err: Error) => `err:${err.message}`)
    );
    expect(result as string).toBe('ok');
  });
});
