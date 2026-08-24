#!/usr/bin/env node

/** Apply a non-destructive studio-lighting pass to all 42 material icons. */
const fs = require('node:fs');
const path = require('node:path');

const packsDir = path.join(__dirname, '..', 'src-tauri', 'packs');
const packDirs = fs.readdirSync(packsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());

function studioFilter(seed) {
  return `<filter id="studio-light" x="-28%" y="-24%" width="156%" height="168%" color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceAlpha" stdDeviation="1.15" result="shadow-blur"/>
      <feOffset in="shadow-blur" dy="1.65" result="shadow-offset"/>
      <feFlood flood-color="#02070A" flood-opacity=".52" result="shadow-color"/>
      <feComposite in="shadow-color" in2="shadow-offset" operator="in" result="shadow"/>
      <feTurbulence type="fractalNoise" baseFrequency=".72" numOctaves="3" seed="${seed}" result="grain"/>
      <feColorMatrix in="grain" type="matrix" values=".12 0 0 0 .44  0 .12 0 0 .46  0 0 .12 0 .48  0 0 0 .14 0" result="micro-texture"/>
      <feComposite in="micro-texture" in2="SourceAlpha" operator="in" result="surface"/>
      <feSpecularLighting in="SourceAlpha" surfaceScale="2.2" specularConstant=".42" specularExponent="26" lighting-color="#FFFFFF" result="specular">
        <feDistantLight azimuth="224" elevation="58"/>
      </feSpecularLighting>
      <feComposite in="specular" in2="SourceAlpha" operator="in" result="highlight"/>
      <feBlend in="SourceGraphic" in2="surface" mode="soft-light" result="textured"/>
      <feBlend in="textured" in2="highlight" mode="screen" result="lit"/>
      <feMerge><feMergeNode in="shadow"/><feMergeNode in="lit"/></feMerge>
    </filter>
    <filter id="contact-shadow" x="-30%" y="-200%" width="160%" height="500%">
      <feGaussianBlur stdDeviation="1.45"/>
    </filter>`;
}

let changed = 0;
packDirs.forEach((entry, index) => {
  const file = path.join(packsDir, entry.name, 'icon.svg');
  let svg = fs.readFileSync(file, 'utf8');
  if (svg.includes('id="studio-light"')) return;
  if (!svg.includes('<defs>') || !svg.includes('</defs>')) throw new Error(`${entry.name}: missing defs`);
  svg = svg.replace('</defs>', `  ${studioFilter(index + 11)}\n  </defs>`);
  const defsEnd = svg.indexOf('</defs>') + '</defs>'.length;
  svg = `${svg.slice(0, defsEnd)}\n  <ellipse cx="24" cy="42.25" rx="12.5" ry="1.35" fill="#02070A" opacity=".38" filter="url(#contact-shadow)"/>\n  <g filter="url(#studio-light)">${svg.slice(defsEnd, svg.lastIndexOf('</svg>'))}\n  </g>\n</svg>\n`;
  fs.writeFileSync(file, svg);
  changed++;
});

if (packDirs.length !== 42) throw new Error(`expected 42 pack icons, found ${packDirs.length}`);
console.log(`Enhanced ${changed} icons (${packDirs.length} total).`);
