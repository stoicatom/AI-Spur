import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  auditIconSvg,
  ALLOWED_STROKE_WIDTHS,
  ICON_CANVAS,
  ICON_STROKE,
  REQUIRED_ROOT_ATTRS,
} from '../shared/icon-design-system';
import { BUILTIN_PACK_IDS } from '../shared/material-packs';

const PACKS_DIR = join(process.cwd(), 'src-tauri', 'packs');

function iconPath(packId: string): string {
  return join(PACKS_DIR, packId, 'icon.svg');
}

function readIcon(packId: string): string {
  return readFileSync(iconPath(packId), 'utf8');
}

describe('图标设计系统规范', () => {
  it('栅格与主描边为设计系统基准值', () => {
    expect(ICON_CANVAS).toBe(48);
    expect(ICON_STROKE).toBe(1.5);
    expect(ALLOWED_STROKE_WIDTHS).toContain(ICON_STROKE);
  });

  it('根属性规范覆盖 viewBox / fill / 端点 / 缩放 / 渲染精度', () => {
    expect(REQUIRED_ROOT_ATTRS.viewBox).toBe('0 0 48 48');
    expect(REQUIRED_ROOT_ATTRS.fill).toBe('none');
    expect(REQUIRED_ROOT_ATTRS['stroke-linecap']).toBe('round');
    expect(REQUIRED_ROOT_ATTRS.preserveAspectRatio).toBe('xMidYMid meet');
  });
});

describe('auditIconSvg 校验器', () => {
  const good = [
    '<svg viewBox="0 0 48 48" fill="none" stroke-linecap="round" stroke-linejoin="round"',
    ' preserveAspectRatio="xMidYMid meet" shape-rendering="geometricPrecision">',
    '<title>测试</title><defs><linearGradient id="g"><stop stop-color="var(--pack-a,#fff)"/>',
    '</linearGradient><filter id="f"><feGaussianBlur stdDeviation="1"/></filter></defs>',
    '<path stroke-width="1.5" d="M4 4H44"/></svg>',
  ].join('');

  it('合规图标零违规', () => {
    expect(auditIconSvg('demo', good).violations).toEqual([]);
  });

  it('缺 title 被判无障碍违规', () => {
    const svg = good.replace('<title>测试</title>', '');
    const kinds = auditIconSvg('demo', svg).violations.map((v) => v.kind);
    expect(kinds).toContain('missing-title');
  });

  it('硬编码颜色（未用色板变量）被判违规', () => {
    const svg = good.replace('var(--pack-a,#fff)', '#ffffff');
    const kinds = auditIconSvg('demo', svg).violations.map((v) => v.kind);
    expect(kinds).toContain('missing-palette');
  });

  it('白名单外的描边宽度被判违规并报出实际值', () => {
    const svg = good.replace('stroke-width="1.5"', 'stroke-width="1.37"');
    const violation = auditIconSvg('demo', svg).violations.find((v) => v.kind === 'stroke-width');
    expect(violation?.detail).toContain('1.37');
  });

  it('缺渐变与发光被判扁平', () => {
    const flat = '<svg viewBox="0 0 48 48" fill="none" stroke-linecap="round" '
      + 'stroke-linejoin="round" preserveAspectRatio="xMidYMid meet" '
      + 'shape-rendering="geometricPrecision"><title>t</title>'
      + '<path stroke="var(--pack-a,#fff)" stroke-width="1.5" d="M4 4H44"/></svg>';
    const kinds = auditIconSvg('demo', flat).violations.map((v) => v.kind);
    expect(kinds).toContain('missing-depth');
  });

  it('根属性缺失被逐条报出', () => {
    const svg = good.replace(' shape-rendering="geometricPrecision"', '');
    const violation = auditIconSvg('demo', svg).violations.find((v) => v.kind === 'root-attr');
    expect(violation?.detail).toContain('shape-rendering');
  });
});

describe('42 枚内置图标合规性', () => {
  it('每个内置素材都有 icon.svg', () => {
    const missing = BUILTIN_PACK_IDS.filter((id) => !existsSync(iconPath(id)));
    expect(missing).toEqual([]);
  });

  it('packs 目录恰好 42 个素材，与注册表一致', () => {
    const dirs = readdirSync(PACKS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    expect(dirs).toEqual([...BUILTIN_PACK_IDS].sort());
    expect(dirs).toHaveLength(42);
  });

  it('全部 42 枚通过设计系统校验', () => {
    const failed = BUILTIN_PACK_IDS
      .map((id) => auditIconSvg(id, readIcon(id)))
      .filter((audit) => audit.violations.length > 0)
      .map((audit) => `${audit.packId}: ${audit.violations.map((v) => v.detail).join('; ')}`);
    expect(failed).toEqual([]);
  });

  it('每枚图标的 title 非空且不是占位文本', () => {
    for (const id of BUILTIN_PACK_IDS) {
      const title = readIcon(id).match(/<title>([^<]+)<\/title>/)?.[1] ?? '';
      expect(title.trim().length, `${id} 标题为空`).toBeGreaterThan(0);
      expect(title, `${id} 标题是占位符`).not.toMatch(/^(icon|title|todo|tbd)$/i);
    }
  });
});
