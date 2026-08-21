import type {
  BuiltinPackId,
  EffectPresetId,
  SoundLayer,
  SoundRecipe,
} from '../shared/material-packs';
import { WHIP_CRACK_IMPACT_SECONDS } from './effect-timings';

export type AcousticFamily =
  | 'weather' | 'element' | 'weapon' | 'impact' | 'instrument'
  | 'creature' | 'cosmic' | 'ritual';

export type SoundStage = 'launch' | 'travel' | 'impact' | 'burst' | 'tail' | 'ambient';

export type AcousticVoice =
  | 'wind-bed' | 'rain-bed' | 'rain-drops' | 'fire-bed' | 'water-splash'
  | 'electric-arc' | 'thunder-crack' | 'thunder-roll' | 'rocket-thrust'
  | 'whoosh' | 'blast' | 'gunshot' | 'glass-impact' | 'glass-shards'
  | 'body-hit' | 'whip-crack' | 'metal-hit' | 'wood-hit' | 'bone-break'
  | 'creature-call' | 'sparkle' | 'piano-key' | 'string-pluck' | 'harp-pluck'
  | 'bell-strike' | 'reed-note' | 'brass-note' | 'drum-hit' | 'vinyl-bed'
  | 'celestial-tone';

export interface AcousticEvent {
  voice: AcousticVoice;
  stage: SoundStage;
  at: number;
  duration: number;
  gain: number;
  frequency?: number;
  endFrequency?: number;
  pan?: number;
  spread?: number;
  pulses?: number;
}

export interface SemanticSoundPlan {
  packId: string;
  family: AcousticFamily;
  masterGain: number;
  events: AcousticEvent[];
}

type Template = Omit<SemanticSoundPlan, 'packId' | 'masterGain'>;
const e = (
  voice: AcousticVoice, stage: SoundStage, at: number, duration: number,
  gain: number, frequency?: number, endFrequency?: number,
  extra: Pick<AcousticEvent, 'pan' | 'spread' | 'pulses'> = {},
): AcousticEvent => ({ voice, stage, at, duration, gain, frequency, endFrequency, ...extra });
const t = (family: AcousticFamily, ...events: AcousticEvent[]): Template => ({ family, events });

