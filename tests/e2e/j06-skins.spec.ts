/**
 * E2E Journey J06: ���肤切���
 *
 * J06: 切���皮��� → ���次 spawn-whip ���用新皮���颜色（skin-changed 事件被���射���
 *
 * Run: npx wdio run wdio.conf.ts --spec tests/e2e/j06-skins.spec.ts
 */

describe('J06: Skin switching', () => {
  it('activating a skin emits skin-changed with the correct id', async () => {
    // Record skin-changed events in the overlay window.
    await browser.execute(() => {
      (window as any).__skinChangedTo = null;
      void (window as any).__TAURI__.event.listen(
        'skin-changed',
        (event: { payload: { skinId: string } }) => {
          (window as any).__skinChangedTo = event.payload.skinId;
        }
      );
    });

    // Get the list of available skins and pick one other than the current.
    const skins = await browser.execute(() =>
      (window as any).__TAURI__.invoke('list_skins')
    ) as Array<{ id: string }>;

    const config = await browser.execute(() =>
      (window as any).__TAURI__.invoke('get_config')
    ) as { activeSkin: string };

    const target = skins.find((s) => s.id !== config.activeSkin);
    if (!target) {
      // Only one skin available; the test is vacuously satisfied.
      return;
    }

    await browser.execute(
      ([skinId]: [string]) => (window as any).__TAURI__.invoke('activate_skin', { skinId }),
      [target.id]
    );

    await browser.waitUntil(
      async () => browser.execute(() => (window as any).__skinChangedTo !== null),
      { timeout: 3000, interval: 50 }
    );

    const skinId = await browser.execute(() => (window as any).__skinChangedTo);
    expect(skinId).toBe(target.id);

    // Restore original skin.
    await browser.execute(
      ([skinId]: [string]) => (window as any).__TAURI__.invoke('activate_skin', { skinId }),
      [config.activeSkin]
    );
  });
});
