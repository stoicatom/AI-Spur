/**
 * 42 枚内置素材图标的统一设计系统审计（设计规格 §5）。
 *
 * 图标不是逐枚手工画完就算完，而要作为一套视觉语言成立：同一栅格、
 * 同一线宽层级、同一打光方向、同一接地方式。这里把规范写成断言，
 * 任何新增或改动的图标偏离系统时立即失败。
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PACKS_DIR = join(__dirname, '../../src-tauri/packs');

/** 结构描边的唯一线宽。装饰性细节线可用附表中的允许值。 */
const STRUCTURAL_STROKE = '1.5';

/**
 * 允许的非结构线宽白名单，共三级层级。
 *
 * - 细节线 `.8`：龙鳞、枪身刻线，比结构线更细才不糊成一团
 * - 造型线 `2` / `2.5` / `3`：黑洞喷流、月牙主轮廓、矛杆、喇叭口——线宽本身
 *   就是造型的一部分，收敛到 1.5 会丢掉形体
 *
 * 每个值都要有造型理由。`1` / `1.4` / `1.6` / `.7` / `.75` 这类同用途上的
 * 随机抖动已在本轮收敛，不再接受。
 */
const ALLOWED_DETAIL_STROKES = new Set(['0.8', '.8', '2', '2.5', '3']);

function packIds(): string[] {
  return readdirSync(PACKS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function iconOf(id: string): string {
  return readFileSync(join(PACKS_DIR, id, 'icon.svg'), 'utf8');
}

const ids = packIds();

describe('素材图标设计系统', () => {
  it('恰好 42 枚内置素材，每枚都有 icon.svg', () => {
    expect(ids).toHaveLength(42);
    for (const id of ids) {
      expect(() => iconOf(id), id).not.toThrow();
    }
  });

  it('统一 48×48 栅格', () => {
    for (const id of ids) {
      expect(iconOf(id), id).toContain('viewBox="0 0 48 48"');
    }
  });

  it('根元素统一声明圆角笔触，全套共享同一笔触个性', () => {
    for (const id of ids) {
      const root = iconOf(id).split('>')[0];
      expect(root, `${id} 缺 stroke-linecap`).toContain('stroke-linecap="round"');
      expect(root, `${id} 缺 stroke-linejoin`).toContain('stroke-linejoin="round"');
    }
  });

  it('结构描边统一 1.5，离群线宽必须在造型白名单内', () => {
    for (const id of ids) {
      const widths = [...iconOf(id).matchAll(/stroke-width="([^"]+)"/g)].map((m) => m[1]);
      expect(widths.length, `${id} 无描边`).toBeGreaterThan(0);
      expect(widths, `${id} 缺结构线宽`).toContain(STRUCTURAL_STROKE);
      for (const w of widths) {
        if (w === STRUCTURAL_STROKE) continue;
        expect(
          ALLOWED_DETAIL_STROKES.has(w),
          `${id} 线宽 ${w} 不在白名单：要么归到 1.5，要么说明造型理由`,
        ).toBe(true);
      }
    }
  });

  it('统一 studio-light 打光滤镜，同一光源方向', () => {
    for (const id of ids) {
      const svg = iconOf(id);
      expect(svg, `${id} 缺 studio-light`).toContain('filter id="studio-light"');
      expect(svg, `${id} 光源方向不一致`).toContain('azimuth="224" elevation="58"');
    }
  });

  it('统一接地投影，图标不悬空', () => {
    for (const id of ids) {
      const svg = iconOf(id);
      expect(svg, `${id} 缺接地阴影`).toContain('filter id="contact-shadow"');
      expect(svg, `${id} 未使用接地阴影`).toContain('url(#contact-shadow)');
    }
  });

  it('配色经 CSS 变量暴露，支持主题覆写', () => {
    for (const id of ids) {
      expect(iconOf(id), `${id} 无可覆写变量`).toMatch(/var\(--pack-[a-z-]+,\s*#[0-9A-Fa-f]{3,8}\)/);
    }
  });

  it('每枚图标有中文 title，供无障碍读出', () => {
    for (const id of ids) {
      const m = iconOf(id).match(/<title>([^<]+)<\/title>/);
      expect(m, `${id} 缺 title`).not.toBeNull();
      expect(m![1].trim().length, `${id} title 为空`).toBeGreaterThan(0);
    }
  });

  it('保持矢量精度渲染声明', () => {
    for (const id of ids) {
      expect(iconOf(id), id).toContain('shape-rendering="geometricPrecision"');
    }
  });
});
