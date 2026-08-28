/**
 * 系统光标可见性作用域。
 *
 * macOS 的光标形状由「鼠标当前所在窗口」决定。覆盖层是全屏透明置顶窗口，
 * 只要它还在屏上参与命中测试，它声明的 `cursor` 就是用户看到的光标。
 * 因此 `cursor: none` 绝不能常驻（更不能挂在通配选择器上）——必须绑定在
 * 一个可随时撤销的作用域 class 上，收起时一定要摘掉。
 *
 * 这是光标丢失的最后一道保险：即便窗口因任何原因没能隐藏成功，
 * 只要 class 被移除，指针就一定回来。
 */

/** overlay.html 中所有 `cursor: none` 规则的作用域前缀。 */
export const WHIP_ACTIVE_CLASS = 'whip-active';

function rootOf(root?: HTMLElement | null): HTMLElement | null {
  return root === undefined ? document.documentElement : root;
}

/** 切换隐藏系统光标的作用域。`false` 无条件把光标交还系统。 */
export function setWhipCursorHidden(hidden: boolean, root?: HTMLElement | null): void {
  const el = rootOf(root);
  if (!el) return;
  el.classList.toggle(WHIP_ACTIVE_CLASS, hidden);
}

export function isWhipCursorHidden(root?: HTMLElement | null): boolean {
  return rootOf(root)?.classList.contains(WHIP_ACTIVE_CLASS) ?? false;
}
