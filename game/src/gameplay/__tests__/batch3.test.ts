import { describe, it, expect, afterEach } from 'vitest';
import { gameState, GameState, getRouteCountForDay, getNightRouteAngles, SAVE_VERSION } from '../game-state';
import { updateCombat } from '../combat';
import { getEnemyData, getUnitData } from '../../content/data';
import {
  setSaveStorageForTests, canSaveInCurrentPhase, persistSave, readSave, hasSave,
  clearSave, continueFromSave, initSaveAutoHooks, SAVE_STORAGE_KEY, type SaveStorage,
} from '../save-load';

/**
 * MVP 批次三·内容批测试：
 * 1. 存档系统（MVP-AC-17 / M1-T08）：昼夜边界自动存档、night_pending 回退点、版本拒载、局终清档、往返一致性
 * 2. 多路进攻路线制（MVP-AC-07 预演与实际一致 / MVP-AC-14 第 3 夜 2 路）
 * 3. 残兵奖励口径旋钮（stragglerMode，模拟器交叉复核发现的难度冲击 → 产品终裁前的口径开关）
 * 4. 结算收支明细（MVP-AC-12：击杀金币与战意转金分列）
 */

/** 隔离存储（每个 describe 共享一份，afterEach 清空）。 */
const store = new Map<string, string>();
const testStorage: SaveStorage = {
  getItem: k => store.get(k) ?? null,
  setItem: (k, v) => { store.set(k, v); },
  removeItem: k => { store.delete(k); },
};
setSaveStorageForTests(testStorage);

afterEach(() => {
  clearSave();
  gameState.stragglerMode = 'default'; // 全局校准旋钮不随 resetGame 复位，测试间手动还原
});

/** 构造一局中的某个白天/夜晚（与 batch2 同风格，隔离 UI 与局数记忆）。 */
function setupDay(day: number, runCount = 2): void {
  gameState.resetGame();
  gameState.runCount = runCount;
  gameState.dayCount = day;
  gameState.phase = 'day';
  gameState.buildings = [];
  gameState.squads = [];
}

function setupNight(day: number, runCount = 2): void {
  setupDay(day, runCount);
  gameState.mainKeepMaxHealth = 5000;
  gameState.mainKeepHealth = 5000;
  gameState.beginNight();
}

/** 两角的最小角距（弧度）。 */
function angDist(a: number, b: number): number {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return Math.min(d, Math.PI * 2 - d);
}

/** 状态哈希：覆盖存档载荷应保留的全部持久字段（往返一致性断言用）。 */
function stateHash(gs: GameState): string {
  return JSON.stringify({
    phase: gs.phase,
    dayCount: gs.dayCount, runCount: gs.runCount,
    gold: gs.gold, warSpirit: gs.warSpirit, mainKeepHealth: gs.mainKeepHealth,
    militaryUsed: gs.militaryUsed, workUsed: gs.workUsed,
    squads: gs.squads.map(s => [s.unitId, s.position.x, s.position.z, s.health, s.maxHealth, s.upgradeLevel, s.command]),
    buildings: gs.buildings.map(b => [b.buildingId, b.position.x, b.position.z, b.health, b.maxHealth, b.upgradeLevel]),
    armory: gs.armoryDeck.map(c => [c.card_id, c.upgrade_level ?? 0]),
    hand: gs.tacticHand.map(c => c.card_id),
    deck: gs.tacticDeck.map(c => c.card_id),
    discard: gs.tacticDiscard.map(c => c.card_id),
    damaged: gs.damagedCamp.map(d => [d.cardId, d.count]),
    recalled: Array.from(gs.recalledPending.entries()).sort(),
  });
}

