import { describe, expect, it } from 'vitest';
import type { MaterialPack } from '../shared/material-packs';
import {
  familyCounts,
  familyForPack,
  matchesPack,
  soundSignature,
  sortPacks,
} from '../settings/components/material-pack-display';

function pack(id: string, name = id, builtin = true): MaterialPack {
  return {
    id, name, builtin, imageFile: `${id}.png`, dataUri: 'data:image/png;base64,AA==',
    effect: { preset: 'impact', params: {} },
    sound: { masterGain: 0.8, layers: [{ type: 'impact', attack: 0.01, decay: 0.3, gain: 0.8, delay: 0 }] },
    palette: { bodyGradient: ['#111111', '#222222'], particleHue: 20 },
  };
}

describe('素材系列显示映射', () => {
  it('将内置素材按 id 归入既有系列', () => {
    expect(familyForPack(pack('tornado'))).toBe('nature');
    expect(familyForPack(pack('piano'))).toBe('instrument');
    expect(familyForPack(pack('revolver'))).toBe('weapon');
    expect(familyForPack(pack('boxing-glove'))).toBe('daily');
    expect(familyForPack(pack('black-hole'))).toBe('cosmic');
    expect(familyForPack(pack('phoenix'))).toBe('myth');
    expect(familyForPack(pack('unknown-builtin'))).toBe('other');
  });

  it('用户上传的素材一律归入「我的素材」，即使 id 命中内置白名单', () => {
    expect(familyForPack(pack('my-scene-l3k9', '我的场景', false))).toBe('custom');
    expect(familyForPack(pack('rocket', '我的火箭', false))).toBe('custom');
    expect(familyForPack(pack('phoenix', '我的凤凰', false))).toBe('custom');
  });

  it('「我的素材」筛选只命中自定义素材', () => {
    const custom = pack('my-scene-l3k9', '我的场景', false);
    const builtin = pack('tornado', '龙卷风');
    expect(matchesPack(custom, '', 'custom')).toBe(true);
    expect(matchesPack(custom, '', 'other')).toBe(false);
    expect(matchesPack(builtin, '', 'custom')).toBe(false);
    expect(matchesPack(custom, '我的', 'custom')).toBe(true);
  });

  it('按系列和中文/英文搜索词过滤，并生成计数', () => {
    const packs = [pack('tornado', '龙卷风'), pack('piano', '钢琴'), pack('my-scene-l3k9', '我的场景', false)];
    expect(matchesPack(packs[0], '龙卷', 'nature')).toBe(true);
    expect(matchesPack(packs[0], '钢琴', 'nature')).toBe(false);
    expect(matchesPack(packs[2], '', 'all')).toBe(true);
    expect(familyCounts(packs)).toMatchObject({ all: 3, nature: 1, instrument: 1, custom: 1, other: 0 });
  });

  it('从每个素材自己的声音配方生成紧凑音色指纹', () => {
    const audioPack = pack('fireworks');
    audioPack.sound.layers = [
      { type: 'sweep', attack: 0.01, decay: 0.3, gain: 0.4, delay: 0 },
      { type: 'impact', attack: 0.01, decay: 0.3, gain: 0.8, delay: 0 },
      { type: 'noise', attack: 0.01, decay: 0.3, gain: 0.5, delay: 0 },
      { type: 'impact', attack: 0.01, decay: 0.3, gain: 0.2, delay: 0 },
    ];
    expect(soundSignature(audioPack.sound)).toBe('扫频 / 冲击 / 噪声');
  });
});

describe('sortPacks 自定义素材置顶', () => {
  it('把用户上传的素材排到最前', () => {
    const packs = [pack('rocket'), pack('tornado'), pack('mine-a', '我的 A', false)];
    expect(sortPacks(packs).map((item) => item.id)).toEqual(['mine-a', 'rocket', 'tornado']);
  });

  it('保持内置素材之间的原有相对顺序（稳定排序）', () => {
    const packs = [pack('rocket'), pack('tornado'), pack('mine-a', '我的 A', false), pack('piano'), pack('mine-b', '我的 B', false)];
    expect(sortPacks(packs).map((item) => item.id)).toEqual(['mine-a', 'mine-b', 'rocket', 'tornado', 'piano']);
  });

  it('不修改入参数组', () => {
    const packs = [pack('rocket'), pack('mine-a', '我的 A', false)];
    const snapshot = packs.map((item) => item.id);
    const sorted = sortPacks(packs);
    expect(packs.map((item) => item.id)).toEqual(snapshot);
    expect(sorted).not.toBe(packs);
  });

  it('全部为内置素材时顺序完全不变', () => {
    const packs = [pack('rocket'), pack('tornado'), pack('piano')];
    expect(sortPacks(packs).map((item) => item.id)).toEqual(['rocket', 'tornado', 'piano']);
  });
});
