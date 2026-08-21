import { getNoiseBuffer } from './audio-context';
import { distortionCurve } from './audio-dsp';
import type { AcousticEvent, SemanticSoundPlan } from './audio-semantics';
import { varyFrequency } from './audio-semantics';
import { getAcousticVoiceModel, type AcousticVoiceModel } from './audio-voice-models';

export interface AcousticSpatialOptions {
  x?: number;
  viewportWidth?: number;
  velocityX?: number;
  velocitySpeed?: number;
}

export interface AudioGraph {
  nodes: AudioNode[];
  sources: AudioScheduledSourceNode[];
  duration: number;
}

interface Collector {
  nodes: AudioNode[];
  sources: AudioScheduledSourceNode[];
}

export function sourcePan(options: AcousticSpatialOptions): number {
  const width = Math.max(1, options.viewportWidth ?? 1);
  const position = options.x === undefined ? 0 : (options.x / width) * 2 - 1;
  const speed = Math.max(0, options.velocitySpeed ?? 0);
  const velocity = Math.max(-1, Math.min(1, options.velocityX ?? 0));
  const velocityWeight = Math.min(.18, speed / 9000);
  return Math.max(-1, Math.min(1, position * .72 + velocity * velocityWeight));
}

function addNoise(
  ac: AudioContext, destination: AudioNode, model: AcousticVoiceModel,
  start: number, end: number, random: () => number, collector: Collector,
): void {
  const source = ac.createBufferSource();
  source.buffer = getNoiseBuffer(ac, model.noiseColor === 'pink');
  source.loop = true;
  source.playbackRate.setValueAtTime(.84 + random() * .3, start);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(model.noiseLevel ?? 1, start);
  source.connect(gain);
  gain.connect(destination);
  source.start(start);
  source.stop(end + .06);
  collector.sources.push(source);
  collector.nodes.push(source, gain);
}

function addTone(
  ac: AudioContext, destination: AudioNode, event: AcousticEvent,
  model: AcousticVoiceModel, start: number, end: number,
  random: () => number, collector: Collector,
): void {
  const base = event.frequency ?? model.frequency;
  if (base <= 0 || !model.oscillator) return;
  const tunedBase = varyFrequency(base, model.pitchCents, random());
  const ratio = tunedBase / base;
  const endBase = event.endFrequency ?? model.endFrequency ?? base;
  for (const [harmonic, harmonicGain] of model.harmonics) {
    const oscillator = ac.createOscillator();
    oscillator.type = model.oscillator;
    oscillator.frequency.setValueAtTime(Math.max(20, tunedBase * harmonic), start);
    if (Math.abs(endBase - base) > .01) {
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(20, endBase * ratio * harmonic), end,
      );
    }
    const gain = ac.createGain();
    gain.gain.setValueAtTime(harmonicGain, start);
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(start);
    oscillator.stop(end + .06);
    collector.sources.push(oscillator);
    collector.nodes.push(oscillator, gain);
  }
}

function eventFilterRange(event: AcousticEvent, model: AcousticVoiceModel): [number, number] {
  const noisePitch = model.source === 'noise' || (model.source === 'pulses' && !model.oscillator);
  const start = noisePitch ? event.frequency ?? model.filterFrequency : model.filterFrequency;
  const end = noisePitch
    ? event.endFrequency ?? model.endFilterFrequency ?? start
    : model.endFilterFrequency ?? model.filterFrequency;
  return [Math.max(20, start), Math.max(20, end)];
}