describe('批次三·存档系统（MVP-AC-17 / M1-T08）', () => {
  it('canSaveInCurrentPhase：只有昼夜边界可存（day / night_settlement），夜中绝不落盘', () => {
    expect(canSaveInCurrentPhase('day')).toBe(true);
    expect(canSaveInCurrentPhase('night_settlement')).toBe(true);
    expect(canSaveInCurrentPhase('night')).toBe(false);
    expect(canSaveInCurrentPhase('night_transition')).toBe(false);
    expect(canSaveInCurrentPhase('day_transition')).toBe(false);
    expect(canSaveInCurrentPhase('menu')).toBe(false);
    expect(canSaveInCurrentPhase('game_over')).toBe(false);
  });

  it('夜中调用 persistSave 拒绝且不落盘', () => {
    const gs = new GameState();
    gs.phase = 'night';
    expect(persistSave(gs, 'day')).toBe(false);
    expect(testStorage.getItem(SAVE_STORAGE_KEY)).toBeNull();
  });

  it('版本不符拒载（技术规格 3.5）；损坏 JSON 视为无档', () => {
    const gs = new GameState();
    gs.phase = 'day'; gs.dayCount = 2;
    expect(persistSave(gs, 'day')).toBe(true);

    const raw = testStorage.getItem(SAVE_STORAGE_KEY)!;
    const tampered = JSON.parse(raw);
    tampered.version = '0.9.0-legacy';
    testStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(tampered));
    expect(readSave()).toBeNull();
    expect(hasSave()).toBe(false);
    const gs2 = new GameState();
    expect(continueFromSave(gs2)).toBe(false);

    testStorage.setItem(SAVE_STORAGE_KEY, '{{{not-json');
    expect(readSave()).toBeNull();
  });

  it('昼夜边界存档 10 轮往返：状态哈希一致（M1-T08 口径）', () => {
    for (let round = 1; round <= 10; round++) {
      const gs = new GameState();
      gs.phase = 'day';
      gs.dayCount = Math.min(round, 8);
      gs.runCount = 2;
      gs.gold = 500 + round * 37;
      gs.warSpirit = round % 5;
      gs.mainKeepHealth = 900 + round;

      // 班组（数量/升级等级/血量逐轮变化，覆盖动态值恢复）
      const squadCount = (round % 3) + 1;
      for (let i = 0; i < squadCount; i++) {
        expect(gs.spawnSquad('unit_archer', { x: i + 1, z: -2 })).toBe(true);
      }
      const sq = gs.squads[0];
      sq.upgradeLevel = round % 3;
      const unitData = getUnitData('unit_archer')!;
      sq.maxHealth = unitData.max_health * (1 + 0.5 * sq.upgradeLevel);
      sq.health = sq.maxHealth * 0.7;

      // 建筑（隔轮出现，含升级与受损血量）
      if (round % 2 === 0) {
        expect(gs.spawnBuilding('building_wall', { x: -3, z: round })).toBe(true);
        const b = gs.buildings[0];
        b.upgradeLevel = round % 2;
        b.health = b.maxHealth * 0.5;
      }

      // 军械册升级等级 / 受损归营堆 / 已修复待落阵 / 战术牌三区（真实抽牌路径）
      gs.armoryDeck[0].upgrade_level = round % 3;
      gs.damagedCamp.push({ cardId: 'card_unit_archer', count: (round % 2) + 1 });
      gs.recalledPending.set('card_building_wall', round % 3);
      gs.drawTacticCards(3);

      expect(persistSave(gs, 'day')).toBe(true);
      const gs2 = new GameState();
      expect(continueFromSave(gs2)).toBe(true);
      expect(gs2.phase).toBe('day');
      expect(stateHash(gs2)).toBe(stateHash(gs));
    }
  });

  it('night_pending 回退点：夜中退出后「继续游戏」回到本夜开始（入夜前的白天态）', () => {
    const gs = new GameState();
    gs.runCount = 2; gs.dayCount = 4; gs.phase = 'day';
    gs.gold = 321;
    expect(gs.spawnSquad('unit_pikeman', { x: 0, z: 5 })).toBe(true);

    gs.startNight(); // → night_transition（入夜前快照时机）
    expect(gs.phase).toBe('night_transition');
    expect(persistSave(gs, 'night_pending')).toBe(true);
    const payload = readSave()!;
    expect(payload.marker).toBe('night_pending');
    expect(payload.dayCount).toBe(4);

    const gs2 = new GameState();
    expect(continueFromSave(gs2)).toBe(true);
    expect(gs2.phase).toBe('day');   // 回退到本夜开始 = 入夜前的昼夜边界
    expect(gs2.dayCount).toBe(4);
    expect(gs2.gold).toBe(321);
    expect(gs2.squads.length).toBe(1);
    expect(gs2.squads[0].unitId).toBe('unit_pikeman');
  });

  it('自动存档钩子：入夜 night_pending / 天亮结算后 day 档（dayCount≥2）/ 局终清档', () => {
    const dispose = initSaveAutoHooks(gameState);
    setupDay(3);
    gameState.startNight(); // → night_transition：钩子存 night_pending
    expect(hasSave()).toBe(true);
    expect(readSave()!.marker).toBe('night_pending');

    gameState.update(3); // 过渡结束 → beginNight
    expect(gameState.phase).toBe('night');
    gameState.endNight();
    expect(gameState.phase).toBe('night_settlement');
    gameState.startNextDay(); // → day_transition，dayCount 4
    gameState.update(2);      // → day：钩子存 day 档
    expect(gameState.phase).toBe('day');
    const payload = readSave()!;
    expect(payload.marker).toBe('day');
    expect(payload.dayCount).toBe(4);

    gameState.gameOver(false); // 局终 → 钩子清档
    expect(hasSave()).toBe(false);
    dispose();
  });

  it('跨局 Meta 零数值：存档载荷不含任何跨局数值加成字段（只存本局状态）', () => {
    const gs = new GameState();
    gs.phase = 'day'; gs.dayCount = 2; gs.runCount = 3;
    persistSave(gs, 'day');
    const payload = readSave()!;
    // 版本/标记/时间戳之外，载荷字段白名单 = 本局进行中状态；不得出现任何跨局数值（如 meta 加成/解锁计数）
    const allowed = new Set(['version', 'marker', 'save_time', 'dayCount', 'runCount', 'tutorialDismissed',
      'gold', 'warSpirit', 'mainKeepHealth', 'squads', 'buildings', 'armory',
      'tacticHand', 'tacticDeck', 'tacticDiscard', 'damagedCamp', 'recalledPending']);
    for (const key of Object.keys(payload)) {
      expect(allowed.has(key)).toBe(true);
    }
    expect(payload.version).toBe(SAVE_VERSION);
  });
});

