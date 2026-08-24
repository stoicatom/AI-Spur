import type { AcousticVoice } from './audio-semantics';

export interface AcousticVoiceModel {
  source: 'noise' | 'tone' | 'hybrid' | 'pulses';
  noiseColor?: 'white' | 'pink';
  noiseLevel?: number;
  oscillator?: OscillatorType;
  frequency: number;
  endFrequency?: number;
  harmonics: readonly (readonly [ratio: number, gain: number])[];
  filter: BiquadFilterType;
  filterFrequency: number;
  endFilterFrequency?: number;
  q: number;
  attack: number;
  hold: number;
  drive: number;
  echoTime: number;
  echoMix: number;
  echoFeedback: number;
  pitchCents: number;
  copies?: number;
  defaultPulses?: number;
}

const h = (...values: readonly (readonly [number, number])[]) => values;
const model = (
  source: AcousticVoiceModel['source'], frequency: number,
  overrides: Partial<AcousticVoiceModel> = {},
): AcousticVoiceModel => ({
  source, frequency, harmonics: h([1, 1]), filter: 'lowpass', filterFrequency: 12000,
  q: .7, attack: .004, hold: 0, drive: 0, echoTime: 0, echoMix: 0,
  echoFeedback: 0, pitchCents: 14, ...overrides,
});

