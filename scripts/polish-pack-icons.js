#!/usr/bin/env node

/**
 * Apply the shared high-resolution material pass to the reviewed pack SVGs.
 * The source drawings stay pack-specific; this only standardises rasterisation
 * and adds a restrained edge/diffuse response so they remain legible at 48px
 * and still look dimensional when rendered at 256px or larger.
 */
const { readFileSync, readdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const packsDir = join(__dirname, '..', 'src-tauri', 'packs');
const dirs = readdirSync(packsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());

const diffusePass = `
      <feDiffuseLighting in="SourceAlpha" surfaceScale="1.15" diffuseConstant=".18" lighting-color="#FFFFFF" result="diffuse">
        <feDistantLight azimuth="224" elevation="58"/>
      </feDiffuseLighting>
      <feComposite in="diffuse" in2="SourceAlpha" operator="in" result="diffuse-mask"/>
      <feMorphology in="SourceAlpha" operator="dilate" radius=".28" result="edge-expanded"/>
      <feComposite in="edge-expanded" in2="SourceAlpha" operator="out" result="edge-mask"/>
      <feFlood flood-color="#FFFFFF" flood-opacity=".22" result="edge-color"/>
      <feComposite in="edge-color" in2="edge-mask" operator="in" result="edge-light"/>
      <feBlend in="lit" in2="diffuse-mask" mode="screen" result="diffuse-lit"/>
      <feBlend in="diffuse-lit" in2="edge-light" mode="screen" result="studio-lit"/>`;

let changed = 0;
for (const entry of dirs) {
  const file = join(packsDir, entry.name, 'icon.svg');
  let svg = readFileSync(file, 'utf8');
  const rootEnd = svg.indexOf('>');
  if (rootEnd < 0) throw new Error(`${entry.name}: malformed SVG root`);
  const rootTag = svg.slice(0, rootEnd);
  let nextRootTag = rootTag;
  if (!/\spreserveAspectRatio=/.test(nextRootTag)) nextRootTag += ' preserveAspectRatio="xMidYMid meet"';
  if (!/\sshape-rendering=/.test(nextRootTag)) nextRootTag += ' shape-rendering="geometricPrecision"';
  if (nextRootTag !== rootTag) svg = `${nextRootTag}${svg.slice(rootEnd)}`;

  if (!svg.includes('result="studio-lit"')) {
    const marker = '      <feMerge><feMergeNode in="shadow"/><feMergeNode in="lit"/></feMerge>';
    if (!svg.includes(marker)) throw new Error(`${entry.name}: studio filter merge not found`);
    svg = svg.replace(marker, `${diffusePass}\n${marker.replace('result="lit"', 'result="studio-lit"')}`);
    // The merge now consumes the physically lit result, not the pre-diffuse
    // intermediate.  Keep the drop shadow as the first layer.
    svg = svg.replace('<feMergeNode in="lit"/>', '<feMergeNode in="studio-lit"/>');
  } else if (svg.includes('result="material-lit"')) {
    svg = svg
      .replace(
        '<feBlend in="lit" in2="diffuse-lit" mode="multiply" result="material-lit"/>\n      <feBlend in="material-lit" in2="edge-light" mode="screen" result="studio-lit"/>',
        '<feBlend in="diffuse-lit" in2="edge-light" mode="screen" result="studio-lit"/>',
      );
  }
  if (svg !== readFileSync(file, 'utf8')) {
    writeFileSync(file, svg.endsWith('\n') ? svg : `${svg}\n`);
    changed++;
  }
}

if (dirs.length !== 42) throw new Error(`expected 42 pack icons, found ${dirs.length}`);
console.log(`Polished ${changed} high-resolution material icons (${dirs.length} total).`);
