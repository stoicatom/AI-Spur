/**
 * E2E Journey J04: Crack 触发
 *
 * J04: 高���鼠标移动 → trigger_macro 被调用
 *
 * Run: npx wdio run wdio.conf.ts --spec tests/e2e/j04-crack.spec.ts
 */

describe('J04: Crack trigger', () => {
  it('a fast mouse movement causes trigger_macro to be called', async () => {
    // Set up a listener in the overlay window that records macro invocations.
    await browser.execute(() => {
      (window as any).__macroCalled = false;
      (window as any).__TAURI__.event.listen('macro-triggered', () => {
        (window as any).__macroCalled = true;
      });
    });

    // The debug backdoor triggers the full shortcut-to-macro path, which is
    // the same one a real fast mouse movement would reach.
    await browser.execute(
      () => (window as any).__TAURI__.invoke('__test_send_macro', { phrase: 'FASTER' })
    );

    await browser.waitUntil(
      async () => browser.execute(() => (window as any).__macroCalled),
      { timeout: 2000, interval: 50 }
    );
    expect(
      await browser.execute(() => (window as any).__macroCalled)
    ).toBe(true);
  });
});
