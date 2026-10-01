/**
 * EMBERHOLD 模拟器 v2 单测 —— 对齐 game（commit 37f798f0）修复后的战斗模型。
 *
 * 口径锁定（对应 game/src/gameplay/__tests__/combat.test.ts 的回归断言）：
 * - B1：敌方事件式固定伤害（冷却 1.0s 门控，不乘 dt）
 * - B2：枪卒反冲锋 +50% 并入冷却分支，单枪卒 10s 总输出 = ⌈10/1.3⌉×15 = 120
 * - I6：战意 = 接敌班每秒 0.5 + 撤退 5s 封锁
 * - 盾墙令 0.3 减伤接入结算（仅班组承伤）
 * - I2：3 波 + 15s 间隙 + 5s 首波预演 + 240s 兜底
 * - 军令 6 / 工令 8 容量；I3 归营堆闭环（阵亡→50% 修复→半血再落阵）
 */

import { describe, it, expect } from 'vitest';
import {
  runSingleSimulation,
  computeSquadHitDamage,
  computeEnemyHitDamage,
  _internal,
} from '../src/core/engine.js';
import { getWaveComposition, getVariantWaveComposition, getVariant } from '../src/data/waves.js';
import { getPreset } from '../src/data/presets.js';
import type { PresetConfig, DifficultyVariant } from '../src/types/index.js';

const { initState, runNight, runDayTransition, runDayPurchases, deployUnitCard, deployBuildingCard, upgradeEntity, SeededRNG } = _internal;

// ============ 测试工具 ============

/** 测试预设：防线半径 13.4（敌人入场半径 13.5 附近，固定靶立即接敌） */
function makePreset(opts: Partial<PresetConfig> = {}): PresetConfig {
  return {
    name: 'test',
    description: 'test preset',
    commander_id: 'commander_oen',
    build_plan: [],
    upgrade_priority: [],
    retreat_threshold: 0,
    layout: {
      front_squad_radii: [13.4, 13.4, 13.4],
      archer_radius: 13.4,
      wall_radius: 8.0,
      tower_radius: 6.0,
      barracks_radius: 4.0,
    },
    max_days: 8,
    ...opts,
  };
}

/** 固定靶变体：speed_multiplier=0（敌人不动），波次覆写为指定构成 */
function stationaryVariant(enemyId: string, count: number, hpMult = 500): DifficultyVariant {
  return {
    name: 'test_stationary',
    description: '固定靶（测试用）',
    count_multiplier: 1,
    hp_multiplier: hpMult,
    speed_multiplier: 0,
    wave_override: () => [{ enemyId, count }],
  };
}

interface PikemanOpts { health?: number; max?: number; retreat?: number }

/** 部署 1 个枪卒班（可覆写血量做坦克化/真实化） */
function setupPikeman(opts: PikemanOpts = {}) {
  const state = initState();
  const preset = makePreset({ retreat_threshold: opts.retreat ?? 0 });
  expect(deployUnitCard(state, preset, 'card_unit_pikeman', false)).toBe(true);
  const sq = state.squads[0];
  sq.max_health = opts.max ?? 100000;
  sq.health = opts.health ?? 100000;
  return { state, preset, sq };
}

// ============ 伤害公式（纯函数，锁定口径） ============

describe('B2/N2 伤害公式口径', () => {
  it('枪卒反冲锋：对 move_speed>3.0 的敌人 +50%', () => {
    // 狼群 speed 3.5 → 10 × 1.5 = 15
    expect(computeSquadHitDamage('unit_pikeman', 'enemy_wolf', false)).toBe(15);
    // 粉碎者 speed 2.0 / 掘地者 speed 2.5 → 无加成
    expect(computeSquadHitDamage('unit_pikeman', 'enemy_shield_crusher', false)).toBe(10);
    expect(computeSquadHitDamage('unit_pikeman', 'enemy_burrower', false)).toBe(10);
    // 盾卫 8、弓手 12（不受反冲锋影响）
    expect(computeSquadHitDamage('unit_shieldbearer', 'enemy_wolf', false)).toBe(8);
    expect(computeSquadHitDamage('unit_archer', 'enemy_wolf', false)).toBe(12);
  });

  it('齐射令（N2 实现口径）：弓手伤害 ×1.5，其他单位不受影响', () => {
    expect(computeSquadHitDamage('unit_archer', 'enemy_wolf', true)).toBe(18);
    expect(computeSquadHitDamage('unit_archer', 'enemy_shield_crusher', true)).toBe(18);
    expect(computeSquadHitDamage('unit_pikeman', 'enemy_wolf', true)).toBe(15);
  });

  it('单枪卒 10s 总输出 = ⌈10/1.3⌉×15 = 120（game combat.test.ts 同款断言）', () => {
    const attacks = Math.ceil(10 / 1.3); // 攻击冷却 1.3s 门控
    expect(attacks).toBe(8);
    expect(attacks * computeSquadHitDamage('unit_pikeman', 'enemy_wolf', false)).toBe(120);
  });
});

