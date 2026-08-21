#!/usr/bin/env node

/**
 * Import reviewed Mixkit Foley samples into every built-in material pack.
 * Run from the repository root. The script intentionally keeps the source
 * metadata in pack.json so every audible asset remains auditable.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const mixkitLicense = 'Mixkit Sound Effects Free License';
const sourceBase = 'https://mixkit.co/free-sound-effects/download';
const attenuation = { 'boxing-glove': .84, crystal: .65, 'glass-shot': .65, katana: .84, water: .84 };

const sourceOverrides = {
  saxophone: {
    audioUrl: 'https://upload.wikimedia.org/wikipedia/commons/3/38/Lick_Tenor_Sax.wav',
    sourceTitle: 'Lick Tenor Sax — The lick in C minor played on tenor saxophone',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Lick_Tenor_Sax.wav',
    license: 'Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)',
  },
};

const samples = {
  rocket: [1714, 'Fast rocket whoosh', .78], phoenix: [1328, 'Fire swoosh burning', .78],
  lightning: [2601, 'Electricity lightning blast', .74], dragon: [309, 'Angry dragon growl', .82],
  'ninja-star': [2770, 'Metal arrow fast hit', .78], katana: [2789, 'Samurai sword impact', .8],
  crystal: [759, 'Glass break with hammer thud', .72], skull: [2623, 'Ghostly whoosh passing', .75],
  flame: [1345, 'Short fire whoosh', .78], ice: [2834, 'Dropping ice into a glass', .76],
  thunder: [2390, 'Thunder rumble', .74], water: [1311, 'Water splash', .78],
  wind: [1471, 'Cinematic wind swoosh', .7], star: [871, 'Fairy magic sparkle', .7],
  moon: [1486, 'Cinematic tunnel reverb woosh', .68], sun: [1704, 'Explosion hit', .7],
  meteor: [1337, 'Small meteor falling', .76], comet: [1337, 'Small meteor falling', .7],
  guitar: [2321, 'Cool guitar riff', .72], drum: [563, 'Drum deep impact', .82],
  bell: [1791, 'Cooking bell ding', .72], harp: [657, 'Choir harp bless', .7],
  trumpet: [526, 'Party trumpet horn isolated', .7], bow: [2771, 'Arrow shot through air', .76],
  shield: [887, 'Sci-fi metallic reveal', .72], axe: [833, 'Metal hammer hit', .8],
  spear: [2769, 'Metal arrow hit', .8], bomb: [1704, 'Explosion hit', .72],
  lotus: [2628, 'Relaxing harp sweep', .68], aurora: [2350, 'Magic sparkle whoosh', .68],
  tornado: [2408, 'Storm coming whoosh', .7], downpour: [2399, 'Heavy rain drops', .66],
  wildfire: [1328, 'Fire swoosh burning', .76], revolver: [1662, 'Game gun shot', .7],
  'glass-shot': [759, 'Glass break with hammer thud', .72], 'boxing-glove': [2155, 'Impact of a strong punch', .8],
  bullwhip: [1511, 'Fast whip strike', .78], piano: [691, 'Piano key strike', .7],
  saxophone: [0, sourceOverrides.saxophone.sourceTitle, .66], vinyl: [702, 'Record player vinyl scratch', .64],
  fireworks: [2994, 'Clear firework explosions', .7], 'black-hole': [1143, 'Cinematic whoosh deep impact', .72],
};

function durationSeconds(file) {
  try {
    const info = execFileSync('afinfo', [file], { encoding: 'utf8' });
    const match = info.match(/estimated duration:\s*([0-9.]+)/i);
    return Math.min(12, Math.max(.05, Number(match?.[1] ?? 2)));
  } catch { return 2; }
}

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

const requestedId = process.argv[2];
if (requestedId && !(requestedId in samples)) throw new Error(`Unknown material pack: ${requestedId}`);

for (const [id, [mixkitId, sourceTitle, gain]] of Object.entries(samples)) {
  if (requestedId && id !== requestedId) continue;
  const dir = join(root, 'src-tauri', 'packs', id);
  mkdirSync(dir, { recursive: true });
  let input = join(dir, 'source.wav');
  const sourceOverride = sourceOverrides[id];
  if (sourceOverride) {
    writeFileSync(input, await download(sourceOverride.audioUrl));
  } else {
    try {
      writeFileSync(input, await download(`https://assets.mixkit.co/active_storage/sfx/${mixkitId}/${mixkitId}.wav`));
    } catch {
      input = join(dir, 'source.mp3');
      writeFileSync(input, await download(`https://assets.mixkit.co/active_storage/sfx/${mixkitId}/${mixkitId}.mp3`));
    }
  }
  const output = join(dir, 'sound.m4a');
  const decoded = join(dir, 'decoded.wav');
  const scaled = join(dir, 'scaled.wav');
  const mastered = join(dir, 'mastered.wav');
  execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16', input, decoded]);
  const gain = attenuation[id] ?? 1;
  const encodedInput = gain === 1 ? decoded : scaled;
  if (gain !== 1) {
    execFileSync('python3', [join(root, 'scripts', 'scale-pcm.py'), decoded, scaled, String(gain)]);
  }
  execFileSync('python3', [join(root, 'scripts', 'master-audio.py'), encodedInput, mastered, '--target-rms', '-17', '--max-peak', '-5']);
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '192000', '-s', '0', '-q', '127', '-o', output, mastered]);
  unlinkSync(input);
  unlinkSync(decoded);
  if (encodedInput === scaled) unlinkSync(scaled);
  unlinkSync(mastered);
  const manifestPath = join(dir, 'pack.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.sound = {
    layers: [],
    sample: {
      file: 'sound.m4a', gain: 0.9, maxDuration: durationSeconds(output), sourceTitle,
      sourceUrl: sourceOverride?.sourceUrl ?? `${sourceBase}/${mixkitId}/`,
      license: sourceOverride?.license ?? mixkitLicense,
    },
    masterGain: .9,
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${id}: ${mixkitId} ${sourceTitle}`);
}
