import { describe, it, expect, beforeEach } from 'vitest';
import { gameState, TOTAL_WAVES, VICTORY_DAYS } from '../game-state';
import { updateCombat } from '../combat';
import { getUnitData, getEnemyData, getCardData } from '../../content/data';

/** 固定步长模拟器：seconds 秒内每 dt 步调用一次 updateCombat。 */
function simulate(seconds: number, dt: number): void {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    updateCombat(dt);
  }
}

/** 构造纯战斗环境：夜间、无波次干扰（间隙与夜时长拉长到 1000s）。 */
function setupNightArena(): void {
  gameState.resetGame();
  gameState.phase = 'night';
  gameState.gapTimer = 1000;
  gameState.nightDuration = 1000;
  gameState.enemies = [];
  gameState.squads = [];
  gameState.buildings = [];
  gameState.activeEffects = [];
  gameState.warSpirit = 0;
}

describe('B1：敌方伤害为事件式固定伤害（无帧率依赖）', () => {
  it('dt=1/60 与 dt=1/30 各模拟 10 秒，班组掉血总量相等且 = 10×damage', () => {
    const wolfData = getEnemyData('enemy_wolf')!;

    const runOnce = (dt: number): number => {
      setupNightArena();
      gameState.spawnSquad('unit_shieldbearer', { x: 0, z: 0 });
      const squad = gameState.squads[0];
      squad.command = 'hold';

      gameState.spawnEnemy('enemy_wolf', { x: 1.0, z: 0 });
      const wolf = gameState.enemies[0];
      wolf.health = 1e9;
      wolf.maxHealth = 1e9;

      const hpBefore = squad.health;
      simulate(10, dt);
      return hpBefore - squad.health;
    };

    const damage60 = runOnce(1 / 60);
    const damage30 = runOnce(1 / 30);

    expect(damage60).toBe(damage30);
    expect(damage60).toBe(10 * wolfData.damage);
  });
});

describe('B2：枪卒反冲锋加成与主攻击同拍结算', () => {
  it('单枪卒对狼 10 秒总输出 = ⌈10/attack_speed⌉×(伤害×1.5)', () => {
    const pikeman = getUnitData('unit_pikeman')!;
    const wolfData = getEnemyData('enemy_wolf')!;

    const runOnce = (dt: number): number => {
      setupNightArena();
      gameState.spawnSquad('unit_pikeman', { x: 0, z: 0 });
      const squad = gameState.squads[0];
      squad.command = 'hold';

      gameState.spawnEnemy('enemy_wolf', { x: 1.0, z: 0 });
      const wolf = gameState.enemies[0];
      wolf.health = 1e9;
      wolf.maxHealth = 1e9;

      simulate(10, dt);
      return 1e9 - wolf.health;
    };

    const expectedHits = Math.ceil(10 / pikeman.attack_speed); // ⌈10/1.3⌉ = 8
    const expected = expectedHits * (pikeman.attack_damage * 1.5); // 每击 10+5=15

    // 狼（移速 3.5 > 3.0）触发反冲锋加成的前提成立
    expect(wolfData.move_speed).toBeGreaterThan(3.0);

    expect(runOnce(1 / 60)).toBe(expected);
    expect(runOnce(1 / 30)).toBe(expected);
  });

  it('非冲锋型敌人（移速 ≤ 3.0）不触发反冲锋加成', () => {
    setupNightArena();
    gameState.spawnSquad('unit_pikeman', { x: 0, z: 0 });
    const squad = gameState.squads[0];
    squad.command = 'hold';
    squad.health = 1e6; // 防止被反击击杀干扰输出计量

    gameState.spawnEnemy('enemy_shield_crusher', { x: 1.0, z: 0 }); // 移速 2.0
    const enemy = gameState.enemies[0];
    enemy.health = 1e9;
    enemy.maxHealth = 1e9;

    simulate(10, 1 / 60);

    const pikeman = getUnitData('unit_pikeman')!;
    const hits = Math.ceil(10 / pikeman.attack_speed);
    expect(1e9 - enemy.health).toBe(hits * pikeman.attack_damage); // 每击 10，无加成
  });
});