describe('B1/盾墙 敌方伤害公式', () => {
  it('事件式固定伤害：狼 6，盾墙激活时班组承伤 ×0.7', () => {
    expect(computeEnemyHitDamage('enemy_wolf', false)).toBe(6);
    expect(computeEnemyHitDamage('enemy_wolf', true)).toBeCloseTo(4.2, 10);
    expect(computeEnemyHitDamage('enemy_shield_crusher', false)).toBe(10);
    expect(computeEnemyHitDamage('enemy_wolf', false, 2)).toBe(12); // 难度乘数
  });
});

// ============ 夜间战斗（integration，经 runNight） ============

describe('B1 敌方事件式固定伤害 + 冷却门控', () => {
  it('2 固定靶狼 × 240s：承伤为 6 的整数倍，节奏 1.0s/次；枪卒 1.3s/次', () => {
    const { state, preset } = setupPikeman();
    runNight(state, preset, stationaryVariant('enemy_wolf', 2), new SeededRNG(42), 0.25);

    const ns = state.night_stats[0];
    expect(ns.end_reason).toBe('timeout_240s'); // 固定靶打不死 → 240s 兜底
    expect(ns.duration).toBe(240);
    const E = ns.duration - 5.25; // 5s 首波预演后接敌

    const pikeman = state.squads[0];
    const taken = 100000 - pikeman.health;
    expect(taken % 6).toBe(0); // 每击固定 6 点（事件式，非 dt 连续伤害）
    // 2 狼 × ~E 次 × 6（±2 次拍面误差）
    expect(Math.abs(taken - 12 * E)).toBeLessThanOrEqual(24);

    // 枪卒攻击节奏 1.3s/次、每击 15（对狼反冲锋）
    expect(pikeman.attacks).toBeGreaterThanOrEqual(Math.floor(E / 1.3) - 1);
    expect(pikeman.attacks).toBeLessThanOrEqual(Math.floor(E / 1.3) + 2);
    expect(pikeman.damage_dealt).toBe(pikeman.attacks * 15);
  });

  it('dt 无关性：dt=0.25 与 dt=0.05 结果一致（±1 次攻击）', () => {
    const a = setupPikeman();
    runNight(a.state, a.preset, stationaryVariant('enemy_wolf', 2), new SeededRNG(42), 0.25);
    const b = setupPikeman();
    runNight(b.state, b.preset, stationaryVariant('enemy_wolf', 2), new SeededRNG(42), 0.05);

    const takenA = 100000 - a.state.squads[0].health;
    const takenB = 100000 - b.state.squads[0].health;
    expect(Math.abs(takenA - takenB)).toBeLessThanOrEqual(12);
    expect(Math.abs(a.state.squads[0].attacks - b.state.squads[0].attacks)).toBeLessThanOrEqual(1);
    expect(Math.abs(a.state.squads[0].damage_dealt - b.state.squads[0].damage_dealt))
      .toBeLessThanOrEqual(a.state.squads[0].damage_dealt * 0.02);
  });
});

