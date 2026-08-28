#!/usr/bin/env node

/**
 * Re-master already packaged recordings for emergency gain changes.
 * Prefer import-mixkit-audio.js for release assets so encoding starts from
 * the licensed WAV/MP3 source instead of transcoding AAC a second time.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const root = new URL('..', import.meta.url).pathname;
const packsDir = join(root, 'src-tauri', 'packs');
const workRoot = mkdtempSync(join(tmpdir(), 'aispur-remaster-'));
const targetRms = -17;
const maxPeak = -5.0;

for (const id of readdirSync(packsDir).sort()) {
  const dir = join(packsDir, id);
  const source = join(dir, 'sound.m4a');
  try { readFileSync(source); } catch { continue; }
  const decoded = join(workRoot, `${id}.decoded.wav`);
  const mastered = join(workRoot, `${id}.mastered.wav`);
  const encoded = join(workRoot, `${id}.m4a`);
  execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16', source, decoded], { stdio: 'inherit' });
  execFileSync('python3', [join(root, 'scripts', 'master-audio.py'), decoded, mastered, '--target-rms', String(targetRms), '--max-peak', String(maxPeak)], { stdio: 'inherit' });
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '192000', '-s', '0', '-q', '127', '-o', encoded, mastered]);
  renameSync(encoded, source);

  const manifestPath = join(dir, 'pack.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.sound?.sample) manifest.sound.sample.gain = 0.9;
  manifest.sound.masterGain = 0.9;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

console.log(`Remastered bundled audio in ${workRoot} with target RMS ${targetRms} dBFS and peak ceiling ${maxPeak} dBFS.`);