const MODELS: Record<AcousticVoice, AcousticVoiceModel> = {
  'wind-bed': model('noise', 0, {
    noiseColor: 'pink', noiseLevel: 1, filter: 'bandpass', filterFrequency: 980,
    endFilterFrequency: 260, q: .55, attack: .14, hold: .42, copies: 2,
  }),
  'rain-bed': model('noise', 0, {
    noiseColor: 'white', noiseLevel: 1, filter: 'highpass', filterFrequency: 1700,
    endFilterFrequency: 820, q: .65, attack: .035, hold: .72, copies: 2,
  }),
  'rain-drops': model('pulses', 0, {
    noiseColor: 'white', noiseLevel: 1, oscillator: 'sine', harmonics: h([1, .12]),
    filter: 'highpass', filterFrequency: 3600,
    endFilterFrequency: 1100, q: 1.4, attack: .001, drive: .08, defaultPulses: 12,
  }),
  'fire-bed': model('noise', 0, {
    noiseColor: 'pink', noiseLevel: 1, filter: 'bandpass', filterFrequency: 1350,
    endFilterFrequency: 420, q: .8, attack: .035, hold: .6, drive: .18, copies: 2,
  }),
  'water-splash': model('hybrid', 940, {
    noiseColor: 'white', noiseLevel: .82, oscillator: 'sine', endFrequency: 230,
    harmonics: h([1, .25]), filter: 'bandpass', filterFrequency: 1650,
    endFilterFrequency: 430, q: .9, attack: .003, drive: .05,
  }),
  'electric-arc': model('pulses', 0, {
    noiseColor: 'white', noiseLevel: 1, filter: 'highpass', filterFrequency: 5600,
    endFilterFrequency: 1800, q: 1.8, attack: .0008, drive: .42, defaultPulses: 6,
  }),
  'thunder-crack': model('hybrid', 96, {
    noiseColor: 'white', noiseLevel: 1, oscillator: 'square', endFrequency: 38,
    harmonics: h([1, .52], [2.03, .18]), filter: 'lowpass', filterFrequency: 6800,
    endFilterFrequency: 420, q: .65, attack: .001, drive: .74,
  }),
  'thunder-roll': model('hybrid', 52, {
    noiseColor: 'pink', noiseLevel: .62, oscillator: 'sine', endFrequency: 24,
    harmonics: h([1, .8], [.5, .22], [1.51, .1]), filter: 'lowpass',
    filterFrequency: 680, endFilterFrequency: 140, q: .55, attack: .045,
    hold: .22, drive: .48, echoTime: .13, echoMix: .24, echoFeedback: .28,
  }),
  'rocket-thrust': model('hybrid', 62, {
    noiseColor: 'pink', noiseLevel: .82, oscillator: 'sawtooth', endFrequency: 34,
    harmonics: h([1, .5], [2, .14]), filter: 'lowpass', filterFrequency: 1800,
    endFilterFrequency: 320, q: .65, attack: .06, hold: .6, drive: .45, copies: 2,
  }),
  whoosh: model('noise', 0, {
    noiseColor: 'white', noiseLevel: 1, filter: 'bandpass', filterFrequency: 1600,
    endFilterFrequency: 280, q: 1.05, attack: .025, hold: .25, drive: .08,
  }),
  blast: model('hybrid', 86, {
    noiseColor: 'white', noiseLevel: .9, oscillator: 'sine', endFrequency: 24,
    harmonics: h([1, .8], [.5, .28], [2.6, .1]), filter: 'lowpass',
    filterFrequency: 4200, endFilterFrequency: 170, q: .55, attack: .001,
    hold: .018, drive: .82, echoTime: .095, echoMix: .25, echoFeedback: .3,
  }),
  gunshot: model('hybrid', 112, {
    noiseColor: 'white', noiseLevel: 1, oscillator: 'sine', endFrequency: 32,
    harmonics: h([1, .64], [2.5, .12]), filter: 'lowpass', filterFrequency: 6800,
    endFilterFrequency: 280, q: .7, attack: .0008, hold: .01, drive: .9,
    echoTime: .07, echoMix: .22, echoFeedback: .18,
  }),
  'glass-impact': model('hybrid', 2520, {
    noiseColor: 'white', noiseLevel: .66, oscillator: 'triangle', endFrequency: 1540,
    harmonics: h([1, .46], [1.43, .24], [2.17, .13]), filter: 'lowpass',
    filterFrequency: 7200, endFilterFrequency: 1100, q: 1.2, attack: .001,
    drive: .16, echoTime: .045, echoMix: .2, echoFeedback: .16,
  }),
  'glass-shards': model('pulses', 3400, {
    noiseColor: 'white', noiseLevel: .82, oscillator: 'sine', harmonics: h([1, .28]),
    filter: 'highpass', filterFrequency: 4200, endFilterFrequency: 1350, q: 1.1,
    attack: .001, echoTime: .06, echoMix: .18, echoFeedback: .15, defaultPulses: 9,
  }),
  'body-hit': model('hybrid', 108, {
    noiseColor: 'pink', noiseLevel: .7, oscillator: 'sine', endFrequency: 36,
    harmonics: h([1, .82], [1.8, .12]), filter: 'lowpass', filterFrequency: 1500,
    endFilterFrequency: 180, q: .62, attack: .001, hold: .012, drive: .58,
  }),
  'whip-crack': model('hybrid', 2100, {
    noiseColor: 'white', noiseLevel: 1, oscillator: 'square', endFrequency: 840,
    harmonics: h([1, .22]), filter: 'highpass', filterFrequency: 5200,
    endFilterFrequency: 1700, q: .8, attack: .0005, drive: .88,
  }),
  'metal-hit': model('hybrid', 780, {
    noiseColor: 'white', noiseLevel: .22, oscillator: 'triangle', harmonics: h([1, .55], [1.41, .32], [2.32, .17], [3.9, .08]),
    filter: 'bandpass', filterFrequency: 2300, endFilterFrequency: 820, q: 1.5,
    attack: .001, echoTime: .065, echoMix: .26, echoFeedback: .2,
  }),
  'wood-hit': model('hybrid', 310, {
    noiseColor: 'pink', noiseLevel: .55, oscillator: 'triangle', endFrequency: 118,
    harmonics: h([1, .62], [2.4, .16]), filter: 'lowpass', filterFrequency: 2400,
    endFilterFrequency: 240, q: 1.1, attack: .001, drive: .24,
  }),
  'bone-break': model('hybrid', 480, {
    noiseColor: 'white', noiseLevel: .6, oscillator: 'triangle', endFrequency: 145,
    harmonics: h([1, .45], [2.8, .18]), filter: 'lowpass', filterFrequency: 3200,
    endFilterFrequency: 380, q: 1.2, attack: .001, drive: .3,
  }),
  'creature-call': model('hybrid', 120, {
    noiseColor: 'pink', noiseLevel: .28, oscillator: 'sawtooth', endFrequency: 72,
    harmonics: h([1, .52], [2, .2], [3, .11], [4, .06]), filter: 'lowpass',
    filterFrequency: 2100, endFilterFrequency: 720, q: 1.2, attack: .08,
    hold: .3, drive: .24, echoTime: .11, echoMix: .18, echoFeedback: .2,
  }),
  sparkle: model('pulses', 1800, {
    oscillator: 'sine', harmonics: h([1, .5], [2.01, .18]), filter: 'highpass',
    filterFrequency: 1600, endFilterFrequency: 900, q: .8, attack: .001,
    echoTime: .075, echoMix: .25, echoFeedback: .2, defaultPulses: 6,
  }),
  'piano-key': model('tone', 261.63, {
    oscillator: 'triangle', harmonics: h([1, .68], [2, .22], [3, .09], [4, .04]),
    filter: 'lowpass', filterFrequency: 4300, endFilterFrequency: 900, q: .8,
    attack: .003, echoTime: .055, echoMix: .16, echoFeedback: .12, pitchCents: 3,
  }),
  'string-pluck': model('tone', 329.63, {
    oscillator: 'sawtooth', harmonics: h([1, .42], [2, .2], [3, .1], [4, .06]),
    filter: 'bandpass', filterFrequency: 1850, endFilterFrequency: 620, q: 2.2,
    attack: .002, echoTime: .045, echoMix: .18, echoFeedback: .14, pitchCents: 3,
  }),
  'harp-pluck': model('tone', 659.25, {
    oscillator: 'triangle', harmonics: h([1, .58], [2, .2], [3, .08], [4, .04]),
    filter: 'lowpass', filterFrequency: 5200, endFilterFrequency: 1100, q: .8,
    attack: .002, echoTime: .09, echoMix: .3, echoFeedback: .22, pitchCents: 3,
  }),
  'bell-strike': model('tone', 1046.5, {
    oscillator: 'sine', harmonics: h([1, .52], [2.01, .23], [2.71, .15], [4.08, .08]),
    filter: 'highpass', filterFrequency: 480, q: .65, attack: .001,
    echoTime: .13, echoMix: .34, echoFeedback: .28, pitchCents: 3,
  }),
  'reed-note': model('hybrid', 233.08, {
    noiseColor: 'pink', noiseLevel: .1, oscillator: 'sawtooth', harmonics: h([1, .4], [2, .22], [3, .14], [4, .08]),
    filter: 'bandpass', filterFrequency: 1300, endFilterFrequency: 820, q: 1.7,
    attack: .045, hold: .52, drive: .12, pitchCents: 3,
  }),
  'brass-note': model('tone', 440, {
    oscillator: 'sawtooth', harmonics: h([1, .34], [2, .28], [3, .17], [4, .09], [5, .04]),
    filter: 'bandpass', filterFrequency: 1450, endFilterFrequency: 980, q: 1.45,
    attack: .035, hold: .5, drive: .2, pitchCents: 3,
  }),
  'drum-hit': model('hybrid', 112, {
    noiseColor: 'white', noiseLevel: .34, oscillator: 'sine', endFrequency: 38,
    harmonics: h([1, .82], [1.5, .11]), filter: 'lowpass', filterFrequency: 3200,
    endFilterFrequency: 260, q: .7, attack: .001, drive: .42, pitchCents: 3,
  }),
  'vinyl-bed': model('hybrid', 146.83, {
    noiseColor: 'pink', noiseLevel: .38, oscillator: 'triangle', harmonics: h([1, .28], [2, .08]),
    filter: 'lowpass', filterFrequency: 3600, endFilterFrequency: 1300, q: .65,
    attack: .025, hold: .65, drive: .05, pitchCents: 6,
  }),
  'celestial-tone': model('tone', 110, {
    oscillator: 'sine', harmonics: h([1, .55], [1.5, .14], [2, .1]),
    filter: 'lowpass', filterFrequency: 2200, endFilterFrequency: 680, q: .7,
    attack: .12, hold: .45, echoTime: .15, echoMix: .3, echoFeedback: .28,
  }),
};

export function getAcousticVoiceModel(voice: AcousticVoice): AcousticVoiceModel {
  return MODELS[voice];
}
