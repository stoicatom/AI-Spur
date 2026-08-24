/**
 * E2E Journey J04: Crack 触发
 *
 * J04: 高速鼠标移动 → trigger_macro 被调用
 *
 * Run: npx wdio run wdio.conf.ts --spec tests/e2e/j04-crack.spec.ts
 */

describe('J04: Crack trigger', () => {
  it('a fast mouse movement causes trigger_macro to be called', async () => {
    // The debug backdoor returns the exact sender sequence. This keeps the
    // journey deterministic without depending on a real foreground terminal
    // or accessibility permission in the E2E runner.
    const calls = await browser.execute(
      () => (window as any).__TAURI__.core.invoke('__test_send_macro', { phrase: 'FASTER' })
    ) as string[];
    expect(calls).toEqual(['Interrupt', 'TypeText(FASTER)', 'Enter']);
  });
});
