import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MaterialPackSchema } from '../../shared/material-packs';

/**
 * 回归测试：用 Rust 真实序列化输出验证 Zod schema 兼容性。
 * 关键点：Rust 的 Option 序列化为 null，Zod 必须用 nullish() 而非 optional()。
 */
describe('Material Pack real-payload contract', () => {
  // 读取磁盘上的真实 pack.json（项目根 / src-tauri/packs）
  const packsDir = resolve(__dirname, '../../../src-tauri/packs');
  const rawSkull = readFileSync(`${packsDir}/skull/pack.json`, 'utf-8');

  const rustPayload = {
    id: 'skull',
    name: '骷髅',
    builtin: true,
    imageFile: 'icon.svg',
    dataUri: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    effect: { preset: 'burst', params: { drift: 1.2, ghostly: 2.0, count: 1.5 } },
    sound: {
      layers: [
        {
          type: 'rumble',
          attack: 0.01,
          decay: 0.9,
          gain: 0.5,
          filter: null,          // Rust Option::None → null
          osc: { type: 'sine', freq: 70, freqEnd: 35 },
          noiseColor: null,
          delay: 0,
        },
        {
          type: 'tone',
          attack: 0.004,
          decay: 1.5,
          gain: 0.25,
          filter: null,
          osc: { type: 'sine', freq: 130, freqEnd: null },  // 嵌套 null
          noiseColor: null,
          delay: 0,
        },
      ],
      masterGain: 0.8,
    },
    palette: { bodyGradient: ['#d0d0d8', '#70707c'], particleHue: 240 },
  };

  it('解析 Rust 真实形状（含 null Option）', () => {
    const parsed = MaterialPackSchema.parse(rustPayload);
    expect(parsed.id).toBe('skull');
    expect(parsed.sound.layers[0].filter).toBeUndefined();
    expect(parsed.sound.layers[1].osc?.freqEnd).toBeUndefined();
    expect(parsed.sound.layers[0].noiseColor).toBeUndefined();
  });

  it('解析 pack.json 磁盘原始形状', () => {
    const diskShape = JSON.parse(rawSkull);
    const parsed = MaterialPackSchema.parse({
      id: diskShape.id,
      name: diskShape.name,
      builtin: true,
      imageFile: diskShape.icon,
      dataUri: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      effect: diskShape.effect,
      sound: diskShape.sound,
      palette: diskShape.palette,
    });
    expect(parsed.id).toBe('skull');
    expect(parsed.effect.preset).toBe('burst');
  });

  it('缺省字段（Rust 显式 null 之外的形态）也接受', () => {
    const partialLayer = {
      ...rustPayload,
      sound: {
        layers: [
          { type: 'noise', attack: 0.01, decay: 0.3, gain: 0.5, filter: null, osc: null, noiseColor: null, delay: 0 },
        ],
        masterGain: 0.8,
      },
    };
    const parsed = MaterialPackSchema.parse(partialLayer);
    expect(parsed.sound.layers[0].osc).toBeUndefined();
  });

  it('全部 30 个 pack.json 都能被 schema 解析', () => {
    const fs = require('node:fs');
    const ids = fs.readdirSync(packsDir).filter((d: string) => fs.statSync(`${packsDir}/${d}`).isDirectory());
    expect(ids.length).toBeGreaterThanOrEqual(30);
    for (const id of ids) {
      const disk = JSON.parse(fs.readFileSync(`${packsDir}/${id}/pack.json`, 'utf-8'));
      const parsed = MaterialPackSchema.parse({
        id: disk.id,
        name: disk.name,
        builtin: true,
        imageFile: disk.icon,
        dataUri: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
        effect: disk.effect,
        sound: disk.sound,
        palette: disk.palette,
      });
      expect(parsed.id).toBe(id);
    }
  });
});