describe('B3：初始军械册 6 张全量', () => {
  it('resetGame 后 armoryDeck.length === 6，含枪卒班与兵营卡', () => {
    gameState.resetGame();
    expect(gameState.armoryDeck.length).toBe(6);
    const ids = gameState.armoryDeck.map(c => c.card_id);
    expect(ids).toContain('card_unit_pikeman');
    expect(ids).toContain('card_building_barracks');
    expect(ids).toContain('card_unit_shieldbearer');
    expect(ids).toContain('card_unit_archer');
    expect(ids).toContain('card_building_wall');
    expect(ids).toContain('card_building_arrow_tower');
  });
});

describe('I6：战意产出对齐设计（接敌班每秒 0.5）', () => {
  it('单班接敌 10 秒共产出约 5 点战意（而非每次攻击 +0.5）', () => {
    setupNightArena();
    gameState.spawnSquad('unit_shieldbearer', { x: 0, z: 0 });
    gameState.squads[0].command = 'hold';

    gameState.spawnEnemy('enemy_wolf', { x: 1.0, z: 0 });
    const wolf = gameState.enemies[0];
    wolf.health = 1e9;
    wolf.maxHealth = 1e9;

    simulate(10, 1 / 60);

    // 10 秒 × 0.5/秒 = 5；若仍是旧逻辑（每次攻击 +0.5，冷却 1.5s），会得到 ~3.3
    expect(gameState.warSpirit).toBeCloseTo(5, 5);
  });

  it('撤退指令触发 5 秒战意封锁，封锁期内不产战意', () => {
    setupNightArena();
    gameState.spawnSquad('unit_shieldbearer', { x: 0, z: 0 });
    const squad = gameState.squads[0];
    squad.command = 'hold';

    gameState.spawnEnemy('enemy_wolf', { x: 1.0, z: 0 });
    const wolf = gameState.enemies[0];
    wolf.health = 1e9;
    wolf.maxHealth = 1e9;

    gameState.selectedSquadId = squad.id;
    gameState.issueSquadCommand('retreat');

    expect(squad.warSpiritBlockTimer).toBe(5);
    simulate(4, 1 / 60); // 封锁期内
    expect(gameState.warSpirit).toBe(0);
  });
});

describe('I3：同名牌升级与受损归营堆', () => {
  beforeEach(() => {
    gameState.resetGame();
    gameState.startGame(); // phase: day
  });

  it('同名牌再次落阵 → 升级 Lv2，规模 +50%', () => {
    expect(gameState.deployArmoryCard('card_unit_pikeman', { x: 0, z: 0 })).toBe(true);
    const sq = gameState.squads.find(s => s.unitId === 'unit_pikeman')!;
    expect(sq.upgradeLevel).toBe(0);
    expect(sq.health).toBe(getUnitData('unit_pikeman')!.max_health);

    expect(gameState.deployArmoryCard('card_unit_pikeman', { x: 0, z: 0 })).toBe(true);
    expect(sq.upgradeLevel).toBe(1);
    expect(sq.maxHealth).toBe(getUnitData('unit_pikeman')!.max_health * 1.5);
  });

  it('班组阵亡 → 入归营堆 → 50% 金币修复 → 再次落阵半血入场', () => {
    const card = getCardData('card_unit_pikeman')!;
    gameState.deployArmoryCard('card_unit_pikeman', { x: 0, z: 0 });
    const sq = gameState.squads.find(s => s.unitId === 'unit_pikeman')!;

    gameState.squadDestroyed(sq);
    expect(gameState.damagedCamp.length).toBe(1);
    expect(gameState.damagedCamp[0].cardId).toBe('card_unit_pikeman');

    // 受损状态下不允许直接部署
    expect(gameState.deployArmoryCard('card_unit_pikeman', { x: 0, z: 0 })).toBe(false);

    const goldBefore = gameState.gold;
    expect(gameState.repairDamagedCard('card_unit_pikeman')).toBe(true);
    expect(gameState.gold).toBe(goldBefore - Math.ceil(card.cost_day * 0.5));
    expect(gameState.damagedCamp.length).toBe(0);

    expect(gameState.deployArmoryCard('card_unit_pikeman', { x: 2, z: 2 })).toBe(true);
    const respawn = gameState.squads.find(s => s.unitId === 'unit_pikeman')!;
    expect(respawn.health).toBe(getUnitData('unit_pikeman')!.max_health * 0.5);
  });
});