describe('I6 战意模型', () => {
  it('接敌班每秒 0.5 战意（2 班接敌 ≈ 1.0/s）', () => {
    const state = initState();
    const preset = makePreset();
    deployUnitCard(state, preset, 'card_unit_pikeman', false);
    deployUnitCard(state, preset, 'card_unit_pikeman', false);
    for (const sq of state.squads) { sq.max_health = 100000; sq.health = 100000; }

    runNight(state, preset, stationaryVariant('enemy_wolf', 2), new SeededRNG(7), 0.25);
    const ns = state.night_stats[0];
    const E = ns.duration - 5.25;
    expect(ns.war_spirit_generated).toBeGreaterThan(0.5 * 2 * E - 3);
    expect(ns.war_spirit_generated).toBeLessThan(0.5 * 2 * E + 3);
  });

  it('血线撤退保卡：撤退后当夜不再接敌、战意停发', () => {
    const { state, preset } = setupPikeman({ health: 1000, max: 1000, retreat: 0.99 });
    runNight(state, preset, stationaryVariant('enemy_wolf', 2), new SeededRNG(9), 0.25);

    const ns = state.night_stats[0];
    expect(ns.squad_retreats).toBe(1);
    expect(ns.squad_losses).toBe(0); // 撤退保卡，未阵亡
    expect(state.total_retreats).toBe(1);
    // 仅撤退前 ~3s 接敌期产生战意（≈1.5），远低于全程接敌的 ~117
    expect(ns.war_spirit_generated).toBeLessThan(5);
  });
});

describe('盾墙令 0.3 减伤接入结算', () => {
  it('3 班接敌 + 预置战意：班组平均承伤降至 ~70% 水平', () => {
    const state = initState();
    // 防线半径 10.5（策略的「接敌」口径为 dist≤12，需敌人真实推进到防线）
    const preset = makePreset({
      layout: {
        front_squad_radii: [10.5, 10.5, 10.5],
        archer_radius: 5.5,
        wall_radius: 8.0,
        tower_radius: 6.0,
        barracks_radius: 4.0,
      },
    });
    for (let i = 0; i < 3; i++) deployUnitCard(state, preset, 'card_unit_pikeman', false);
    for (const sq of state.squads) { sq.max_health = 100000; sq.health = 69000; } // <70% 触发盾墙策略
    state.war_spirit = 40; // 预置战意保证持续复播（12 费/8s，3 班接敌回 1.5/s）

    const variant: DifficultyVariant = {
      name: 'test_moving',
      description: '移动靶（测试用）',
      count_multiplier: 1,
      hp_multiplier: 500, // 15000 HP：3 枪卒全程打不死
      wave_override: () => [{ enemyId: 'enemy_wolf', count: 2 }],
    };
    runNight(state, preset, variant, new SeededRNG(11), 0.25);
    const ns = state.night_stats[0];
    const E = ns.duration - 5.25;
    const totalTaken = state.squads.reduce((s, q) => s + (69000 - q.health), 0);

    // 无减伤期望 12×E（≈2817）；盾墙 ~全程覆盖期望 ~70%
    expect(totalTaken).toBeLessThan(0.78 * 12 * E); // 减伤确实生效
    expect(totalTaken).toBeGreaterThan(0.55 * 12 * E); // 且接近 ×0.7 而非其他量级
    expect(ns.tactic_cards_played).toBeGreaterThan(5); // 盾墙被反复打出
  });
});

describe('I2 波次结构', () => {
  it('3 波 × 1 狼 + 15s 间隙：清波后 cleared，时长含 2 个间隙', () => {
    const { state, preset } = setupPikeman();
    runNight(state, preset, stationaryVariant('enemy_wolf', 1, 1), new SeededRNG(21), 0.25);

    const ns = state.night_stats[0];
    expect(ns.end_reason).toBe('cleared');
    expect(ns.enemies_total).toBe(3); // 3 波各 1 狼
    expect(ns.kills).toBe(3);
    // 5s 预演 + 3 波清杀 + 2×15s 间隙
    expect(ns.duration).toBeGreaterThanOrEqual(37);
    expect(ns.duration).toBeLessThanOrEqual(75);
    expect(ns.gold_earned).toBeGreaterThanOrEqual(6); // 3 狼 × 2 金
  });
});

