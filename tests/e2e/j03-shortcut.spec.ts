/**
 * E2E Journey J03: ���捷键触发
 *
 * J03: 按 Ctrl+Shift+W → overlay 窗口内 spawn-whip 事件被���发（< 150ms）
 *
 * Run: npx wdio run wdio.conf.ts --spec tests/e2e/j03-shortcut.spec.ts
 */

const SHORTCUT_TIMEOUT_MS = 150; // performance budget from design spec §1.2

describe('J03: Global shortcut trigger', () => {
  it('triggering the shortcut emits spawn-whip within 150ms', async () => {
    // Inject a listener into the overlay window that records when spawn-whip
    // fires; the main process emits the event.
    await browser.execute(() => {
      (window as any).__spawnWhipFired = false;
      (window as any).__spawnWhipTs = 0;
      void (window as any).__TAURI__.event.listen('spawn-whip', () => {
        (window as any).__spawnWhipFired = true;
        (window as any).__spawnWhipTs = Date.now();
      });
    });

    const before = await browser.execute(() => Date.now());

    // Use the debug backdoor to fire the shortcut without a real keypress.
    await browser.execute(
      () => (window as any).__TAURI__.invoke('__test_trigger_shortcut')
    );

    await browser.waitUntil(
      async () => browser.execute(() => (window as any).__spawnWhipFired),
      { timeout: 1000, interval: 10 }
    );

    const elapsed = await browser.execute(
      ([t]: number[]) => (window as any).__spawnWhipTs - t,
      [before]
    );
    expect(elapsed).toBeLessThanOrEqual(SHORTCUT_TIMEOUT_MS);
  });
});
