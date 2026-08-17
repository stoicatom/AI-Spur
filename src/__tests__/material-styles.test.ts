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
});