const TEMPLATES: Record<BuiltinPackId, Template> = {
  rocket: t('cosmic', e('rocket-thrust', 'launch', 0, 1.15, .72, 58, 34), e('whoosh', 'travel', .08, .95, .38, 520, 180)),
  phoenix: t('creature', e('creature-call', 'launch', 0, .8, .42, 520, 760), e('whoosh', 'travel', .08, 1.05, .4, 900, 260), e('fire-bed', 'tail', .25, 1.35, .38)),
  lightning: t('weather', e('electric-arc', 'impact', 0, .18, .88, 6200, 1900, { pulses: 7, spread: .8 }), e('electric-arc', 'tail', .2, .12, .36, 4800, 1500, { pulses: 3 })),
  dragon: t('creature', e('creature-call', 'burst', 0, 1.3, .7, 92, 58), e('fire-bed', 'tail', .32, 1.25, .42)),
  'ninja-star': t('weapon', e('whoosh', 'travel', 0, .3, .5, 1300, 430), e('metal-hit', 'impact', .24, .8, .55, 1240)),
  katana: t('weapon', e('whoosh', 'travel', 0, .34, .72, 2400, 420), e('metal-hit', 'impact', .3, .9, .5, 1560)),
  crystal: t('element', e('glass-impact', 'impact', .08, .2, .62, 2600), e('glass-shards', 'tail', .14, 1.25, .58, 3200, 1700, { pulses: 9, spread: .9 })),
  skull: t('ritual', e('bone-break', 'impact', .08, .45, .68, 520, 150), e('celestial-tone', 'tail', .18, .9, .22, 96, 54)),
  flame: t('element', e('fire-bed', 'ambient', 0, 1.55, .62), e('whoosh', 'travel', .1, .55, .28, 920, 260)),
  ice: t('element', e('glass-impact', 'impact', .08, .22, .6, 1850), e('glass-shards', 'tail', .13, 1.15, .5, 2800, 1450, { pulses: 8, spread: .86 })),
  thunder: t('weather', e('thunder-crack', 'impact', 0, .12, .94), e('thunder-roll', 'tail', .09, 1.2, .68, 62, 31), e('thunder-roll', 'tail', .55, 1.55, .5, 49, 25, { pan: -.35 }), e('thunder-roll', 'tail', 1.12, 1.7, .36, 42, 22, { pan: .4 })),
  water: t('element', e('water-splash', 'impact', .06, .75, .66, 1500, 420), e('rain-drops', 'tail', .28, 1.1, .28, 2200, 740, { pulses: 7, spread: .7 })),
  wind: t('weather', e('wind-bed', 'ambient', 0, 1.6, .58, 900, 260, { spread: .9 }), e('whoosh', 'travel', .16, .75, .34, 1300, 310)),
  star: t('cosmic', e('sparkle', 'burst', 0, 1.2, .52, 1760, 880, { pulses: 7, spread: .85 })),
  moon: t('cosmic', e('celestial-tone', 'ambient', 0, 1.6, .42, 146.83, 144), e('sparkle', 'tail', .35, .8, .18, 1174.66, 880, { pulses: 3 })),
  sun: t('cosmic', e('celestial-tone', 'ambient', 0, 1.65, .55, 55, 82.41), e('fire-bed', 'tail', .12, 1.3, .25)),
  meteor: t('cosmic', e('whoosh', 'travel', 0, .72, .58, 1800, 170), e('blast', 'impact', .56, 1.2, .72, 82, 28)),
  comet: t('cosmic', e('whoosh', 'travel', 0, 1.05, .48, 1250, 220), e('sparkle', 'tail', .42, 1.05, .25, 1480, 740, { pulses: 5 })),
  guitar: t('instrument', e('string-pluck', 'impact', 0, 1.3, .55, 329.63), e('string-pluck', 'tail', .055, 1.2, .38, 415.3), e('string-pluck', 'tail', .11, 1.15, .32, 493.88)),
  drum: t('instrument', e('drum-hit', 'impact', .04, .78, .86, 118, 42), e('drum-hit', 'tail', .42, .6, .44, 92, 38)),
  bell: t('instrument', e('bell-strike', 'impact', .04, 1.75, .68, 1046.5), e('bell-strike', 'tail', .34, 1.35, .28, 1318.51)),
  harp: t('instrument', e('harp-pluck', 'impact', 0, 1.4, .46, 659.25), e('harp-pluck', 'tail', .1, 1.3, .4, 880), e('harp-pluck', 'tail', .2, 1.2, .34, 1046.5)),
  trumpet: t('instrument', e('brass-note', 'launch', .03, 1.2, .56, 440), e('brass-note', 'tail', .44, 1.0, .38, 523.25)),
  bow: t('weapon', e('string-pluck', 'launch', 0, .42, .42, 196), e('whoosh', 'travel', .06, .55, .5, 1500, 320), e('wood-hit', 'impact', .46, .48, .38, 620, 180)),
  shield: t('weapon', e('metal-hit', 'impact', .14, 1.35, .76, 196), e('thunder-roll', 'tail', .2, .72, .3, 78, 38)),
  axe: t('weapon', e('whoosh', 'travel', 0, .32, .44, 920, 260), e('wood-hit', 'impact', .27, .68, .72, 460, 125)),
  spear: t('weapon', e('whoosh', 'travel', 0, .42, .6, 1700, 360), e('wood-hit', 'impact', .37, .52, .46, 760, 210)),
  bomb: t('impact', e('fire-bed', 'launch', 0, .1, .22), e('blast', 'burst', .096, 1.5, .92, 92, 24), e('glass-shards', 'tail', .18, .75, .28, 1800, 620, { pulses: 6, spread: .8 })),
  lotus: t('ritual', e('water-splash', 'impact', 0, .55, .34, 1200, 380), e('harp-pluck', 'tail', .2, 1.2, .32, 523.25), e('harp-pluck', 'tail', .38, 1.05, .24, 783.99)),
  aurora: t('cosmic', e('celestial-tone', 'ambient', 0, 1.8, .38, 110, 164.81), e('wind-bed', 'tail', .1, 1.5, .18, 720, 280, { spread: .8 })),
  tornado: t('weather', e('wind-bed', 'ambient', 0, 1.85, .72, 980, 180, { spread: 1 }), e('thunder-roll', 'tail', .18, 1.65, .42, 58, 27), e('whoosh', 'travel', .2, 1.2, .35, 1500, 180)),
  downpour: t('weather', e('rain-bed', 'ambient', 0, 2.25, .72, 2200, 650, { spread: 1 }), e('rain-drops', 'impact', .06, 2.05, .42, 3400, 900, { pulses: 16, spread: 1 })),
  wildfire: t('element', e('fire-bed', 'ambient', 0, 1.85, .68), e('wood-hit', 'impact', .18, .32, .28, 2800, 1100), e('wood-hit', 'tail', .72, .38, .2, 2200, 760)),
  revolver: t('weapon', e('gunshot', 'burst', 0, .55, .94, 105, 32), e('metal-hit', 'tail', .04, .5, .24, 2600)),
  'glass-shot': t('weapon', e('glass-impact', 'impact', 0, .2, .76, 2700), e('glass-impact', 'burst', .186, .16, .4, 4100, 1900), e('glass-shards', 'tail', .2, 1.25, .66, 4200, 1600, { pulses: 12, spread: 1 })),
  'boxing-glove': t('impact', e('whoosh', 'travel', 0, .27, .38, 680, 180), e('body-hit', 'impact', .289, .62, .9, 112, 38)),
  bullwhip: t('weapon', e('whoosh', 'travel', 0, .53, .48, 260, 3300, { pan: -.4 }), e('whip-crack', 'impact', WHIP_CRACK_IMPACT_SECONDS, .13, .96, 6200, 1800), e('wind-bed', 'tail', WHIP_CRACK_IMPACT_SECONDS + .02, .38, .18, 1200, 360)),
  piano: t('instrument', e('piano-key', 'impact', 0, 1.45, .5, 261.63), e('piano-key', 'tail', .055, 1.4, .42, 329.63), e('piano-key', 'tail', .11, 1.35, .38, 392)),
  saxophone: t('instrument', e('reed-note', 'launch', .04, 1.5, .52, 233.08), e('reed-note', 'tail', .55, 1.0, .3, 293.66)),
  vinyl: t('instrument', e('vinyl-bed', 'ambient', 0, 1.85, .44, 146.83), e('glass-impact', 'impact', .18, .08, .16, 5800), e('vinyl-bed', 'tail', .72, 1.0, .24, 164.81)),
  fireworks: t('impact', e('whoosh', 'launch', 0, .72, .4, 220, 1850), e('blast', 'burst', .741, 1.25, .86, 88, 27), e('sparkle', 'tail', .78, 1.1, .42, 3200, 1350, { pulses: 12, spread: 1 })),
  'black-hole': t('cosmic', e('celestial-tone', 'ambient', 0, 1.6, .48, 43.65, 28), e('whoosh', 'travel', .15, 1.35, .3, 120, 34, { spread: .9 })),
};