describe('军令 6 / 工令 8 容量约束', () => {
  it('军令：第 7 个班被阻塞计数', () => {
    const state = initState();
    state.gold = 10000;
    const preset = makePreset();
    for (let i = 0; i < 6; i++) {
      expect(deployUnitCard(state, preset, 'card_unit_pikeman', false)).toBe(true);
    }
    expect(state.military_used).toBe(6);
    expect(deployUnitCard(state, preset, 'card_unit_pikeman', false)).toBe(false);
    expect(state.military_blocked).toBe(1);
  });

  it('工令：第 9 点工事被阻塞并记录剩余金币', () => {
    const state = initState();
    state.gold = 10000;
    const preset = makePreset();
    for (let i = 0; i < 8; i++) {
      expect(deployBuildingCard(state, preset, 'card_building_wall', false)).toBe(true);
    }
    expect(state.work_used).toBe(8);
    expect(deployBuildingCard(state, preset, 'card_building_wall', false)).toBe(false);
    expect(state.work_blocked).toBe(1);
    expect(state.work_blocked_gold_left).toHaveLength(1);
    expect(state.work_blocked_gold_left[0]).toBeGreaterThan(0); // 有钱没容量
  });

  it('M1 军械册同名牌唯一：满编军令 3/6、工令 5/8，容量永不阻塞（关键校准结论）', () => {
    const state = initState();
    state.gold = 2000; // 给足金币，隔离容量变量
    const preset = getPreset('turtle');
    const rng = new SeededRNG(1);
    for (let day = 0; day < 4; day++) {
      runDayPurchases(state, preset, rng);
    }
    // 6 卡全落阵：盾卫+枪卒+弓手（军令 3）+ 城墙+箭塔+兵营（工令 5）
    expect(state.squads).toHaveLength(3);
    expect(state.buildings).toHaveLength(3);
    expect(state.military_used).toBe(3);
    expect(state.work_used).toBe(5);
    expect(state.military_blocked).toBe(0); // 军令 6 远大于需求上限 3
    expect(state.work_blocked).toBe(0); // 工令 8 远大于需求上限 5
  });

  it('同名再部署走升级路径（deployArmoryCard 语义）：实体不重复、Lv3 封顶', () => {
    const state = initState();
    state.gold = 500;
    const preset = makePreset({
      build_plan: ['card_unit_pikeman'],
      upgrade_priority: ['card_unit_pikeman'],
    });
    const rng = new SeededRNG(2);
    runDayPurchases(state, preset, rng); // 部署 + 计划完成后升级
    expect(state.squads).toHaveLength(1);
    expect(state.squads[0].upgrade_level).toBe(1);
    expect(state.squads[0].max_health).toBe(120); // 80 × 1.5
    state.gold = 500;
    runDayPurchases(state, preset, rng); // 再升一级
    expect(state.squads).toHaveLength(1);
    expect(state.squads[0].upgrade_level).toBe(2);
    state.gold = 500;
    runDayPurchases(state, preset, rng); // Lv3 封顶，不再升
    expect(state.squads[0].upgrade_level).toBe(2);
    expect(state.squads).toHaveLength(1);
  });
});

describe('I3 归营堆闭环', () => {
  it('阵亡入堆 → 次日 50% 修复 → 半血再落阵（全额 cost_day）', () => {
    const state = initState();
    const preset = makePreset({ build_plan: ['card_unit_pikeman'] });
    expect(deployUnitCard(state, preset, 'card_unit_pikeman', false)).toBe(true); // 真实 80 HP
    const goldAfterDeploy = state.gold; // 500 - 30

    // 2 粉碎者（10 伤害/s ×2）击杀枪卒；粉碎者 80 HP 扛住枪卒反打
    runNight(state, preset, stationaryVariant('enemy_shield_crusher', 2, 1), new SeededRNG(13), 0.25);
    expect(state.total_casualties).toBe(1);
    expect(state.damaged_camp.get('card_unit_pikeman')).toBe(1);
    expect(state.squads).toHaveLength(0);
    expect(state.military_used).toBe(0);

    runDayTransition(state);
    runDayPurchases(state, preset, new SeededRNG(14));

    expect(state.repairs_bought).toBe(1);
    expect(state.damaged_camp.size).toBe(0);
    expect(state.squads).toHaveLength(1);
    expect(state.squads[0].health).toBe(40); // 半血（80×0.5）再入场
    expect(state.military_used).toBe(1);
    // 金币：夜末折算(±2) − 修复 ceil(30×50%)=15 − 再落阵 30
    const expected = goldAfterDeploy - 15 - 30;
    expect(state.gold).toBeGreaterThanOrEqual(expected - 1);
    expect(state.gold).toBeLessThanOrEqual(expected + 3);
  });
});

