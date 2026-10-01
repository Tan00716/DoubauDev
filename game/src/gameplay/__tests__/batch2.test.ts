import { describe, it, expect } from 'vitest';
import { gameState, TOTAL_WAVES, WAVE_GAP_SECONDS, NIGHT1_WAVE_GAP_SECONDS, WAVE_PREVIEW_LEAD_SECONDS } from '../game-state';
import { updateCombat } from '../combat';
import { SpatialGrid } from '../spatial-grid';

/**
 * MVP 批次二·体验批测试：
 * 1. 夜内空窗优化（验收：空窗率 ≤40%，第 1 夜 ≤50%；口径 = 夜间敌人存活数为 0 的累计时长 / 夜总时长）
 * 2. 间隙事件「落单残兵」
 * 3. 新手第 1 夜分阶段引导（战术牌锁定 / 首夜耐久保护 / 跳过 / 第 2 局差异）
 * 4. spatial-grid 越界钳制对称性（质检批次一建议级）
 */

/** 固定步长驱动夜间战斗，直到夜结束或达到最长模拟秒数。返回是否正常收夜。 */
function simulateNight(dt: number, maxSeconds = 400): boolean {
  let elapsed = 0;
  while (gameState.phase === 'night' && elapsed < maxSeconds) {
    updateCombat(dt);
    elapsed += dt;
  }
  return gameState.phase === 'night_settlement';
}

/** 构造一局中的某个夜晚：防守班驻主堡旁，走 beginNight 正规入口（含空窗统计与教程钩子）。 */
function setupNight(day: number, runCount: number, heavy = false): void {
  gameState.resetGame();
  gameState.setRunCountProvider({ get: () => runCount - 1, set: () => {} }); // startGame 内 +1 后 = runCount
  gameState.runCount = runCount; // 直接指定（不走 startGame，隔离 UI/事件）
  gameState.dayCount = day;
  gameState.phase = 'day';
  gameState.buildings = [];
  gameState.squads = [];
  if (heavy) {
    // 高敌量夜（≥第 4 夜）：环形防御——8 个弓手班驻半径 10 圆周，覆盖多数生成角度
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      gameState.spawnSquad('unit_archer', { x: Math.cos(angle) * 10, z: Math.sin(angle) * 10 });
      gameState.squads[gameState.squads.length - 1].command = 'hold';
    }
    gameState.spawnSquad('unit_shieldbearer', { x: 2, z: 0 });
    gameState.squads[gameState.squads.length - 1].command = 'hold';
  } else {
    // 防守编成：盾卫顶前排 + 弓手输出（贴近主堡，模拟真实布阵而非瞬杀）
    gameState.spawnSquad('unit_shieldbearer', { x: 2, z: 0 });
    gameState.spawnSquad('unit_shieldbearer', { x: -2, z: 0 });
    gameState.spawnSquad('unit_archer', { x: 0, z: 3 });
    for (const sq of gameState.squads) sq.command = 'hold';
  }
  gameState.beginNight();
}

/** 空窗率专项：抬高主堡血量排除「随机生成角度 → 防守边缘化 → gameOver」的 flaky（节奏验收与战斗平衡无关）。 */
function setupPaceNight(day: number, runCount: number, heavy = false): void {
  setupNight(day, runCount, heavy);
  gameState.mainKeepMaxHealth = 5000;
  gameState.mainKeepHealth = 5000;
}