describe('I5：8 昼夜通关判定', () => {
  it('守住第 8 夜后进入夜末清算 → 下一天结算为胜利', () => {
    gameState.resetGame();
    gameState.phase = 'night';
    gameState.dayCount = VICTORY_DAYS;

    gameState.endNight();
    expect(gameState.victoryPending).toBe(true);

    gameState.startNextDay();
    expect(gameState.phase).toBe('game_over');
  });

  it('未到第 8 夜时夜末正常进入次日', () => {
    gameState.resetGame();
    gameState.phase = 'night';
    gameState.dayCount = 3;

    gameState.endNight();
    expect(gameState.victoryPending).toBe(false);

    gameState.startNextDay();
    expect(gameState.phase).toBe('day_transition');
    expect(gameState.dayCount).toBe(4);
  });
});

describe('I7：数值对齐设计文档基准', () => {
  it('军令容量 6 / 工令容量 8 / 夜时长 240s / 每夜 3 波', () => {
    gameState.resetGame();
    expect(gameState.militaryCapacity).toBe(6);
    expect(gameState.workCapacity).toBe(8);
    expect(gameState.nightDuration).toBe(240);
    expect(TOTAL_WAVES).toBe(3);
  });
});


describe('盾墙：激活期间班组承伤 = 70%（质检 N 系列补测）', () => {
  it('盾墙激活时班组 10 秒掉血 = 10×damage×0.7（两种 dt 一致）', () => {
    const wolfData = getEnemyData('enemy_wolf')!;

    const runOnce = (dt: number): number => {
      setupNightArena();
      gameState.spawnSquad('unit_shieldbearer', { x: 0, z: 0 });
      const squad = gameState.squads[0];
      squad.command = 'hold';

      gameState.spawnEnemy('enemy_wolf', { x: 1.0, z: 0 });
      const wolf = gameState.enemies[0];
      wolf.health = 1e9;
      wolf.maxHealth = 1e9;

      // 盾墙：全军承伤 -30%（持续拉长到 100s 覆盖整个计量窗口）
      gameState.activeEffects.push({
        type: 'shield_wall',
        duration: 100,
        params: { damageReduction: 0.3 },
      });

      const hpBefore = squad.health;
      simulate(10, dt);
      return hpBefore - squad.health;
    };

    const expected = 10 * wolfData.damage * 0.7;
    expect(runOnce(1 / 60)).toBeCloseTo(expected, 6);
    expect(runOnce(1 / 30)).toBeCloseTo(expected, 6);
  });

  it('未激活盾墙时班组 10 秒掉血 = 10×damage（对照，确认减伤仅来自盾墙）', () => {
    const wolfData = getEnemyData('enemy_wolf')!;
    setupNightArena();
    gameState.spawnSquad('unit_shieldbearer', { x: 0, z: 0 });
    const squad = gameState.squads[0];
    squad.command = 'hold';

    gameState.spawnEnemy('enemy_wolf', { x: 1.0, z: 0 });
    const wolf = gameState.enemies[0];
    wolf.health = 1e9;
    wolf.maxHealth = 1e9;

    const hpBefore = squad.health;
    simulate(10, 1 / 60);
    expect(hpBefore - squad.health).toBe(10 * wolfData.damage);
  });
});

