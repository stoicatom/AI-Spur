import { describe, expect, it } from 'vitest';
import { BUILTIN_PACK_IDS, type EffectPresetId, type SoundRecipe } from '../shared/material-packs';
import {
  createSemanticSoundPlan,
  pitchVariationLimit,
  semanticFamilyForPack,
  varyFrequency,
  type AcousticVoice,
} from '../overlay/audio-semantics';
import { getAcousticVoiceModel } from '../overlay/audio-voice-models';
import { WHIP_CRACK_IMPACT_SECONDS } from '../overlay/effect-timings';

const RECIPE: SoundRecipe = {
  masterGain: .8,
  layers: [{ type: 'impact', attack: .01, decay: .4, gain: .7, delay: 0 }],
};

function plan(id: string, preset: EffectPresetId = 'impact') {
  return createSemanticSoundPlan(id, preset, RECIPE);
}

function event(id: string, voice: AcousticVoice) {
  return plan(id).events.find((candidate) => candidate.voice === voice);
}

describe('素材语义声音计划', () => {
  it('穷举覆盖全部 42 个内置素材且每项都有有效声学阶段', () => {
    expect(BUILTIN_PACK_IDS).toHaveLength(42);
    for (const id of BUILTIN_PACK_IDS) {
      const result = plan(id);
      expect(result.packId).toBe(id);
      expect(result.family).toBe(semanticFamilyForPack(id));
      expect(result.events.length).toBeGreaterThan(0);
      expect(result.events.every((item) => item.at >= 0 && item.duration > 0)).toBe(true);
    }
  });

  it('让暴雨占满声场，并叠加持续的近场滴溅', () => {
    const bed = event('downpour', 'rain-bed');
    const drops = event('downpour', 'rain-drops');
    expect(bed).toMatchObject({ stage: 'ambient', at: 0, spread: 1 });
    expect(bed?.duration).toBeGreaterThanOrEqual(2.2);
    expect(drops).toMatchObject({ stage: 'impact', spread: 1 });
    expect(drops?.pulses).toBeGreaterThanOrEqual(16);
    expect(drops?.duration).toBeGreaterThan(2);
  });

  it('将雷声拆成霹雳瞬态和三段错开的滚雷尾', () => {
    const result = plan('thunder');
    const crack = result.events.find((item) => item.voice === 'thunder-crack');
    const rolls = result.events.filter((item) => item.voice === 'thunder-roll');
    expect(crack).toMatchObject({ stage: 'impact', at: 0 });
    expect(crack?.duration).toBeLessThan(.15);
    expect(rolls).toHaveLength(3);
    expect(rolls.map((item) => item.at)).toEqual([.09, .55, 1.12]);
    expect(Math.max(...rolls.map((item) => item.at + item.duration))).toBeGreaterThan(2.7);
  });

  it('让闪电使用多脉冲电弧而不是低频雷鸣替身', () => {
    const arcs = plan('lightning').events;
    expect(arcs.every((item) => item.voice === 'electric-arc')).toBe(true);
    expect(arcs[0]).toMatchObject({ stage: 'impact', at: 0, pulses: 7 });
    expect(arcs[0].frequency).toBeGreaterThan(5000);
  });

  it('严格匹配烟花、长鞭和拳击的视觉冲击时刻', () => {
    expect(event('fireworks', 'blast')?.at).toBeCloseTo(.741, 3);
    expect(event('bullwhip', 'whip-crack')?.at).toBeCloseTo(WHIP_CRACK_IMPACT_SECONDS, 3);
    expect(event('boxing-glove', 'body-hit')?.at).toBeCloseTo(.289, 3);
  });

  it('为枪击、玻璃、炸弹建立发射/冲击/碎片阶段', () => {
    expect(plan('revolver').events.map((item) => item.voice)).toEqual(['gunshot', 'metal-hit']);
    expect(plan('glass-shot').events.map((item) => item.stage)).toEqual(['impact', 'burst', 'tail']);
    expect(plan('bomb').events.map((item) => item.stage)).toEqual(['launch', 'burst', 'tail']);
    expect(event('glass-shot', 'glass-shards')?.pulses).toBeGreaterThanOrEqual(12);
  });

  it('八类乐器采用专属发声模型并把随机音高限制在 6 cents 内', () => {
    const instruments: [string, AcousticVoice][] = [
      ['piano', 'piano-key'], ['saxophone', 'reed-note'], ['drum', 'drum-hit'],
      ['guitar', 'string-pluck'], ['harp', 'harp-pluck'], ['bell', 'bell-strike'],
      ['trumpet', 'brass-note'], ['vinyl', 'vinyl-bed'],
    ];
    for (const [id, voice] of instruments) {
      expect(plan(id).family).toBe('instrument');
      expect(plan(id).events.some((item) => item.voice === voice)).toBe(true);
      expect(pitchVariationLimit(voice)).toBeLessThanOrEqual(6);
      expect(getAcousticVoiceModel(voice).pitchCents).toBe(pitchVariationLimit(voice));
      const base = 440;
      const lower = varyFrequency(base, pitchVariationLimit(voice), 0);
      const upper = varyFrequency(base, pitchVariationLimit(voice), 1);
      expect(Math.abs(1200 * Math.log2(lower / base))).toBeLessThanOrEqual(6.001);
      expect(Math.abs(1200 * Math.log2(upper / base))).toBeLessThanOrEqual(6.001);
    }
  });

  it('未知素材仍按特效预设选语义模型，并保留配方主音量', () => {
    const result = createSemanticSoundPlan('custom-storm', 'downpour', { ...RECIPE, masterGain: .63 });
    expect(result.masterGain).toBe(.63);
    expect(result.family).toBe('weather');
    expect(result.events.some((item) => item.voice === 'rain-bed')).toBe(true);
  });
});
