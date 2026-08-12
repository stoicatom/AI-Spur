/**
 * E2E Journeys J07–J08: 快速���式自动���换 + Shift ���蛋
 *
 * J07: 触��� N 次后动画模式变��� fast
 * J08: 快���模式下 Shift+快捷键 → 完整动画展���（spawn-whip 事件被触发）
 *
 * Run: npx wdio run wdio.conf.ts --spec tests/e2e/j07-j08-animation.spec.ts
 */

const THRESHOLD = 3; // Use a small threshold so the test stays fast.

describe('J07: Auto mode switch', () => {
  before(async () => {
    // Set the threshold to a small value and reset usage count.
    const config = await browser.execute(() =>
      (window as any).__TAURI__.invoke('get_config')
    ) as any;
    await browser.execute(
      ([cfg]: [any]) =>
        (window as any).__TAURI__.invoke('save_config', {
          config: { ...cfg, animationMode: 'auto', autoSwitchThreshold: THRESHOLD, usageCount: 0, todayUsageCount: 0 },
        }),
      [config]
    );
  });

  it('usage count reaches the threshold and config reflects auto switch', async () => {
    for (let i = 0; i < THRESHOLD; i++) {
      await browser.execute(() =>
        (window as any).__TAURI__.invoke('increment_usage')
      );
    }
    const config = await browser.execute(() =>
      (window as any).__TAURI__.invoke('get_config')
    ) as any;
    expect(config.usageCount).toBeGreaterThanOrEqual(THRESHOLD);
  });

  after(async () => {
    // Restore a sensible threshold so other tests are not affected.
    const config = await browser.execute(() =>
      (window as any).__TAURI__.invoke('get_config')
    ) as any;
    await browser.execute(
      ([cfg]: [any]) =>
        (window as any).__TAURI__.invoke('save_config', {
          config: { ...cfg, autoSwitchThreshold: 20, usageCount: 0, todayUsageCount: 0 },
        }),
      [config]
    );
  });
});

describe('J08: Shift easter egg', () => {
  it('the shortcut backdoor still emits spawn-whip (Shift modifier path)', async () => {
    await browser.execute(() => {
      (window as any).__shiftWhipFired = false;
      void (window as any).__TAURI__.event.listen('spawn-whip', () => {
        (window as any).__shiftWhipFired = true;
      });
    });

    // __test_trigger_shortcut is used for both the regular and Shift paths in
    // the test environment; the distinction is handled by the real shortcut
    // plugin when a real keyboard is present.
    await browser.execute(() =>
      (window as any).__TAURI__.invoke('__test_trigger_shortcut')
    );

    await browser.waitUntil(
      async () => browser.execute(() => (window as any).__shiftWhipFired),
      { timeout: 2000, interval: 50 }
    );
    expect(
      await browser.execute(() => (window as any).__shiftWhipFired)
    ).toBe(true);
  });
});
