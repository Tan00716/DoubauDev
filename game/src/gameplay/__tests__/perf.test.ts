import { describe, it, expect } from 'vitest';
import { gameState } from '../game-state';
import { updateCombat } from '../combat';

/**
 * MVP 批次一·性能项回归守卫：230 实体压测（MVP 验收口径：峰值友方 ≤30 + 敌方 ≤60 合计 ~90；
 * 本压测取 2.5 倍余量：60 班组 + 140 敌人 + 30 建筑 = 230 实体）。
 * 验收线为渲染帧率 ≥30fps（33.3ms 帧预算）；本断言只守逻辑层（updateCombat）平均耗时 < 8ms/帧
 * （约 30fps 预算的 1/4），为渲染与慢机器留足余量，避免 CI 环境噪声导致 flaky。
 */
describe('230 实体压测（逻辑层帧耗时回归守卫）', () => {
  it('60 班组 + 140 敌人 + 30 建筑：updateCombat 平均帧耗时 < 8ms', () => {
    gameState.resetGame();
    gameState.phase = 'night';
    gameState.gapTimer = 1e9;        // 隔离波次状态机
    gameState.nightDuration = 1e9;   // 隔离夜时长兜底
    gameState.enemies = [];
    gameState.squads = [];
    gameState.buildings = [];
    gameState.activeEffects = [];
    gameState.warSpirit = 0;
    gameState.firstTacticFree = false;

    // 60 班组（混编三种单位，军令容量放宽至压测规模）
    gameState.militaryCapacity = 200;
    const unitIds = ['unit_shieldbearer', 'unit_pikeman', 'unit_archer'];
    for (let i = 0; i < 60; i++) {
      const angle = (i / 60) * Math.PI * 2;
      const ok = gameState.spawnSquad(unitIds[i % 3], { x: Math.cos(angle) * 6, z: Math.sin(angle) * 6 });
      expect(ok).toBe(true);
      const sq = gameState.squads[gameState.squads.length - 1];
      sq.health = 1e9; sq.maxHealth = 1e9; // 隔离死亡路径
    }

    // 140 敌人（混编三种，绕过波次表直接入场）
    const enemyIds = ['enemy_wolf', 'enemy_shield_crusher', 'enemy_burrower'];
    for (let i = 0; i < 140; i++) {
      const angle = (i / 140) * Math.PI * 2;
      gameState.spawnEnemy(enemyIds[i % 3], { x: Math.cos(angle) * 12, z: Math.sin(angle) * 12 });
      const en = gameState.enemies[gameState.enemies.length - 1];
      en.health = 1e9; en.maxHealth = 1e9;
    }

    // 30 建筑（箭塔参与寻敌与攻击逻辑）
    gameState.workCapacity = 200;
    for (let i = 0; i < 30; i++) {
      const angle = (i / 30) * Math.PI * 2;
      const ok = gameState.spawnBuilding('building_arrow_tower', { x: Math.cos(angle) * 9, z: Math.sin(angle) * 9 });
      expect(ok).toBe(true);
      const b = gameState.buildings[gameState.buildings.length - 1];
      b.health = 1e9; b.maxHealth = 1e9;
    }

    expect(gameState.squads.length + gameState.enemies.length + gameState.buildings.length).toBe(230);

    // 预热 60 帧（JIT / 缓存就位），再计量 600 帧（10 秒 @60fps）
    const dt = 1 / 60;
    for (let i = 0; i < 60; i++) updateCombat(dt);

    let totalMs = 0;
    const FRAMES = 600;
    let maxMs = 0;
    for (let i = 0; i < FRAMES; i++) {
      const t0 = performance.now();
      updateCombat(dt);
      const ms = performance.now() - t0;
      totalMs += ms;
      if (ms > maxMs) maxMs = ms;
    }

    const avgMs = totalMs / FRAMES;
    // eslint-disable-next-line no-console
    console.log(`[perf] 230 实体逻辑帧：平均 ${avgMs.toFixed(3)}ms / 峰值 ${maxMs.toFixed(3)}ms（${FRAMES} 帧计量）`);

    // 守卫：平均 < 8ms（30fps 帧预算 33ms 的 ~1/4）；峰值放宽到 30ms（偶发 GC 不触发回归判定）
    expect(avgMs).toBeLessThan(8);
    expect(maxMs).toBeLessThan(30);
  });
});