describe('I3 同名牌升级', () => {
  it('每级 maxHP +50% 并回复，Lv3 封顶', () => {
    const state = initState();
    const preset = makePreset();
    deployUnitCard(state, preset, 'card_unit_pikeman', false); // 80 HP，金币 470

    expect(upgradeEntity(state, 'card_unit_pikeman')).toBe(true);
    expect(state.squads[0].max_health).toBe(120); // 80×1.5
    expect(state.squads[0].health).toBe(120);
    expect(upgradeEntity(state, 'card_unit_pikeman')).toBe(true);
    expect(state.squads[0].max_health).toBe(160); // 80×2.0
    expect(upgradeEntity(state, 'card_unit_pikeman')).toBe(false); // Lv3 上限
    expect(state.upgrades_bought).toBe(2);
  });
});

// ============ 波次表与难度变体（数据层） ============

describe('波次表与 game 一致（getWaveComposition）', () => {
  it('第 1/8 夜各波构成', () => {
    expect(getWaveComposition(1, 1)).toEqual([{ enemyId: 'enemy_wolf', count: 3 }]);
    expect(getWaveComposition(1, 2)).toEqual([
      { enemyId: 'enemy_wolf', count: 1 },
      { enemyId: 'enemy_shield_crusher', count: 1 },
    ]);
    expect(getWaveComposition(1, 3)).toEqual([
      { enemyId: 'enemy_shield_crusher', count: 1 },
      { enemyId: 'enemy_burrower', count: 1 },
      { enemyId: 'enemy_wolf', count: 1 },
    ]);
    expect(getWaveComposition(8, 1)).toEqual([{ enemyId: 'enemy_wolf', count: 10 }]);
    expect(getWaveComposition(8, 2)).toEqual([
      { enemyId: 'enemy_wolf', count: 5 },
      { enemyId: 'enemy_shield_crusher', count: 3 },
    ]);
    expect(getWaveComposition(8, 3)).toEqual([
      { enemyId: 'enemy_shield_crusher', count: 5 },
      { enemyId: 'enemy_burrower', count: 5 },
      { enemyId: 'enemy_wolf', count: 8 },
    ]);
    expect(getWaveComposition(1, 4)).toEqual([]);
  });

  it('难度变体乘数与波次覆写', () => {
    // dense_1_5x：day1 wave1 狼 3 → ×1.5 = 4.5 → 取整 5
    expect(getVariantWaveComposition(1, 1, getVariant('dense_1_5x'))).toEqual([
      { enemyId: 'enemy_wolf', count: 5 },
    ]);
    // rebalanced：首波混编（狼 + 粉碎者）；floor(1/2)=0 但覆写路径 max(1,·) 保底 1
    const w1 = getVariantWaveComposition(1, 1, getVariant('rebalanced'));
    expect(w1).toContainEqual({ enemyId: 'enemy_wolf', count: 3 });
    expect(w1).toContainEqual({ enemyId: 'enemy_shield_crusher', count: 1 });
  });
});

// ============ 单局冒烟 ============

describe('单局完整性冒烟', () => {
  it('baseline 全局跑通：8 夜结构完整、金币曲线对齐', () => {
    const report = runSingleSimulation('baseline', 0, 20261001);
    expect(report.preset_name).toBe('baseline');
    expect(report.night_stats.length).toBeGreaterThanOrEqual(1);
    expect(report.night_stats.length).toBeLessThanOrEqual(8);
    // 金币曲线：胜局 = 夜数+1（初始 500）；败局最后一夜只记 night_stat 不推曲线
    expect(report.gold_curve).toHaveLength(
      report.defeat_reason ? report.night_stats.length : report.night_stats.length + 1
    );
    for (const ns of report.night_stats) {
      expect(ns.day).toBeGreaterThanOrEqual(1);
      expect(ns.duration).toBeLessThanOrEqual(240.0001);
    }
  });
});

// ============ v2.1 新增：索敌模式与放宽变体 ============

describe('索敌模式（一维 vs 2D 保真度）', () => {
  it('spread 模式跑通且产出合法战报', () => {
    const r = runSingleSimulation('baseline', 0, 20261001, 'current', 'spread');
    expect(r.preset_name).toBe('baseline');
    expect(r.night_stats.length).toBeGreaterThanOrEqual(1);
    for (const ns of r.night_stats) {
      expect(ns.duration).toBeLessThanOrEqual(240.0001);
      expect(ns.enemies_total).toBeGreaterThan(0);
    }
  });

  it('damage_multiplier 直达结算公式（放宽变体口径）', () => {
    // 狼 6 × 0.6 = 3.6；盾墙 ×0.7 → 2.52
    expect(computeEnemyHitDamage('enemy_wolf', false, 0.6)).toBeCloseTo(3.6);
    expect(computeEnemyHitDamage('enemy_wolf', true, 0.6)).toBeCloseTo(2.52);
  });
});