describe('批次二·夜内空窗优化（验收指标）', () => {
  it('第 1 夜：空窗率 ≤ 50%（含新手教学节奏 6s 间隙，无残兵填充）', () => {
    setupPaceNight(1, 1);
    expect(simulateNight(0.1)).toBe(true);
    const stat = gameState.nightIdleHistory[gameState.nightIdleHistory.length - 1];
    expect(stat.day).toBe(1);
    const idleRate = stat.idle / stat.duration;
    // 输出供失败时诊断
    console.log(`[batch2] 第 1 夜 idle=${stat.idle}s / duration=${stat.duration}s = ${(idleRate * 100).toFixed(1)}%`);
    expect(idleRate).toBeLessThanOrEqual(0.5);
  });

  it('第 2 夜：空窗率 ≤ 40%（10s 间隙 + 残兵填充后半段）', () => {
    setupPaceNight(2, 2);
    expect(simulateNight(0.1)).toBe(true);
    const stat = gameState.nightIdleHistory[gameState.nightIdleHistory.length - 1];
    const idleRate = stat.idle / stat.duration;
    console.log(`[batch2] 第 2 夜 idle=${stat.idle}s / duration=${stat.duration}s = ${(idleRate * 100).toFixed(1)}%`);
    expect(idleRate).toBeLessThanOrEqual(0.4);
  });

  it('第 4 夜（敌量增大，环形防御）：空窗率 ≤ 40%', () => {
    setupPaceNight(4, 2, true);
    expect(simulateNight(0.1)).toBe(true);
    const stat = gameState.nightIdleHistory[gameState.nightIdleHistory.length - 1];
    const idleRate = stat.idle / stat.duration;
    console.log(`[batch2] 第 4 夜 idle=${stat.idle}s / duration=${stat.duration}s = ${(idleRate * 100).toFixed(1)}%`);
    expect(idleRate).toBeLessThanOrEqual(0.4);
  });

  it('节奏常量对齐实现：预演 3s / 波间 10s（第 1 夜 6s）', () => {
    expect(WAVE_PREVIEW_LEAD_SECONDS).toBe(3);
    expect(WAVE_GAP_SECONDS).toBe(10);
    expect(NIGHT1_WAVE_GAP_SECONDS).toBe(6);
  });

  it('空窗口径自洽：夜末 nightIdleHistory 记录 (day, idle, duration) 且 idle ≤ duration', () => {
    setupPaceNight(3, 2);
    expect(simulateNight(0.1)).toBe(true);
    const stat = gameState.nightIdleHistory[gameState.nightIdleHistory.length - 1];
    expect(stat.idle).toBeGreaterThanOrEqual(0);
    expect(stat.idle).toBeLessThanOrEqual(stat.duration + 1e-6);
    expect(stat.duration).toBeGreaterThan(0);
  });
});

describe('批次二·间隙事件「落单残兵」', () => {
  it('第 2 夜波 1 清空后：间隙过半时场上出现 2 只狼（残兵），波次状态机不被扰动', () => {
    setupNight(2, 2);
    // 快进预演 3s → 波 1 生成
    let t = 0;
    while (gameState.waveNumber < 1 && t < 10) { updateCombat(0.1); t += 0.1; }
    expect(gameState.waveNumber).toBe(1);
    // 模拟清波（直接移除敌人，聚焦节奏状态机而非击杀过程）
    gameState.enemies = [];
    updateCombat(0.1); // 触发清波分支 → waveActive=false, gapTimer=10
    expect(gameState.waveActive).toBe(false);
    expect(gameState.gapTotalSeconds).toBe(WAVE_GAP_SECONDS);
    // 快进到间隙过半（>5s），残兵应已刷出
    let t2 = 0;
    while (t2 < 6) { updateCombat(0.1); t2 += 0.1; }
    expect(gameState.stragglerSpawnedThisGap).toBe(true);
    expect(gameState.enemies.length).toBe(2);
    expect(gameState.enemies.every(e => e.enemyId === 'enemy_wolf')).toBe(true);
    // 波次号未被残兵扰动
    expect(gameState.waveNumber).toBe(1);
    expect(gameState.waveActive).toBe(false);
  });

  it('第 1 夜（教学夜）：间隙不刷残兵（教学节奏快、敌量少，保持纯净）', () => {
    setupNight(1, 1);
    let t = 0;
    while (gameState.waveNumber < 1 && t < 10) { updateCombat(0.1); t += 0.1; }
    gameState.enemies = [];
    updateCombat(0.1);
    // 快进 4s：已过教学间隙（6s）的三分之二但仍在 gap 内——第 1 夜不应有残兵
    let t2 = 0;
    while (t2 < 4 && !gameState.waveActive) { updateCombat(0.1); t2 += 0.1; }
    expect(gameState.stragglerSpawnedThisGap).toBe(false);
    expect(gameState.waveActive).toBe(false); // 仍在 gap（4s < 6s）
    expect(gameState.enemies.length).toBe(0); // 无残兵，波 2 尚未生成
  });

  it('首波预演期（waveNumber=0）：不刷残兵', () => {
    setupNight(2, 2);
    let t = 0;
    while (gameState.waveNumber === 0 && t < 5) { updateCombat(0.1); t += 0.1; }
    expect(gameState.stragglerSpawnedThisGap).toBe(false);
  });
});

