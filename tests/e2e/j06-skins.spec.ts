/**
 * E2E Journey J06: 皮肤切换
 *
 * J06: 切换素材包 → overlay 收到 pack-changed 事件
 *
 * Run: npx wdio run wdio.conf.ts --spec tests/e2e/j06-skins.spec.ts
 */

describe('J06: Skin switching', () => {
  it('activating a material pack emits pack-changed with the correct id', async () => {
    // Record pack-changed events in the overlay window.
    await browser.execute(() => {
      (window as any).__skinChangedTo = null;
      void (window as any).__TAURI__.event.listen(
        'pack-changed',
        (event: { payload: { packId: string } }) => {
          (window as any).__skinChangedTo = event.payload.packId;
        }
      );
    });

    // Get the list of available v3 material packs and pick one other than the current.
    const skins = await browser.execute(() =>
      (window as any).__TAURI__.core.invoke('list_packs')
    ) as Array<{ id: string }>;

    const config = await browser.execute(() =>
      (window as any).__TAURI__.core.invoke('get_config')
    ) as { activePackId: string };

    const target = skins.find((s) => s.id !== config.activePackId);
    if (!target) {
      // Only one skin available; the test is vacuously satisfied.
      return;
    }

    await browser.execute(
      ([id]: [string]) => (window as any).__TAURI__.core.invoke('set_active_pack', { id }),
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
      ([id]: [string]) => (window as any).__TAURI__.core.invoke('set_active_pack', { id }),
      [config.activePackId]
    );
  });
});
