import { describe, it, expect } from 'vitest';
import { MaterialPackSchema, EffectPresetSchema, SoundRecipeSchema } from '../../shared/material-packs';

describe('Material Pack IPC contract', () => {
  describe('list_packs response', () => {
    const validPack = {
      id: 'rocket',
      name: '火箭',
      builtin: true,
      imageFile: 'icon.svg',
      dataUri: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      effect: { preset: 'jet', params: { thrust: 1.2 } },
      sound: {
        layers: [
          {
            type: 'noise',
            attack: 0.01,
            decay: 0.4,
            gain: 0.6,
            filter: { type: 'lowpass', freq: 3000, freqEnd: 400, q: 1 },
            osc: undefined,
            noiseColor: 'white',
            delay: 0,
          },
          {
            type: 'tone',
            attack: 0.005,
            decay: 0.3,
            gain: 0.4,
            osc: { type: 'sawtooth', freq: 220, freqEnd: 80 },
          },
        ],
        masterGain: 0.8,
      },
      palette: { bodyGradient: ['#FF4400', '#FF6A00'], particleHue: 24 },
    };

    it('解析合法素材包', () => {
      const parsed = MaterialPackSchema.parse(validPack);
      expect(parsed.id).toBe('rocket');
      expect(parsed.effect.preset).toBe('jet');
      expect(parsed.sound.layers).toHaveLength(2);
      expect(parsed.palette.particleHue).toBe(24);
    });

    it('拒绝未知特效预设', () => {
      const bad = { ...validPack, effect: { preset: 'not-a-preset', params: {} } };
      expect(() => MaterialPackSchema.parse(bad)).toThrow();
    });

    it('拒绝空声音层', () => {
      const bad = { ...validPack, sound: { layers: [], masterGain: 0.8 } };
      expect(() => MaterialPackSchema.parse(bad)).toThrow();
    });

    it('拒绝非法 id（大写/非法字符）', () => {
      const bad = { ...validPack, id: 'Rocket!' };
      expect(() => MaterialPackSchema.parse(bad)).toThrow();
    });

    it('拒绝越界粒子色相', () => {
      const bad = { ...validPack, palette: { bodyGradient: ['#FF4400', '#FF6A00'], particleHue: 400 } };
      expect(() => MaterialPackSchema.parse(bad)).toThrow();
    });

    it('拒绝非法颜色格式', () => {
      const bad = {
        ...validPack,
        palette: { bodyGradient: ['FF4400', '#FF6A00'], particleHue: 24 },
      };
      expect(() => MaterialPackSchema.parse(bad)).toThrow();
    });
  });

  describe('effect preset enum', () => {
    it('恰好 42 个预设', () => {
      expect(EffectPresetSchema.options).toHaveLength(42);
    });

    it('包含关键预设', () => {
      const ids = EffectPresetSchema.options as readonly string[];
      for (const id of ['jet', 'bolt', 'shatter', 'burst', 'shock-ring', 'explode']) {
        expect(ids).toContain(id);
      }
    });
  });

  describe('sound recipe', () => {
    it('解析六层以内的配方', () => {
      const recipe = {
        layers: [
          { type: 'noise', attack: 0.01, decay: 0.5, gain: 0.7, noiseColor: 'pink' },
          { type: 'chime', attack: 0.001, decay: 1.2, gain: 0.3, osc: { type: 'sine', freq: 880 } },
        ],
        masterGain: 0.7,
      };
      const parsed = SoundRecipeSchema.parse(recipe);
      expect(parsed.layers).toHaveLength(2);
    });

    it('兼容后端历史响应中的空采样字段', () => {
      const parsed = SoundRecipeSchema.parse({
        layers: [{ type: 'impact', attack: 0.01, decay: 0.3, gain: 0.8 }],
        sample: null,
        masterGain: 0.8,
      });

      expect(parsed.sample).toBeUndefined();
    });

    it('拒绝既没有采样也没有兼容层的声音', () => {
      expect(() => SoundRecipeSchema.parse({ layers: [], masterGain: 0.8 })).toThrow();
    });

    it('接受带来源元数据的真实采样', () => {
      const parsed = SoundRecipeSchema.parse({
        layers: [],
        sample: {
          file: 'sound.m4a',
          dataUri: 'data:audio/mp4;base64,AAAA',
          gain: 0.8,
          maxDuration: 2.5,
          sourceTitle: 'Recorded metal impact',
          sourceUrl: 'https://example.com/source',
          license: 'CC0',
        },
        masterGain: 0.9,
      });
      expect(parsed.sample?.file).toBe('sound.m4a');
      expect(parsed.layers).toEqual([]);
    });

    it('拒绝超过六层', () => {
      const layers = Array.from({ length: 7 }, () => ({
        type: 'noise',
        attack: 0.01,
        decay: 0.3,
        gain: 0.5,
      }));
      expect(() => SoundRecipeSchema.parse({ layers, masterGain: 0.8 })).toThrow();
    });

    it('拒绝越界增益', () => {
      const bad = {
        layers: [{ type: 'noise', attack: 0.01, decay: 0.3, gain: 1.5 }],
        masterGain: 0.8,
      };
      expect(() => SoundRecipeSchema.parse(bad)).toThrow();
    });
  });
});
