/**
 * E2E Journey J05: Settings persistence
 *
 * J05: 修改提示词 → 保存 → 重启 ��� 提示词���在
 *
 * Run: npx wdio run wdio.conf.ts --spec tests/e2e/j05-settings.spec.ts
 */

describe('J05: Settings persistence', () => {
  const TEST_PHRASE = `E2E-TEST-${Date.now()}`;

  it('a saved phrase survives a config reload', async () => {
    // Load current config, append a unique phrase, and save it.
    const original = await browser.execute(() =>
      (window as any).__TAURI__.invoke('get_config')
    );
    const updated = {
      ...(original as Record<string, unknown>),
      phrases: [
        ...((original as any).phrases ?? []),
        TEST_PHRASE,
      ],
    };
    await browser.execute(
      ([cfg]: [unknown]) => (window as any).__TAURI__.invoke('save_config', { config: cfg }),
      [updated]
    );

    // Reload config and verify the phrase is still there.
    const reloaded = await browser.execute(() =>
      (window as any).__TAURI__.invoke('get_config')
    ) as any;

    expect(reloaded.phrases).toContain(TEST_PHRASE);

    // Restore the original to avoid polluting subsequent test runs.
    await browser.execute(
      ([cfg]: [unknown]) => (window as any).__TAURI__.invoke('save_config', { config: cfg }),
      [original]
    );
  });
});
