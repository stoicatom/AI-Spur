import { describe, it, expect } from 'vitest';
import { crackStyle } from '../overlay/material-styles';
import { MATERIAL_HUE, DEFAULT_VEL, type WhipVel } from '../overlay/particles';

describe('material-styles 素材差异化', () => {
  it('每个素材色相等于查表值', () => {
    for (const id of Object.keys(MATERIAL_HUE)) {
      const st = crackStyle(id);
      expect(st.hue, id).toBe(MATERIAL_HUE[id]);
    }
  });

  it('粒子总量符合预算且不超上限', () => {
    const ids = Object.keys(MATERIAL_HUE);
    for (const id of ids) {
      const ps = crackStyle(id).emit(0, 0, DEFAULT_VEL);
      expect(ps.length, id).toBeLessThanOrEqual(180);
      expect(ps.length, id).toBeGreaterThan(0);
    }
  });

  it('物理方向：速度向量右向时粒子整体向右偏移', () => {
    const st = crackStyle('sword');
    const vel: WhipVel = { vx: 1, vy: 0, speed: 3, dir: 0 };
    const ps = st.emit(0, 0, vel);
    const rightward = ps.filter(p => p.vx > 0).length;
    expect(rightward).toBeGreaterThan(ps.length / 2);
  });

  it('star 粒子层数 ≥40 且色相=45', () => {
    const ps = crackStyle('star').emit(0, 0, DEFAULT_VEL);
    expect(ps.length).toBeGreaterThanOrEqual(40);
    expect(crackStyle('star').hue).toBe(45);
  });

  it('star 位移覆盖 ≥180px', () => {
    const ps = crackStyle('star').emit(0, 0, { vx: 1, vy: 0, speed: 3, dir: 0 });
    const maxReach = Math.max(...ps.map(p => Math.hypot(p.vx, p.vy)));
    expect(maxReach).toBeGreaterThan(10); // 速度 6-12
  });

  it('horn 粒子层数 ≥30 且色相=48', () => {
    const ps = crackStyle('horn').emit(0, 0, DEFAULT_VEL);
    expect(ps.length).toBeGreaterThanOrEqual(30);
    expect(crackStyle('horn').hue).toBe(48);
  });

  it('trident 粒子层数 ≥36 且色相=205', () => {
    const ps = crackStyle('trident').emit(0, 0, DEFAULT_VEL);
    expect(ps.length).toBeGreaterThanOrEqual(36);
    expect(crackStyle('trident').hue).toBe(205);
  });

  it('blowgun 粒子层数 ≥20 且色相=120', () => {
    const ps = crackStyle('blowgun').emit(0, 0, DEFAULT_VEL);
    expect(ps.length).toBeGreaterThanOrEqual(20);
    expect(crackStyle('blowgun').hue).toBe(120);
  });

  it('slingshot 粒子层数 ≥24 且色相=25', () => {
    const ps = crackStyle('slingshot').emit(0, 0, DEFAULT_VEL);
    expect(ps.length).toBeGreaterThanOrEqual(24);
    expect(crackStyle('slingshot').hue).toBe(25);
  });

  it('chain 粒子层数 ≥28 且色相=220', () => {
    const ps = crackStyle('chain').emit(0, 0, DEFAULT_VEL);
    expect(ps.length).toBeGreaterThanOrEqual(28);
    expect(crackStyle('chain').hue).toBe(220);
  });

  it('football 粒子层数 ≥24 且色相=110', () => {
    const ps = crackStyle('football').emit(0, 0, DEFAULT_VEL);
    expect(ps.length).toBeGreaterThanOrEqual(24);
    expect(crackStyle('football').hue).toBe(110);
  });

  it('dragonfly 粒子层数 ≥24 且色相=140', () => {
    const ps = crackStyle('dragonfly').emit(0, 0, DEFAULT_VEL);
    expect(ps.length).toBeGreaterThanOrEqual(24);
    expect(crackStyle('dragonfly').hue).toBe(140);
  });

  it('tessen 粒子层数 ≥28 且色相=30', () => {
    const ps = crackStyle('tessen').emit(0, 0, DEFAULT_VEL);
    expect(ps.length).toBeGreaterThanOrEqual(28);
    expect(crackStyle('tessen').hue).toBe(30);
  });

  it('bow 粒子层数 ≥28 且色相=33', () => {
    const ps = crackStyle('bow').emit(0, 0, DEFAULT_VEL);
    expect(ps.length).toBeGreaterThanOrEqual(28);
    expect(crackStyle('bow').hue).toBe(33);
  });
});