const PRESET_PACK: Partial<Record<EffectPresetId, BuiltinPackId>> = {
  downpour: 'downpour', tornado: 'tornado', wildfire: 'wildfire', gunshot: 'revolver',
  'glass-break': 'glass-shot', boxing: 'boxing-glove', 'whip-crack': 'bullwhip',
  'note-dance': 'piano', groove: 'vinyl', fireworks: 'fireworks',
  singularity: 'black-hole', 'drum-beat': 'drum',
};

const FALLBACK_VOICE: Record<SoundLayer['type'], AcousticVoice> = {
  noise: 'wind-bed', tone: 'celestial-tone', sweep: 'whoosh', impact: 'body-hit',
  chime: 'bell-strike', rumble: 'thunder-roll',
};

function fallbackTemplate(preset: EffectPresetId, recipe: SoundRecipe): Template {
  const semanticPack = PRESET_PACK[preset];
  if (semanticPack) return TEMPLATES[semanticPack];
  return t('impact', ...recipe.layers.map((layer) => e(
    FALLBACK_VOICE[layer.type], layer.type === 'sweep' ? 'travel' : 'impact',
    layer.delay ?? 0, Math.max(.03, layer.attack + layer.decay), layer.gain,
    layer.osc?.freq, layer.osc?.freqEnd,
  )));
}

export function createSemanticSoundPlan(
  packId: string, preset: EffectPresetId, recipe: SoundRecipe,
): SemanticSoundPlan {
  const template = TEMPLATES[packId as BuiltinPackId] ?? fallbackTemplate(preset, recipe);
  return {
    packId,
    family: template.family,
    masterGain: Math.min(.9, Math.max(0, recipe.masterGain)),
    events: template.events.map((event) => ({ ...event })),
  };
}

export function semanticFamilyForPack(packId: BuiltinPackId): AcousticFamily {
  return TEMPLATES[packId].family;
}

export function pitchVariationLimit(voice: AcousticVoice): number {
  if (voice === 'vinyl-bed') return 6;
  if (['piano-key', 'string-pluck', 'harp-pluck', 'bell-strike', 'reed-note', 'brass-note', 'drum-hit'].includes(voice)) return 3;
  return 14;
}

export function varyFrequency(base: number, cents: number, unitRandom: number): number {
  const bounded = Math.max(-1, Math.min(1, unitRandom * 2 - 1));
  return base * 2 ** ((bounded * Math.max(0, cents)) / 1200);
}
