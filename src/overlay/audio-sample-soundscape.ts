import type { EffectPresetId } from '../shared/material-packs';
import { materialIdentityFor } from './material-identity';

export type SampleSoundscapeProfile = Readonly<{
  dry: number;
  body: number;
  presence: number;
  space: number;
  lowpass: number;
  highpass: number;
  leftDelay: number;
  rightDelay: number;
}>;

const HEAVY = new Set<EffectPresetId>([
  'burst', 'shock-ring', 'impact', 'explode', 'boxing', 'singularity', 'drum-beat',
]);
const SHARP = new Set<EffectPresetId>([
  'bolt', 'orbit', 'dash', 'shatter', 'shatter-ice', 'arc', 'gunshot', 'glass-break', 'whip-crack',
]);
const RHYTHM = new Set<EffectPresetId>([
  'pulse', 'ring', 'echo', 'note-dance', 'groove', 'drum-beat',
]);

const PROFILES = {
  heavy: { dry: 0.58, body: 0.23, presence: 0.12, space: 0.075, lowpass: 260, highpass: 2100, leftDelay: 0.026, rightDelay: 0.043 },
  sharp: { dry: 0.62, body: 0.13, presence: 0.2, space: 0.07, lowpass: 320, highpass: 1700, leftDelay: 0.021, rightDelay: 0.036 },
  rhythm: { dry: 0.66, body: 0.16, presence: 0.14, space: 0.085, lowpass: 300, highpass: 1900, leftDelay: 0.032, rightDelay: 0.052 },
  expansive: { dry: 0.6, body: 0.17, presence: 0.14, space: 0.09, lowpass: 280, highpass: 1850, leftDelay: 0.037, rightDelay: 0.059 },
} as const satisfies Record<string, SampleSoundscapeProfile>;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export function sampleSoundscapeProfileFor(
  preset: EffectPresetId, packId?: string,
): SampleSoundscapeProfile {
  const base = SHARP.has(preset) ? PROFILES.sharp
    : HEAVY.has(preset) ? PROFILES.heavy
      : RHYTHM.has(preset) ? PROFILES.rhythm : PROFILES.expansive;
  if (!packId) return base;
  const acoustic = materialIdentityFor(packId, preset).acoustic;
  const density = clamp(acoustic.density / 8, 0, 1);
  return {
    dry: clamp(base.dry + acoustic.absorption * .045 - acoustic.roughness * .035, .35, .78),
    body: clamp(base.body + density * .06 + acoustic.roughness * .1, .045, .34),
    presence: clamp(base.presence + acoustic.transient * .075 + (1 - acoustic.absorption) * .045, .05, .32),
    space: clamp(base.space + acoustic.spaceWidth * .018 - acoustic.absorption * .02, .035, .14),
    lowpass: clamp(base.lowpass + acoustic.resonanceHz * .08 - acoustic.roughness * 460, 160, 12000),
    highpass: clamp(base.highpass + acoustic.resonanceHz * .18 + (1 - acoustic.absorption) * 420, 120, 12000),
    leftDelay: clamp(base.leftDelay * (.82 + acoustic.spaceWidth * .24), .012, .075),
    rightDelay: clamp(base.rightDelay * (.82 + acoustic.spaceWidth * .24), .018, .095),
  };
}

function setGain(node: GainNode, value: number, now: number): void {
  node.gain.setValueAtTime(value, now);
}

/** Fans one real recording into controlled body, transient and stereo-space buses. */
export function connectSampleSoundscape(
  ac: AudioContext,
  source: AudioBufferSourceNode,
  master: AudioNode,
  preset: EffectPresetId,
  packId: string | undefined,
  panValue: number,
  now: number,
): AudioNode[] {
  const profile = sampleSoundscapeProfileFor(preset, packId);
  const dry = ac.createGain(); const body = ac.createGain(); const presence = ac.createGain();
  const bodyFilter = ac.createBiquadFilter(); const presenceFilter = ac.createBiquadFilter();
  const center = ac.createStereoPanner(); const spaceTone = ac.createBiquadFilter();
  const leftDelay = ac.createDelay(0.12); const rightDelay = ac.createDelay(0.12);
  const leftGain = ac.createGain(); const rightGain = ac.createGain();
  const leftPan = ac.createStereoPanner(); const rightPan = ac.createStereoPanner();

  setGain(dry, profile.dry, now); setGain(body, profile.body, now);
  setGain(presence, profile.presence, now); setGain(leftGain, profile.space, now);
  setGain(rightGain, profile.space, now);
  bodyFilter.type = 'lowpass'; bodyFilter.frequency.setValueAtTime(profile.lowpass, now);
  bodyFilter.Q.setValueAtTime(0.72, now);
  presenceFilter.type = 'highpass'; presenceFilter.frequency.setValueAtTime(profile.highpass, now);
  presenceFilter.Q.setValueAtTime(0.66, now);
  spaceTone.type = 'lowpass'; spaceTone.frequency.setValueAtTime(7200, now);
  spaceTone.Q.setValueAtTime(0.55, now);
  center.pan.setValueAtTime(panValue, now);
  leftPan.pan.setValueAtTime(Math.max(-1, panValue - 0.68), now);
  rightPan.pan.setValueAtTime(Math.min(1, panValue + 0.68), now);
  leftDelay.delayTime.setValueAtTime(profile.leftDelay, now);
  rightDelay.delayTime.setValueAtTime(profile.rightDelay, now);

  source.connect(dry); dry.connect(center);
  source.connect(bodyFilter); bodyFilter.connect(body); body.connect(center);
  source.connect(presenceFilter); presenceFilter.connect(presence); presence.connect(center);
  center.connect(master);
  source.connect(spaceTone); spaceTone.connect(leftDelay); spaceTone.connect(rightDelay);
  leftDelay.connect(leftGain); leftGain.connect(leftPan); leftPan.connect(master);
  rightDelay.connect(rightGain); rightGain.connect(rightPan); rightPan.connect(master);
  return [dry, body, presence, bodyFilter, presenceFilter, center, spaceTone,
    leftDelay, rightDelay, leftGain, rightGain, leftPan, rightPan];
}
