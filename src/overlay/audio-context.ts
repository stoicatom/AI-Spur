let context: AudioContext | null = null;
let noiseContext: AudioContext | null = null;
let whiteNoiseBuffer: AudioBuffer | null = null;
let pinkNoiseBuffer: AudioBuffer | null = null;

const NOISE_DURATION = 2;

export function getAudioContext(): AudioContext {
  if (!context || context.state === 'closed') context = new AudioContext();
  return context;
}

/** Scheduled Web Audio times stay relative to currentTime while suspended. */
export function resumeAudioContext(audioContext: AudioContext): Promise<void> {
  if (audioContext.state !== 'suspended') return Promise.resolve();
  return audioContext.resume();
}

function buildNoiseBuffer(audioContext: AudioContext, pink: boolean): AudioBuffer {
  const length = Math.ceil(NOISE_DURATION * audioContext.sampleRate);
  const buffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  if (!pink) {
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
  return buffer;
}

export function getNoiseBuffer(audioContext: AudioContext, pink: boolean): AudioBuffer {
  if (noiseContext !== audioContext) {
    noiseContext = audioContext;
    whiteNoiseBuffer = null;
    pinkNoiseBuffer = null;
  }
  if (pink) {
    if (!pinkNoiseBuffer) pinkNoiseBuffer = buildNoiseBuffer(audioContext, true);
    return pinkNoiseBuffer;
  }
  if (!whiteNoiseBuffer) whiteNoiseBuffer = buildNoiseBuffer(audioContext, false);
  return whiteNoiseBuffer;
}

export function disposeAudioContext(): void {
  const current = context;
  context = null;
  noiseContext = null;
  whiteNoiseBuffer = null;
  pinkNoiseBuffer = null;
  if (current && current.state !== 'closed') current.close().catch(() => {});
}
