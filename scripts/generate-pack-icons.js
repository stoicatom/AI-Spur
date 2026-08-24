#!/usr/bin/env node

/**
 * Icon asset guard. Material icons are art-directed SVGs, not generated emoji
 * or flat game glyphs. Run this in CI to prevent accidentally reintroducing
 * the old 30-icon generator.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'src-tauri', 'packs');
const entries = fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory());
if (entries.length !== 42) throw new Error(`expected 42 art-directed packs, found ${entries.length}`);
for (const entry of entries) {
  const file = path.join(root, entry.name, 'icon.svg');
  const svg = fs.readFileSync(file, 'utf8');
  for (const required of [
    'viewBox="0 0 48 48"',
    'preserveAspectRatio="xMidYMid meet"',
    'shape-rendering="geometricPrecision"',
    'studio-light',
    'contact-shadow',
    'feDiffuseLighting',
    'feSpecularLighting',
    'feMorphology',
    'mode="screen" result="diffuse-lit"',
    'var(--pack-',
  ]) {
    if (!svg.includes(required)) throw new Error(`${entry.name}: icon missing ${required}`);
  }
  if (!svg.includes('linearGradient') && !svg.includes('radialGradient')) throw new Error(`${entry.name}: icon has no material gradient`);
  if (/<animate|<script|foreignObject/.test(svg)) throw new Error(`${entry.name}: animated or executable SVG content is forbidden`);
  if (/\p{Extended_Pictographic}/u.test(svg)) throw new Error(`${entry.name}: emoji glyphs are forbidden`);
  if (Buffer.byteLength(svg) > 8 * 1024) throw new Error(`${entry.name}: icon exceeds 8 KiB`);
}
console.log(`Validated ${entries.length} studio-lit material icons.`);