function renderVoice(
  ac: AudioContext, master: GainNode, event: AcousticEvent, model: AcousticVoiceModel,
  start: number, duration: number, panValue: number, peakGain: number,
  random: () => number, collector: Collector,
): void {
  const end = start + Math.max(.018, duration);
  const bus = ac.createGain();
  bus.gain.setValueAtTime(1, start);
  collector.nodes.push(bus);
  if (model.source === 'noise' || model.source === 'hybrid' || (model.source === 'pulses' && model.noiseColor)) {
    addNoise(ac, bus, model, start, end, random, collector);
  }
  if (model.source === 'tone' || model.source === 'hybrid' || (model.source === 'pulses' && model.oscillator)) {
    addTone(ac, bus, event, model, start, end, random, collector);
  }
  const filter = ac.createBiquadFilter();
  const [filterStart, filterEnd] = eventFilterRange(event, model);
  filter.type = model.filter;
  filter.frequency.setValueAtTime(filterStart, start);
  if (Math.abs(filterStart - filterEnd) > 1) {
    filter.frequency.exponentialRampToValueAtTime(filterEnd, end);
  }
  filter.Q.setValueAtTime(model.q, start);
  bus.connect(filter);
  collector.nodes.push(filter);
  let processed: AudioNode = filter;
  if (model.drive > .01) {
    const shaper = ac.createWaveShaper();
    shaper.curve = distortionCurve(model.drive);
    shaper.oversample = model.drive > .5 ? '4x' : '2x';
    processed.connect(shaper);
    processed = shaper;
    collector.nodes.push(shaper);
  }
  const envelope = ac.createGain();
  const attackEnd = Math.min(end - .006, start + Math.min(model.attack, duration * .45));
  const holdEnd = Math.min(end - .004, Math.max(attackEnd, start + duration * model.hold));
  envelope.gain.setValueAtTime(.0001, start);
  envelope.gain.linearRampToValueAtTime(Math.max(.0001, peakGain), attackEnd);
  if (holdEnd > attackEnd) envelope.gain.setValueAtTime(Math.max(.0001, peakGain), holdEnd);
  envelope.gain.exponentialRampToValueAtTime(.001, end);
  processed.connect(envelope);
  const pan = ac.createStereoPanner();
  pan.pan.setValueAtTime(Math.max(-1, Math.min(1, panValue)), start);
  envelope.connect(pan);
  pan.connect(master);
  collector.nodes.push(envelope, pan);
  if (model.echoMix <= .01 || model.echoTime <= 0) return;
  const wet = ac.createGain();
  const delay = ac.createDelay(.8);
  const feedback = ac.createGain();
  wet.gain.setValueAtTime(model.echoMix, start);
  delay.delayTime.setValueAtTime(model.echoTime, start);
  feedback.gain.setValueAtTime(Math.min(.62, model.echoFeedback), start);
  pan.connect(wet);
  wet.connect(delay);
  delay.connect(master);
  delay.connect(feedback);
  feedback.connect(delay);
  collector.nodes.push(wet, delay, feedback);
}

function renderEvent(
  ac: AudioContext, master: GainNode, event: AcousticEvent, now: number,
  basePan: number, random: () => number, collector: Collector,
): number {
  const model = getAcousticVoiceModel(event.voice);
  const start = now + Math.max(0, event.at);
  const spread = Math.max(0, Math.min(1, event.spread ?? .28));
  if (model.source === 'pulses') {
    const count = Math.max(1, Math.round(event.pulses ?? model.defaultPulses ?? 5));
    const pulseDuration = Math.min(.16, Math.max(.025, event.duration / count * 1.7));
    const pulseGain = event.gain * Math.min(.56, 1.65 / Math.sqrt(count));
    for (let index = 0; index < count; index++) {
      const offset = ((index + random() * .72) / count) * Math.max(0, event.duration - pulseDuration);
      const pan = basePan + (event.pan ?? 0) + (random() * 2 - 1) * spread;
      renderVoice(ac, master, event, model, start + offset, pulseDuration, pan, pulseGain, random, collector);
    }
  } else {
    const copies = model.copies ?? 1;
    for (let index = 0; index < copies; index++) {
      const lane = copies === 1 ? 0 : (index / (copies - 1)) * 2 - 1;
      const pan = basePan * (1 - spread * .7) + (event.pan ?? 0) + lane * Math.max(.62, spread);
      renderVoice(ac, master, event, model, start, event.duration, pan, event.gain / Math.sqrt(copies), random, collector);
    }
  }
  const tail = model.echoTime * (model.echoFeedback > 0 ? 4 : 1);
  return event.at + event.duration + tail;
}

export function renderSemanticPlan(
  ac: AudioContext, master: GainNode, plan: SemanticSoundPlan,
  options: AcousticSpatialOptions = {}, random: () => number = Math.random,
): AudioGraph {
  const collector: Collector = { nodes: [], sources: [] };
  const now = ac.currentTime;
  const pan = sourcePan(options);
  let duration = 0;
  for (const event of plan.events) {
    duration = Math.max(duration, renderEvent(ac, master, event, now, pan, random, collector));
  }
  return { ...collector, duration };
}