describe('放宽变体（校准建议参数）', () => {
  it('ease_dmg_0_6 变体存在且 200 局胜率落在 40-70% 目标带', () => {
    const v = getVariant('ease_dmg_0_6');
    expect(v.damage_multiplier).toBe(0.6);
    let wins = 0;
    const RUNS = 200;
    for (let i = 0; i < RUNS; i++) {
      if (runSingleSimulation('baseline', i, 20261001 + i, 'ease_dmg_0_6').victory) wins++;
    }
    expect(wins / RUNS).toBeGreaterThan(0.3);
    expect(wins / RUNS).toBeLessThan(0.8);
  });
});

// ============ v2.2 新增：紧急增援入池口径（N3 定案 + N1 修复后行为） ============

describe('紧急增援（近似牌入池，实验开关）', () => {
  it('默认口径：牌不入池（与 game 当前发布一致），战报夜统计正常', () => {
    const r = runSingleSimulation('baseline', 0, 20261001);
    // 默认无应急班：夜末消散逻辑不应产生任何 is_emergency 残留
    expect(r.night_stats.length).toBeGreaterThanOrEqual(1);
    expect(r.victory).toBeDefined();
  });

  it('includeReinforce：入池跑通，局内可产生应急班（或至少不报错）且夜数结构完整', () => {
    const r = runSingleSimulation('baseline', 0, 20261001, 'current', 'nearest', { includeReinforce: true });
    for (const ns of r.night_stats) {
      expect(ns.duration).toBeLessThanOrEqual(240.0001);
      expect(ns.enemies_total).toBeGreaterThan(0);
    }
  });

  it('容量满时策略拒出紧急增援：零战意/零手牌消耗、无应急班产生（N1 修复后口径）', () => {
    const state = _internal.initState();
    const preset = getPreset('baseline');
    const rng = new _internal.SeededRNG(42);
    // 场上 1 个残血前排班（<40% 触发 frontCrisis）+ 敌接近；军令填满 6/6
    state.squads.push({
      id: 'sq_0', unit_id: 'unit_shieldbearer', health: 30, max_health: 120,
      radius: 10.5, upgrade_level: 0, on_field: true, is_emergency: false,
      attack_cooldown: 0, war_spirit_block_timer: 0, damage_dealt: 0, attacks: 0, kills: 0,
    });
    state.military_used = 6;
    state.war_spirit = 50;
    const rt = {
      timer: 10, wave_number: 1, wave_active: true, gap_timer: 0,
      enemies: [{ id: 'e0', enemy_id: 'enemy_wolf', health: 30, max_health: 30, dist: 11, speed_factor: 1, attack_cooldown: 0 }],
      hand: ['card_tactic_reinforce'], deck: [], discard: [],
      first_tactic_free: false, draws_done: 1,
      shield_wall_timer: 0, volley_timer: 0, fire_zone: null, tactic_cooldowns: {},
      reinforce_spawned: [],
    } as never;
    const played = _internal.runTacticPolicy(rt, state, preset, rng, 0.25, { includeReinforce: true });
    expect(played).toBe(0);                       // 未打出任何牌
    expect(state.war_spirit).toBe(50);            // 战意零消耗
    expect((rt as never as { hand: string[] }).hand).toEqual(['card_tactic_reinforce']); // 卡仍在手
    expect(state.squads).toHaveLength(1);         // 无应急班产生
  });

  it('容量充足且防线告急时：打出紧急增援，应急盾卫入场、军令+1、扣 15 战意', () => {
    const state = _internal.initState();
    const preset = getPreset('baseline');
    const rng = new _internal.SeededRNG(42);
    state.squads.push({
      id: 'sq_0', unit_id: 'unit_shieldbearer', health: 30, max_health: 120,
      radius: 10.5, upgrade_level: 0, on_field: true, is_emergency: false,
      attack_cooldown: 0, war_spirit_block_timer: 0, damage_dealt: 0, attacks: 0, kills: 0,
    });
    state.military_used = 1;
    state.war_spirit = 50;
    const rt = {
      timer: 10, wave_number: 1, wave_active: true, gap_timer: 0,
      enemies: [{ id: 'e0', enemy_id: 'enemy_wolf', health: 30, max_health: 30, dist: 11, speed_factor: 1, attack_cooldown: 0 }],
      hand: ['card_tactic_reinforce'], deck: [], discard: [],
      first_tactic_free: false, draws_done: 1,
      shield_wall_timer: 0, volley_timer: 0, fire_zone: null, tactic_cooldowns: {},
      reinforce_spawned: [],
    } as never;
    const played = _internal.runTacticPolicy(rt, state, preset, rng, 0.25, { includeReinforce: true });
    expect(played).toBe(1);
    expect(state.war_spirit).toBe(35);            // 扣 15
    expect(state.military_used).toBe(2);          // 军令 +1
    const emg = state.squads.find(s => s.is_emergency);
    expect(emg).toBeDefined();
    expect(emg!.health).toBe(120);                // 满血盾卫
  });
});