describe('N1：紧急增援出牌预检与退款兜底', () => {
  it('军令容量满时出牌被拒：战意、手牌、弃牌堆、场上班组均不变', () => {
    setupNightArena();
    gameState.warSpirit = 30;
    gameState.firstTacticFree = false; // 关闭首张免费被动，测付费路径
    gameState.militaryUsed = gameState.militaryCapacity; // 拉满军令

    const reinforce = getCardData('card_tactic_reinforce')!;
    gameState.tacticHand = [reinforce];

    const spiritBefore = gameState.warSpirit;
    const discardBefore = gameState.tacticDiscard.length;

    const ok = gameState.playTacticCard(0, { x: 5, z: 5 });

    expect(ok).toBe(false);
    expect(gameState.canPlayTacticCard(reinforce)).toBe(false);
    expect(gameState.warSpirit).toBe(spiritBefore);
    expect(gameState.tacticHand).toHaveLength(1);
    expect(gameState.tacticHand[0].card_id).toBe('card_tactic_reinforce');
    expect(gameState.tacticDiscard.length).toBe(discardBefore);
    expect(gameState.squads).toHaveLength(0);
  });

  it('容量充足时正常召唤：扣 7 战意（定价终裁 rev32）、卡进弃牌堆、应急盾卫入场', () => {
    setupNightArena();
    gameState.warSpirit = 30;
    gameState.firstTacticFree = false; // 关闭首张免费被动，测付费路径

    const reinforce = getCardData('card_tactic_reinforce')!;
    gameState.tacticHand = [reinforce];

    const ok = gameState.playTacticCard(0, { x: 5, z: 5 });

    expect(ok).toBe(true);
    expect(gameState.canPlayTacticCard(reinforce)).toBe(true);
    expect(gameState.warSpirit).toBe(23); // 30 - 7（定价终裁 rev32）
    expect(reinforce.cost_night).toBe(7); // 校准锚点：增援牌定价 7 战意
    expect(gameState.tacticDiscard).toContain(reinforce);
    expect(gameState.squads).toHaveLength(1);
    expect(gameState.squads[0].unitId).toBe('unit_shieldbearer');
    expect(gameState.squads[0].isEmergency).toBe(true);
    expect(gameState.militaryUsed).toBe(1);
  });
});


describe('N4：修复即含再入场（一次性 50% 金币，无二次收费）', () => {
  it('修复只扣 50% 金币，落阵免费且半血，不再有第二次收费', () => {
    gameState.resetGame();
    gameState.phase = 'day';
    const card = getCardData('card_unit_pikeman')!;
    gameState.gold = 200;

    gameState.deployArmoryCard('card_unit_pikeman', { x: 0, z: 0 });
    const sq = gameState.squads.find(s => s.unitId === 'unit_pikeman')!;
    gameState.squadDestroyed(sq);

    // 第一次收费：修复 50%（含再入场）
    const goldAfterDeploy = gameState.gold;
    expect(gameState.repairDamagedCard('card_unit_pikeman')).toBe(true);
    expect(gameState.gold).toBe(goldAfterDeploy - Math.ceil(card.cost_day * 0.5));

    // 第二次收费不存在：落阵金币不动，实体以半血可部署状态入场
    expect(gameState.deployArmoryCard('card_unit_pikeman', { x: 2, z: 2 })).toBe(true);
    expect(gameState.gold).toBe(goldAfterDeploy - Math.ceil(card.cost_day * 0.5));
    const respawn = gameState.squads.find(s => s.unitId === 'unit_pikeman')!;
    expect(respawn).toBeDefined();
    expect(respawn.health).toBe(getUnitData('unit_pikeman')!.max_health * 0.5);
    expect(gameState.recalledPending.get('card_unit_pikeman')).toBeUndefined();

    // 未受损卡正常部署仍收全额（对照组，确认免费只来自修复名额）
    const goldBeforeArcher = gameState.gold;
    expect(gameState.deployArmoryCard('card_unit_archer', { x: 3, z: 3 })).toBe(true);
    expect(gameState.gold).toBe(goldBeforeArcher - getCardData('card_unit_archer')!.cost_day);
  });

  it('同名卡受损 count>1：逐张修复各扣 50%，名额计数不丢失', () => {
    gameState.resetGame();
    gameState.phase = 'day';
    const card = getCardData('card_unit_pikeman')!;
    gameState.gold = 500;
    // 直接构造归营堆两张（一队阵亡 + 一支应急同源班夜末归堆的等价场景）
    gameState.damagedCamp = [{ cardId: 'card_unit_pikeman', count: 2 }];

    const gold0 = gameState.gold;
    expect(gameState.repairDamagedCard('card_unit_pikeman')).toBe(true);
    expect(gameState.gold).toBe(gold0 - Math.ceil(card.cost_day * 0.5));
    expect(gameState.damagedCamp[0].count).toBe(1);
    expect(gameState.recalledPending.get('card_unit_pikeman')).toBe(1);

    // 堆里还有一张受损卡 → 不允许直接部署（须先修复）
    expect(gameState.deployArmoryCard('card_unit_pikeman', { x: 0, z: 0 })).toBe(false);

    expect(gameState.repairDamagedCard('card_unit_pikeman')).toBe(true);
    expect(gameState.gold).toBe(gold0 - 2 * Math.ceil(card.cost_day * 0.5));
    expect(gameState.damagedCamp.length).toBe(0);
    expect(gameState.recalledPending.get('card_unit_pikeman')).toBe(2);

    // 第一次落阵：免费半血，消耗一张名额
    const goldBeforeDeploy = gameState.gold;
    expect(gameState.deployArmoryCard('card_unit_pikeman', { x: 1, z: 1 })).toBe(true);
    expect(gameState.gold).toBe(goldBeforeDeploy);
    expect(gameState.recalledPending.get('card_unit_pikeman')).toBe(1);

    // 第二次落阵（同名升级路径之外的再次入场）：仍免费半血，名额清零
    const first = gameState.squads.find(s => s.unitId === 'unit_pikeman')!;
    gameState.removeSquad(first.id); // 模拟再次阵亡后的直接再部署（名额仍在）
    expect(gameState.deployArmoryCard('card_unit_pikeman', { x: 2, z: 2 })).toBe(true);
    expect(gameState.gold).toBe(goldBeforeDeploy);
    expect(gameState.recalledPending.get('card_unit_pikeman')).toBeUndefined();
    const second = gameState.squads.find(s => s.unitId === 'unit_pikeman')!;
    expect(second.health).toBe(getUnitData('unit_pikeman')!.max_health * 0.5);
  });
});

