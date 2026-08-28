/**
 * 光标可见性回归测试
 *
 * 现象：甩动 → 特效播完 → 整屏光标消失，只有菜单栏/Dock 能看到指针。
 * 根因：`cursor: none` 挂在通配选择器 `*` 上，且运行时从不改写；只要这个
 * 全屏透明置顶窗口还在屏上参与命中测试，指针落上去就是不可见的。
 *
 * 这组测试锁死两件事：
 *  1. CSS 契约：`cursor: none` 只能在一个可撤销的 class 作用域内生效；
 *  2. 运行时契约：`setWhipCursorHidden(false)` 一定能把光标交还系统。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  WHIP_ACTIVE_CLASS,
  setWhipCursorHidden,
  isWhipCursorHidden,
} from '../overlay/cursor-visibility';

const overlayHtml = readFileSync(resolve(__dirname, '../../overlay.html'), 'utf8');

/** 取出 `<style>` 块，按 `选择器 { 声明 }` 粗粒度切分。 */
function cssRules(): { selector: string; body: string }[] {
  const style = overlayHtml.match(/<style>([\s\S]*?)<\/style>/);
  if (!style) throw new Error('overlay.html 缺少 <style> 块');
  const rules: { selector: string; body: string }[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(style[1])) !== null) {
    rules.push({ selector: m[1].trim(), body: m[2].trim() });
  }
  return rules;
}

describe('overlay.html 光标 CSS 契约', () => {
  const rules = cssRules();
  const cursorNoneRules = rules.filter((r) => /cursor\s*:\s*none/.test(r.body));

  it('至少有一条 cursor:none 规则（活跃态仍要隐藏系统光标）', () => {
    expect(cursorNoneRules.length).toBeGreaterThan(0);
  });

  it('cursor:none 绝不能挂在通配选择器 `*` 上', () => {
    const wildcard = cursorNoneRules.filter((r) =>
      r.selector.split(',').some((s) => s.trim() === '*'),
    );
    expect(wildcard).toEqual([]);
  });

  it('每一条 cursor:none 都必须被 .whip-active 作用域限定', () => {
    for (const rule of cursorNoneRules) {
      for (const selector of rule.selector.split(',')) {
        expect(selector).toContain(WHIP_ACTIVE_CLASS);
      }
    }
  });

  it('恢复面板必须显式声明可见光标（否则用户看得见按钮却找不到指针）', () => {
    const panelCursor = rules.filter(
      (r) => r.selector.includes('#macro-status') && /cursor\s*:/.test(r.body),
    );
    expect(panelCursor.length).toBeGreaterThan(0);
    expect(panelCursor.some((r) => /cursor\s*:\s*none/.test(r.body))).toBe(false);
  });

  it('恢复面板按钮使用 pointer 光标', () => {
    const button = rules.find(
      (r) => r.selector.includes('#macro-status button') && /cursor\s*:\s*pointer/.test(r.body),
    );
    expect(button).toBeDefined();
  });
});

describe('setWhipCursorHidden', () => {
  beforeEach(() => {
    document.documentElement.className = '';
  });

  it('活跃时给根元素加上作用域 class', () => {
    setWhipCursorHidden(true);
    expect(document.documentElement.classList.contains(WHIP_ACTIVE_CLASS)).toBe(true);
    expect(isWhipCursorHidden()).toBe(true);
  });

  it('收起时移除 class —— 光标交还系统', () => {
    setWhipCursorHidden(true);
    setWhipCursorHidden(false);
    expect(document.documentElement.classList.contains(WHIP_ACTIVE_CLASS)).toBe(false);
    expect(isWhipCursorHidden()).toBe(false);
  });

  it('重复关闭是幂等的（dismiss 与 dispose 可能都调用）', () => {
    setWhipCursorHidden(false);
    setWhipCursorHidden(false);
    expect(isWhipCursorHidden()).toBe(false);
  });

  it('根元素缺失时不抛错', () => {
    expect(() => setWhipCursorHidden(true, null)).not.toThrow();
    expect(isWhipCursorHidden(null)).toBe(false);
  });
});