describe('批次三·多路进攻路线制（MVP-AC-07 / MVP-AC-14）', () => {
  it('路线数按昼夜递增：1 夜 1 路 / 第 3 夜 2 路（MVP-AC-14）/ 第 6 夜起 3 路', () => {
    expect(getRouteCountForDay(1)).toBe(1);
    expect(getRouteCountForDay(2)).toBe(2);
    expect(getRouteCountForDay(3)).toBe(2); // MVP-AC-14：第 3 夜 2 路进攻
    expect(getRouteCountForDay(5)).toBe(2);
    expect(getRouteCountForDay(6)).toBe(3);
    expect(getRouteCountForDay(8)).toBe(3);
  });

  it('路线角确定性（只依赖昼夜数）：同夜两次生成一致、等距分布', () => {
    const a = getNightRouteAngles(3);
    const b = getNightRouteAngles(3);
    expect(a).toEqual(b);
    expect(a.length).toBe(2);
    expect(angDist(a[1] - a[0], Math.PI)).toBeLessThan(1e-9); // 2 路等距（夹角 π）
    const c = getNightRouteAngles(6);
    expect(c.length).toBe(3);
    expect(angDist(c[1] - c[0], (Math.PI * 2) / 3)).toBeLessThan(1e-9);
  });

  it('MVP-AC-07：威胁预演路线与实际进攻出生方位一致（同源 nightRouteAngles）', () => {
    setupNight(3);
    const routes = getNightRouteAngles(3);
    expect(gameState.nightRouteAngles).toEqual(routes);
    expect(gameState.wavePreview!.routes).toEqual(routes); // 预演携带路线

    // 快进到波 1 生成（生成当帧出生位置未被移动）
    let t = 0;
    while (gameState.waveNumber < 1 && t < 10) { updateCombat(0.1); t += 0.1; }
    expect(gameState.enemies.length).toBeGreaterThan(0);
    for (const en of gameState.enemies) {
      const angle = Math.atan2(en.position.z, en.position.x);
      const minDist = Math.min(...routes.map(r => angDist(angle, r)));
      expect(minDist).toBeLessThanOrEqual(0.08 + 1e-9); // 路内确定性散布 ±0.08
      expect(en.isStraggler).toBe(false); // 波次敌人不是残兵
    }
  });

  it('第 1 夜单路线（新手聚焦）：所有敌人沿唯一路线进场', () => {
    setupNight(1, 1);
    const routes = getNightRouteAngles(1);
    expect(routes.length).toBe(1);
    let t = 0;
    while (gameState.waveNumber < 1 && t < 10) { updateCombat(0.1); t += 0.1; }
    for (const en of gameState.enemies) {
      const angle = Math.atan2(en.position.z, en.position.x);
      expect(angDist(angle, routes[0])).toBeLessThanOrEqual(0.08 + 1e-9);
    }
  });
});

