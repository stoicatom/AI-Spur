import { describe, expect, it } from 'vitest';
import type { MaterialPack } from '../shared/material-packs';
import { familyCounts, familyForPack, matchesPack, soundSignature } from '../settings/components/material-pack-display';

function pack(id: string, name = id): MaterialPack {
  return {
    id, name, builtin: true, imageFile: `${id}.png`, dataUri: 'data:image/png;base64,AA==',
    effect: { preset: 'impact', params: {} },
    sound: { masterGain: 0.8, layers: [{ type: 'impact', attack: 0.01, decay: 0.3, gain: 0.8, delay: 0 }] },
    palette: { bodyGradient: ['#111111', '#222222'], particleHue: 20 },
  };
}

describe('素材系列显示映射', () => {
  it('将新增和既有素材归入不同系列', () => {
    expect(familyForPack('tornado')).toBe('nature');
    expect(familyForPack('piano')).toBe('instrument');
    expect(familyForPack('revolver')).toBe('weapon');
    expect(familyForPack('boxing-glove')).toBe('daily');
    expect(familyForPack('black-hole')).toBe('cosmic');
    expect(familyForPack('phoenix')).toBe('myth');
    expect(familyForPack('custom-scene')).toBe('other');
  });

  it('按系列和中文/英文搜索词过滤，并生成计数', () => {
    const packs = [pack('tornado', '龙卷风'), pack('piano', '钢琴'), pack('custom-scene', '我的场景')];
    expect(matchesPack(packs[0], '龙卷', 'nature')).toBe(true);
    expect(matchesPack(packs[0], '钢琴', 'nature')).toBe(false);
    expect(matchesPack(packs[2], '', 'all')).toBe(true);
    expect(familyCounts(packs)).toMatchObject({ all: 3, nature: 1, instrument: 1, other: 1 });
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