describe('批次二·新手第 1 夜分阶段引导（第 1 局 vs 第 2 局行为差异）', () => {
  it('第 1 局第 1 夜：战术牌层锁定（无初始手牌、8s 补抽被拦、终章禁用）+ 主堡耐久 +50% 失败保护', () => {
    setupNight(1, 1);
    // 战术牌锁定
    expect(gameState.isTutorialNight()).toBe(true);
    expect(gameState.tacticHand.length).toBe(0);
    gameState.drawTacticCards(3); // 入口守卫应拦截
    expect(gameState.tacticHand.length).toBe(0);
    expect(gameState.useCommanderUltimate()).toBe(false);
    // 耐久保护：主堡 1000 → 1500
    expect(gameState.mainKeepMaxHealth).toBe(1500);
    expect(gameState.tutorialBuffApplied).toBe(true);
    // 8 秒补抽路径也不进牌
    let t = 0;
    while (t < 9 && gameState.waveNumber === 0) { updateCombat(0.5); t += 0.5; }
    expect(gameState.tacticHand.length).toBe(0);
  });

  it('第 1 局第 1 夜夜末：耐久保护对称恢复（1000 上限，已损失量保留）', () => {
    setupNight(1, 1);
    // 夜内被打掉一些耐久（例如 300）
    gameState.mainKeepHealth = 1200; // 1500 上限下已损 300
    gameState.enemies = [];
    // 快进到波 3 并清空收夜
    let guard = 0;
    while (gameState.phase === 'night' && guard < 4000) {
      if (gameState.waveActive) gameState.enemies = []; // 加速清波
      updateCombat(0.1);
      guard++;
    }
    expect(gameState.phase).toBe('night_settlement');
    expect(gameState.tutorialBuffApplied).toBe(false);
    // 1200/1.5=800 ≤ 1000：恢复后 800，已损 200（=300/1.5，比例保留）
    expect(gameState.mainKeepMaxHealth).toBe(1000);
    expect(gameState.mainKeepHealth).toBe(800);
  });

  it('跳过引导 = 关闭整局新手模式：战术牌立即解锁补抽、耐久保护保留到夜末（防结算跳变）', () => {
    setupNight(1, 1);
    expect(gameState.isTutorialNight()).toBe(true);
    gameState.dismissTutorial();
    expect(gameState.isTutorialNight()).toBe(false);
    expect(gameState.isTutorialRun()).toBe(false);
    // 解锁后可正常抽牌（UI 跳过回调会补抽 3 张，此处验证入口已放行）
    gameState.drawTacticCards(3);
    expect(gameState.tacticHand.length).toBe(3);
    // 耐久保护不瞬间撤除（防夜内跳过导致耐久跳变意外失守）
    expect(gameState.mainKeepMaxHealth).toBe(1500);
    expect(gameState.tutorialBuffApplied).toBe(true);
  });

  it('第 1 局第 2 夜：战术牌层开放（延迟到第 2 夜）、无耐久保护', () => {
    setupNight(2, 1); // 同一局（runCount=1），但已是第 2 夜
    expect(gameState.isTutorialNight()).toBe(false);
    expect(gameState.tacticHand.length).toBe(3); // beginNight 正常抽 3
    expect(gameState.mainKeepMaxHealth).toBe(1000);
    expect(gameState.useCommanderUltimate()).toBe(true);
  });

  it('第 2 局第 1 夜：引导不再出现（runCount>1），行为与老局完全一致', () => {
    setupNight(1, 2); // 第 2 局的第 1 夜
    expect(gameState.isTutorialNight()).toBe(false);
    expect(gameState.tacticHand.length).toBe(3);
    expect(gameState.mainKeepMaxHealth).toBe(1000);
    expect(gameState.tutorialBuffApplied).toBe(false);
    expect(gameState.useCommanderUltimate()).toBe(true);
  });

  it('startGame 局数计数：provider 计数 +1 并持久化（第 2 局判定依据）', () => {
    let stored = 0;
    gameState.setRunCountProvider({ get: () => stored, set: n => { stored = n; } });
    gameState.startGame();
    expect(gameState.runCount).toBe(1);
    expect(stored).toBe(1);
    gameState.startGame();
    expect(gameState.runCount).toBe(2);
    expect(stored).toBe(2);
  });
});

describe('批次二·质检建议级：spatial-grid 越界钳制对称性', () => {
  it('实体轻微越界（负坐标）插入边缘格后，地图边缘附近的有限范围查询可命中（insert/query 钳制对称）', () => {
    const grid = new SpatialGrid<{ id: string; position: { x: number; z: number } }>(4, 34);
    // mapSize 34 → 边界 -17；实体在 -18（越界 1 单位）。
    // 修复前：insert 落负格 cx=-1，queryNearest 扫描范围钳制在 [0,dim-1] 扫不到 → 寻敌 miss。
    // 修复后：insert 钳制到边缘格 0，边缘查询可命中。
    grid.insert({ id: 'slightly-out', position: { x: -18, z: -18 } });
    const found = grid.queryNearest({ x: -16, z: -16 }, 5);
    expect(found?.id).toBe('slightly-out');
  });

  it('深度越界实体吸附边缘格，全图查询（Infinity）仍可发现（不再落入永不可达格）', () => {
    const grid = new SpatialGrid<{ id: string; position: { x: number; z: number } }>(4, 34);
    grid.insert({ id: 'far-out', position: { x: -100, z: -100 } });
    const found = grid.queryNearest({ x: 0, z: 0 }, Infinity);
    expect(found?.id).toBe('far-out');
  });
});
