import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUILTIN_PACK_IDS } from '../shared/material-packs';

const packsDir = resolve(__dirname, '../../src-tauri/packs');

function iconEntries() {
  return readdirSync(packsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      id: entry.name,
      svg: readFileSync(resolve(packsDir, entry.name, 'icon.svg'), 'utf8'),
    }));
}

describe('内置素材图标契约', () => {
  it('42 枚图标与内置素材清单一一对应', () => {
    const ids = iconEntries().map(({ id }) => id).sort();
    expect(ids).toEqual([...BUILTIN_PACK_IDS].sort());
  });

  it.each(iconEntries())('$id 使用统一的小尺寸材质化 SVG 语言', ({ id, svg }) => {
    const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const root = document.documentElement;

    expect(root.nodeName, id).toBe('svg');
    expect(root.getAttribute('viewBox'), id).toBe('0 0 48 48');
    expect(root.hasAttribute('width'), id).toBe(false);
    expect(root.hasAttribute('height'), id).toBe(false);
    expect(document.querySelector('parsererror'), id).toBeNull();
    expect(document.querySelector('title')?.textContent?.trim(), id).not.toBe('');
    expect(document.querySelector('linearGradient, radialGradient'), id).not.toBeNull();
    expect(document.querySelector('[stroke-width="1.5"]'), id).not.toBeNull();
    expect(document.querySelector('animate, animateTransform, script, foreignObject'), id).toBeNull();
    expect(svg).toContain('var(--pack-');
    expect(new TextEncoder().encode(svg).byteLength, id).toBeLessThan(8 * 1024);
  });
});