describe('批次三·残兵奖励口径旋钮（stragglerMode）', () => {
  const wolf = getEnemyData('enemy_wolf')!;

  /** 波 1 清空后快进到间隙过半，返回此时场上敌人（= 本轮残兵）。 */
  function spawnStragglersAndRead(): void {
    let t = 0;
    while (gameState.waveNumber < 1 && t < 10) { updateCombat(0.1); t += 0.1; }
    gameState.enemies = [];
    updateCombat(0.1); // 触发清波 → 间隙开始
    let t2 = 0;
    while (t2 < 6 && gameState.enemies.length === 0 && gameState.waveNumber < 2) {
      updateCombat(0.1);
      t2 += 0.1;
    }
  }

  it('default（v7 现状）：波间过半刷 2 只狼，全部带 isStraggler 标记', () => {
    gameState.stragglerMode = 'default';
    setupNight(3);
    spawnStragglersAndRead();
    expect(gameState.stragglerSpawnedThisGap).toBe(true);
    expect(gameState.enemies.length).toBe(2);
    expect(gameState.enemies.every(e => e.enemyId === 'enemy_wolf' && e.isStraggler)).toBe(true);
  });

  it('single：减为 1 只/波间', () => {
    gameState.stragglerMode = 'single';
    setupNight(3);
    spawnStragglersAndRead();
    expect(gameState.enemies.length).toBe(1);
    expect(gameState.enemies[0].isStraggler).toBe(true);
  });

  it('off：消融关闭（不刷残兵，间隙保持无敌空窗——供对照口径）', () => {
    gameState.stragglerMode = 'off';
    setupNight(3);
    spawnStragglersAndRead();
    expect(gameState.stragglerSpawnedThisGap).toBe(true); // 状态机照常推进
    expect(gameState.enemies.length).toBe(0);              // 但没有残兵入场
  });

  it('no_reward：残兵纯填充零奖励；波次敌人全额奖励不受旋钮影响', () => {
    gameState.stragglerMode = 'no_reward';
    setupNight(2);
    const g0 = gameState.gold, w0 = gameState.warSpirit, k0 = gameState.killGoldThisNight;
    gameState.spawnEnemy('enemy_wolf', { x: 5, z: 5 }, true);
    gameState.removeEnemy(gameState.enemies[0].id);
    expect(gameState.gold).toBe(g0);
    expect(gameState.warSpirit).toBe(w0);
    expect(gameState.killGoldThisNight).toBe(k0);
    // 波次敌人全额
    gameState.spawnEnemy('enemy_wolf', { x: -5, z: 5 }, false);
    gameState.removeEnemy(gameState.enemies[0].id);
    expect(gameState.gold).toBeCloseTo(g0 + wolf.reward_gold, 6);
    expect(gameState.warSpirit).toBeCloseTo(w0 + wolf.reward_war_spirit, 6);
    expect(gameState.killGoldThisNight).toBeCloseTo(k0 + wolf.reward_gold, 6);
  });

  it('half_reward：残兵奖励减半（金与战意同口径）', () => {
    gameState.stragglerMode = 'half_reward';
    setupNight(2);
    const g0 = gameState.gold, w0 = gameState.warSpirit, k0 = gameState.killGoldThisNight;
    gameState.spawnEnemy('enemy_wolf', { x: 5, z: 5 }, true);
    gameState.removeEnemy(gameState.enemies[0].id);
    expect(gameState.gold).toBeCloseTo(g0 + wolf.reward_gold / 2, 6);
    expect(gameState.warSpirit).toBeCloseTo(w0 + wolf.reward_war_spirit / 2, 6);
    expect(gameState.killGoldThisNight).toBeCloseTo(k0 + wolf.reward_gold / 2, 6);
  });

  it('旋钮为全局校准性质：不随 resetGame 复位', () => {
    gameState.stragglerMode = 'single';
    gameState.resetGame();
    expect(gameState.stragglerMode).toBe('single');
  });
});

describe('批次三·结算收支明细（MVP-AC-12）', () => {
  it('夜末清算：总收入 = 击杀金币 + 战意结余转金（分列可核对）', () => {
    setupNight(2);
    // 击杀 3 只波次狼（全额奖励：每只 2 金 + 1 意）
    for (let i = 0; i < 3; i++) {
      gameState.spawnEnemy('enemy_wolf', { x: 10 + i, z: 10 }, false);
      gameState.removeEnemy(gameState.enemies[gameState.enemies.length - 1].id);
    }
    const killGold = gameState.killGoldThisNight;
    expect(killGold).toBe(6);
    expect(gameState.warSpirit).toBe(3);

    gameState.endNight();
    expect(gameState.spiritConvertedLastNight).toBe(1); // floor(3 × 0.5)
    expect(gameState.goldEarnedThisNight).toBeCloseTo(killGold + gameState.spiritConvertedLastNight, 6);
    expect(gameState.enemiesKilledThisNight).toBe(3);
  });
});
