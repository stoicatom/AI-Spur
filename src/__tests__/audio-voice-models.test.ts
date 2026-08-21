import { describe, expect, it } from 'vitest';
import { distortionCurve } from '../overlay/audio-dsp';
import { getAcousticVoiceModel } from '../overlay/audio-voice-models';

describe('语义声音模型', () => {
  it('为自然、冲击和乐器声音提供不同的发声模型', () => {
    const rain = getAcousticVoiceModel('rain-bed');
    const thunder = getAcousticVoiceModel('thunder-crack');
    const piano = getAcousticVoiceModel('piano-key');
    expect(rain.source).toBe('noise');
    expect(thunder.source).toBe('hybrid');
    expect(piano.source).toBe('tone');
    expect(piano.pitchCents).toBeLessThanOrEqual(3);
    expect(thunder.drive).toBeGreaterThan(piano.drive);
  });

  it('为暴雨与碎玻璃提供密度明确的多脉冲模型', () => {
    expect(getAcousticVoiceModel('rain-drops').defaultPulses).toBeGreaterThanOrEqual(12);
    expect(getAcousticVoiceModel('glass-shards').defaultPulses).toBeGreaterThanOrEqual(9);
    expect(getAcousticVoiceModel('rain-bed').copies).toBe(2);
  });

  it('生成有界的线性或软削波曲线', () => {
    const curve = distortionCurve(.55, 33);
    expect(curve).toHaveLength(33);
    expect(curve[0]).toBeCloseTo(-1);
    expect(curve[curve.length - 1]).toBeCloseTo(1);
    expect([...curve].every((value) => value >= -1 && value <= 1)).toBe(true);
  });
});