describe('N3：紧急增援牌入初始战术牌库', () => {
  it('resetGame 后牌库含 5 张战术牌，紧急增援可获得（4→5）', () => {
    gameState.resetGame();
    const ids = gameState.tacticDeck.map(c => c.card_id).sort();
    expect(ids).toHaveLength(5);
    expect(ids).toContain('card_tactic_reinforce');
    expect(ids).toEqual([
      'card_tactic_fire_oil',
      'card_tactic_rally',
      'card_tactic_reinforce',
      'card_tactic_shield_wall',
      'card_tactic_volley',
    ]);
  });
});

describe('M1 校准：敌方伤害 ×0.6 落地', () => {
  it('狼 4 / 盾卫 6 / 掘地者 5（设计文档 rev30 附录基准）', () => {
    expect(getEnemyData('enemy_wolf')!.damage).toBe(4);
    expect(getEnemyData('enemy_shield_crusher')!.damage).toBe(6);
    expect(getEnemyData('enemy_burrower')!.damage).toBe(5);
  });

  it('B1 断言在新数值下仍成立：10 秒掉血 = 10×4', () => {
    setupNightArena();
    gameState.spawnSquad('unit_shieldbearer', { x: 0, z: 0 });
    const squad = gameState.squads[0];
    squad.command = 'hold';
    gameState.spawnEnemy('enemy_wolf', { x: 1.0, z: 0 });
    const wolf = gameState.enemies[0];
    wolf.health = 1e9;
    wolf.maxHealth = 1e9;
    const hpBefore = squad.health;
    simulate(10, 1 / 60);
    expect(hpBefore - squad.health).toBe(40);
  });
});



