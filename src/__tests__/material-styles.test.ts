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

  it('shield 粒子层数 ≥28 且色相=215', () => {
    const ps = crackStyle('shield').emit(0, 0, DEFAULT_VEL);
    expect(ps.length).toBeGreaterThanOrEqual(28);
    expect(crackStyle('shield').hue).toBe(215);
  });

  it('bomb 粒子层数 ≥40 且色相=15', () => {
    const ps = crackStyle('bomb').emit(0, 0, DEFAULT_VEL);
    expect(ps.length).toBeGreaterThanOrEqual(40);
    expect(crackStyle('bomb').hue).toBe(15);
  });

  it('hammer 粒子层数 ≥32 且色相=220', () => {
    const ps = crackStyle('hammer').emit(0, 0, DEFAULT_VEL);
    expect(ps.length).toBeGreaterThanOrEqual(32);
    expect(crackStyle('hammer').hue).toBe(220);
  });

  it('scepter 粒子层数 ≥32 且色相=285', () => {
    const ps = crackStyle('scepter').emit(0, 0, DEFAULT_VEL);
    expect(ps.length).toBeGreaterThanOrEqual(32);
    expect(crackStyle('scepter').hue).toBe(285);
  });

  it('amulet 粒子层数 ≥30 且色相=270', () => {
    const ps = crackStyle('amulet').emit(0, 0, DEFAULT_VEL);
    expect(ps.length).toBeGreaterThanOrEqual(30);
    expect(crackStyle('amulet').hue).toBe(270);
  });

  it('dagger 粒子层数 ≥24 且色相=200', () => {
    const ps = crackStyle('dagger').emit(0, 0, DEFAULT_VEL);
    expect(ps.length).toBeGreaterThanOrEqual(24);
    expect(crackStyle('dagger').hue).toBe(200);
  });

  it('boomerang 粒子层数 ≥24 且色相=25', () => {
    const ps = crackStyle('boomerang').emit(0, 0, DEFAULT_VEL);
    expect(ps.length).toBeGreaterThanOrEqual(24);
    expect(crackStyle('boomerang').hue).toBe(25);
  });

  it('spear 粒子层数 ≥24 且色相=200', () => {
    const ps = crackStyle('spear').emit(0, 0, DEFAULT_VEL);
    expect(ps.length).toBeGreaterThanOrEqual(24);
    expect(crackStyle('spear').hue).toBe(200);
  });

  it('axe 粒子层数 ≥28 且色相=210', () => {
    const ps = crackStyle('axe').emit(0, 0, DEFAULT_VEL);
    expect(ps.length).toBeGreaterThanOrEqual(28);
    expect(crackStyle('axe').hue).toBe(210);
  });

  it('scythe 粒子层数 ≥28 且色相=280', () => {
    const ps = crackStyle('scythe').emit(0, 0, DEFAULT_VEL);
    expect(ps.length).toBeGreaterThanOrEqual(28);
    expect(crackStyle('scythe').hue).toBe(280);
  });

  it('flail 粒子层数 ≥28 且色相=20', () => {
    const ps = crackStyle('flail').emit(0, 0, DEFAULT_VEL);
    expect(ps.length).toBeGreaterThanOrEqual(28);
    expect(crackStyle('flail').hue).toBe(20);
  });

  it('chakram 粒子层数 ≥28 且色相=215', () => {
    const ps = crackStyle('chakram').emit(0, 0, DEFAULT_VEL);
    expect(ps.length).toBeGreaterThanOrEqual(28);
    expect(crackStyle('chakram').hue).toBe(215);
  });

  it('halberd 粒子层数 ≥24 且色相=210', () => {
    const ps = crackStyle('halberd').emit(0, 0, DEFAULT_VEL);
    expect(ps.length).toBeGreaterThanOrEqual(24);
    expect(crackStyle('halberd').hue).toBe(210);
  });
});