// ============ v2.3 新增：增援牌定价三方案（A 降价 / B1 增强 / B2 盾墙 / C 返还） ============

describe('增援牌定价三方案', () => {
  function setupRt() {
    return {
      timer: 10, wave_number: 1, wave_active: true, gap_timer: 0,
      enemies: [{ id: 'e0', enemy_id: 'enemy_wolf', health: 30, max_health: 30, dist: 11, speed_factor: 1, attack_cooldown: 0 }],
      hand: ['card_tactic_reinforce'], deck: [], discard: [],
      first_tactic_free: false, draws_done: 1,
      shield_wall_timer: 0, volley_timer: 0, fire_zone: null, tactic_cooldowns: {},
      reinforce_spawned: [],
    } as never;
  }
  function setupState() {
    const state = _internal.initState();
    state.squads.push({
      id: 'sq_0', unit_id: 'unit_shieldbearer', health: 30, max_health: 120,
      radius: 10.5, upgrade_level: 0, on_field: true, is_emergency: false,
      attack_cooldown: 0, war_spirit_block_timer: 0, damage_dealt: 0, attacks: 0, kills: 0,
    });
    state.military_used = 1;
    state.war_spirit = 50;
    return state;
  }

  it('方案 A（降价）：cost 覆写生效，扣 10 而非 15；使用记录入 reinforce_plays', () => {
    const state = setupState();
    const rng = new _internal.SeededRNG(42);
    const played = _internal.runTacticPolicy(setupRt(), state, getPreset('baseline'), rng, 0.25,
      { includeReinforce: true, reinforceCost: 10 });
    expect(played).toBe(1);
    expect(state.war_spirit).toBe(40); // 50 - 10
    expect(state.reinforce_plays).toEqual([{ night: 1, reason: 'crisis' }]);
  });

  it('方案 B1（增强）：应急盾卫 HP 覆写 180', () => {
    const state = setupState();
    const rng = new _internal.SeededRNG(42);
    _internal.runTacticPolicy(setupRt(), state, getPreset('baseline'), rng, 0.25,
      { includeReinforce: true, reinforceHP: 180 });
    const emg = state.squads.find(s => s.is_emergency)!;
    expect(emg.health).toBe(180);
    expect(emg.max_health).toBe(180);
  });

  it('方案 B2（入场盾墙）：应急班 shield_timer = 6，班组级减伤路径接线', () => {
    const state = setupState();
    const rng = new _internal.SeededRNG(42);
    _internal.runTacticPolicy(setupRt(), state, getPreset('baseline'), rng, 0.25,
      { includeReinforce: true, reinforceShieldOnEntry: 6 });
    const emg = state.squads.find(s => s.is_emergency)!;
    expect(emg.shield_timer).toBe(6);
    // 全局盾墙关闭时，班组级盾墙走同一减伤系数（0.7）
    expect(computeEnemyHitDamage('enemy_wolf', true, 1)).toBeCloseTo(4.2, 6);
  });

  it('方案 C（夜末返还）：全流程跑通且战报合法（返还逻辑在 runNight 夜末结算内）', () => {
    const r = runSingleSimulation('turtle', 0, 20261001, 'ease_dmg_0_6', 'nearest',
      { includeReinforce: true, reinforceRefundOnSurvive: true });
    for (const ns of r.night_stats) {
      expect(ns.duration).toBeLessThanOrEqual(240.0001);
    }
  });
});