describe('应急班夜末消散（批次一裁决：产品定案第 4 条「召唤物、夜末消散」）', () => {
  it('夜末清算：应急班从场上移除、不入受损归营堆、军令占用释放、次日无残留', () => {
    setupNightArena();
    gameState.firstTacticFree = false;

    // 常规盾卫班 + 应急盾卫班同场
    expect(gameState.spawnSquad('unit_shieldbearer', { x: -3, z: -3 })).toBe(true);
    const regular = gameState.squads.find(sq => !sq.isEmergency)!;
    expect(gameState.spawnSquad('unit_shieldbearer', { x: 3, z: 3 }, true)).toBe(true);
    const emergency = gameState.squads.find(sq => sq.isEmergency)!;

    const cost = getUnitData('unit_shieldbearer')!.military_cost;
    expect(gameState.militaryUsed).toBe(cost * 2);
    const usedBefore = gameState.militaryUsed;

    // 夜末清算
    gameState.endNight();
    expect(gameState.phase).toBe('night_settlement');

    // 1) 应急班从场上移除，常规班保留
    expect(gameState.squads.some(sq => sq.id === emergency.id)).toBe(false);
    expect(gameState.squads.some(sq => sq.id === regular.id)).toBe(true);
    expect(gameState.squads.every(sq => !sq.isEmergency)).toBe(true);

    // 2) 不入受损归营堆（修复再入场路径对应急班彻底关闭）
    expect(gameState.damagedCamp.find(d => d.cardId === 'card_unit_shieldbearer')).toBeUndefined();
    expect(gameState.damagedCamp.length).toBe(0);

    // 3) 不进修复再入场计数（N4 recalledPending）
    expect(gameState.recalledPending.size).toBe(0);

    // 4) 军令占用随消散释放（记账修复：原 filter 绕过 removeSquad 造成幽灵占用）
    expect(gameState.militaryUsed).toBe(usedBefore - cost);

    // 5) 次日无残留
    gameState.startNextDay();
    expect(gameState.squads.some(sq => sq.id === emergency.id)).toBe(false);
    expect(gameState.squads.some(sq => sq.id === regular.id)).toBe(true);
  });

  it('对照：常规班夜末不清场也不入堆（入堆仅发生在阵亡路径）', () => {
    setupNightArena();
    gameState.spawnSquad('unit_pikeman', { x: 0, z: 0 });
    const regular = gameState.squads[0];

    gameState.endNight();

    expect(gameState.squads.some(sq => sq.id === regular.id)).toBe(true);
    expect(gameState.damagedCamp.length).toBe(0);
  });
});

describe('空间网格寻敌一致性（批次一·性能项）', () => {
  it('网格最近邻查询与暴力全表扫描结果一致（含边界 cell 与 maxRange 语义）', async () => {
    const { SpatialGrid } = await import('../spatial-grid');
    type Item = { id: string; position: { x: number; z: number } };

    // 伪随机（固定种子，结果可复现）：撒 200 实体于地图范围
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const items: Item[] = [];
    const grid = new SpatialGrid<Item>(4, 34);
    for (let i = 0; i < 200; i++) {
      const item: Item = { id: `e${i}`, position: { x: rand() * 27 - 13.5, z: rand() * 27 - 13.5 } };
      items.push(item);
      grid.insert(item);
    }

    const brute = (pos: { x: number; z: number }, range: number): Item | null => {
      let nearest: Item | null = null;
      let minDist = range;
      for (const it of items) {
        const d = Math.hypot(it.position.x - pos.x, it.position.z - pos.z);
        if (d < minDist) {
          minDist = d;
          nearest = it;
        }
      }
      return nearest;
    };

    // 20 个查询点 × 4 档 range：网格与暴力结果同距（并列时同实体或同距离均可接受）
    for (let q = 0; q < 20; q++) {
      const pos = { x: rand() * 27 - 13.5, z: rand() * 27 - 13.5 };
      for (const range of [1.5, 4, 12, Infinity]) {
        const byGrid = grid.queryNearest(pos, range);
        const byBrute = brute(pos, range);
        if (byBrute === null) {
          expect(byGrid).toBeNull();
          continue;
        }
        expect(byGrid).not.toBeNull();
        const dGrid = Math.hypot(byGrid!.position.x - pos.x, byGrid!.position.z - pos.z);
        const dBrute = Math.hypot(byBrute.position.x - pos.x, byBrute.position.z - pos.z);
        expect(dGrid).toBeCloseTo(dBrute, 9);
      }
    }
  });

  it('removeById 后查询不再返回已移除实体（与实时数组语义一致）', async () => {
    const { SpatialGrid } = await import('../spatial-grid');
    type Item = { id: string; position: { x: number; z: number } };
    const grid = new SpatialGrid<Item>(4, 34);
    const a: Item = { id: 'a', position: { x: 0, z: 0 } };
    const b: Item = { id: 'b', position: { x: 1, z: 0 } };
    grid.insert(a);
    grid.insert(b);

    expect(grid.queryNearest({ x: 0, z: 0 }, Infinity)!.id).toBe('a');
    grid.removeById('a');
    expect(grid.queryNearest({ x: 0, z: 0 }, Infinity)!.id).toBe('b');
    grid.removeById('a'); // 幂等：移除不存在的 id 不报错
    expect(grid.queryNearest({ x: 0, z: 0 }, Infinity)!.id).toBe('b');
  });
});
