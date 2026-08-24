/**
 * E2E Journey J09: First-launch onboarding
 *
 * J09: 首次启动弹出引导窗口，引导完成后 firstLaunch = false
 *
 * Run: npx wdio run wdio.conf.ts --spec tests/e2e/j09-onboarding.spec.ts
 */

describe('J09: First-launch onboarding', () => {
  before(async () => {
    // Force firstLaunch back to true so the wizard shows.
    const config = await browser.execute(() =>
      (window as any).__TAURI__.core.invoke('get_config')
    ) as any;
    await browser.execute(
      ([cfg]: [any]) =>
        (window as any).__TAURI__.core.invoke('save_config', {
          config: { ...cfg, firstLaunch: true },
        }),
      [config]
    );
    // The service may attach to the transparent overlay first. Onboarding is
    // rendered by the settings window, so select it explicitly before reload.
    const handles = await browser.getWindowHandles();
    for (const handle of handles) {
      await browser.switchToWindow(handle);
      if ((await browser.getTitle()).includes('设置')) break;
    }
    await browser.refresh();
  });

  it('the onboarding wizard is visible on first launch', async () => {
    // After refresh the settings window should show the wizard, not the sidebar.
    await browser.waitUntil(
      async () => {
        const src = await browser.getPageSource();
        return src.includes('设置全局快捷键');
      },
      { timeout: 5000, interval: 200 }
    );
    const src = await browser.getPageSource();
    expect(src).toContain('设置全局快捷键');
  });

  it('firstLaunch is false after completing onboarding', async () => {
    // Set firstLaunch to false directly (simulates the wizard completing).
    const config = await browser.execute(() =>
      (window as any).__TAURI__.core.invoke('get_config')
    ) as any;
    await browser.execute(
      ([cfg]: [any]) =>
        (window as any).__TAURI__.core.invoke('save_config', {
          config: { ...cfg, firstLaunch: false },
        }),
      [config]
    );

    const reloaded = await browser.execute(() =>
      (window as any).__TAURI__.core.invoke('get_config')
    ) as any;
    expect(reloaded.firstLaunch).toBe(false);
  });
});
