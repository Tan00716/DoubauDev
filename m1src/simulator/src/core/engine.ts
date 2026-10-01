/**
 * EMBERHOLD Battle Simulation Engine v2
 *
 * 对齐 game/（commit 37f798f0，M1 修复后）的战斗模型：
 *
 *  1. 敌方伤害为事件式固定伤害（B1）：攻击冷却 1.0s 门控，命中 = data.damage，不乘 dt。
 *     （火圈/灼烧/兵营治疗保留 DPS×dt 语义，与 game 一致。）
 *  2. 枪卒反冲锋加成并入冷却分支同拍结算（B2）：对 move_speed>3.0 敌人 +50%，
 *     单枪卒 10s 总输出 = ⌈10/1.3⌉×15（对狼）。
 *  3. 战意 = 接敌班每秒 0.5（I6），撤退 5 秒封锁；击杀奖励照发（game removeEnemy）。
 *  4. 盾墙令 0.3 减伤激活：仅作用于敌方对班组的伤害（combat.ts updateEnemies）。
 *  5. 显式波次结构（I2）：每夜 3 波 + 15s 间隙 + 5s 首波预演；240s 兜底；
 *     夜末清场（endNight 直接清空残余敌人，无惩罚 —— 与 game 行为一致）。
 *  6. 军令 6 / 工令 8（I7）；初始军械册 6 张全量（B3）。
 *  7. 齐射令按实现口径建模（N2）：弓手伤害 ×1.5 + 射程 ×1.3（非攻速）。
 *  8. 通关判定（I5）：守住第 8 夜 → 胜利；主堡 1000 HP 归零 → 失败。
 *
 * 空间简化声明：一维径向模型。敌人从半径 13.5 向主堡推进；
 * 入场角度差异抽象为 per-enemy 推进速度系数（错峰到达）。
 * 详见 README「Simplified Battle Model」。
 */

import type {
  PresetConfig,
  DifficultyVariant,
  SimSquad,
  SimBuilding,
  SimEnemy,
  SingleRunReport,
  NightStat,
} from '../types/index.js';
import {
  DESIGN_MILITARY_CAPACITY,
  DESIGN_WORK_CAPACITY,
  NIGHT_DURATION,
  TOTAL_WAVES,
  WAVE_GAP_SECONDS,
  NIGHT1_WAVE_GAP_SECONDS,
  WAVE_PREVIEW_LEAD_SECONDS,
  STRAGGLER_START_DAY,
  STRAGGLER_COUNT_PER_GAP,
  STRAGGLER_GAP_FRACTION,
  WAR_SPIRIT_PER_ENGAGED_SQUAD_PER_SEC,
  RETREAT_WAR_SPIRIT_BLOCK_SECONDS,
  VICTORY_DAYS,
  WAR_SPIRIT_MAX,
  MAIN_KEEP_MAX_HEALTH,
  STARTING_GOLD,
  ENEMY_ATTACK_COOLDOWN,
  NIGHT_TACTIC_DRAW_INTERVAL,
  TACTIC_HAND_SIZE,
  NIGHT_TACTIC_DRAW_START,
  GAP_DISCARD_DRAW,
  MAP_SPAWN_RADIUS,
  KEEP_ENGAGE_RADIUS,
  ENEMY_ENGAGE_RADIUS,
  DAY_SQUAD_HEAL_RATIO,
  DAY_BUILDING_HEAL_RATIO,
  WAR_SPIRIT_TO_GOLD_RATE,
  REPAIR_COST_RATIO,
  UPGRADE_HP_PER_LEVEL,
  UPGRADE_MAX_LEVEL,
  DT,
} from '../types/index.js';
import { getUnit } from '../data/units.js';
import { getBuilding } from '../data/buildings.js';
import { getEnemy } from '../data/enemies.js';
import { getCard, INITIAL_TACTIC_DECK } from '../data/cards.js';
import { getVariantWaveComposition, getVariant } from '../data/waves.js';
import { getPreset } from '../data/presets.js';

// ============ Seeded RNG ============

export class SeededRNG {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed >>> 0;
  }
  next(): number {
    this.seed |= 0;
    this.seed = (this.seed + 0x6d2b79f5) | 0;
    let t = Math.imul(this.seed ^ (this.seed >>> 15), 1 | this.seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  intRange(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
  shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

// ============ 运行时状态 ============

interface RunState {
  day: number;
  gold: number;
  war_spirit: number;
  military_used: number;
  work_used: number;
  keep_health: number;
  squads: SimSquad[];
  buildings: SimBuilding[];
  // 归营堆：card_id -> count（阵亡的军械卡，次日 50% 修复后半血再落阵）
  damaged_camp: Map<string, number>;
  // 已修复待落阵（半血入场）—— 对齐 game recalledCards
  recalled: Set<string>;
  // 统计
  military_blocked: number;
  work_blocked: number;
  work_blocked_gold_left: number[];
  upgrades_bought: number;
  repairs_bought: number;
  total_casualties: number;
  total_retreats: number;
  total_kills: number;
  gold_curve: number[];
  night_stats: NightStat[];
  /** 单卡打出计数（诊断：各战术卡使用分布） */
  card_play_counts: Record<string, number>;
  is_game_over: boolean;
  victory: boolean;
  defeat_reason: string | null;
  // 紧急增援使用统计（N3 入池实验）
  reinforce_plays: { night: number; reason: 'crisis' | 'gap' | 'both' }[];
  reinforce_refunds: number;
}

interface NightRuntime {
  timer: number;
  wave_number: number;
  wave_active: boolean;
  gap_timer: number;
  // 批次二·残兵事件状态（对齐 game combat.ts checkWaveProgress）
  gap_total: number;
  straggler_spawned: boolean;
  enemies: SimEnemy[];
  // 战术手牌（card_id 列表）
  hand: string[];
  deck: string[];
  discard: string[];
  first_tactic_free: boolean;
  draws_done: number;
  // 激活效果
  shield_wall_timer: number;
  volley_timer: number;
  fire_zone: { radius: number; remaining: number } | null;
  // 反应延迟（策略不完全即时，制造局间方差）
  tactic_cooldowns: Record<string, number>;
  // 增援打出记录（方案 C 夜末存活返还用）
  reinforce_spawned: { squad_id: string; cost: number }[];
}

const TACTIC_IDS = ['card_tactic_fire_oil', 'card_tactic_shield_wall', 'card_tactic_volley', 'card_tactic_rally'];

// ============ 初始化 ============

function initState(): RunState {
  return {
    day: 1,
    gold: STARTING_GOLD,
    war_spirit: 0,
    military_used: 0,
    work_used: 0,
    keep_health: MAIN_KEEP_MAX_HEALTH,
    squads: [],
    buildings: [],
    damaged_camp: new Map(),
    recalled: new Set(),
    military_blocked: 0,
    work_blocked: 0,
    work_blocked_gold_left: [],
    upgrades_bought: 0,
    repairs_bought: 0,
    total_casualties: 0,
    total_retreats: 0,
    total_kills: 0,
    gold_curve: [STARTING_GOLD],
    card_play_counts: {},
    night_stats: [],
    is_game_over: false,
    victory: false,
    defeat_reason: null,
    reinforce_plays: [],
    reinforce_refunds: 0,
  };
}

// ============ 伤害公式（与 combat.ts 对齐，抽出为纯函数供单测锁定口径） ============

/**
 * 班组单击伤害：
 * - 齐射令：弓手班伤害 ×1.5（N2 实现口径：卡面写攻速+50%，但 combat.ts 实现为伤害×1.5+射程×1.3）；
 * - 枪卒反冲锋（B2）：对 move_speed > 3.0 的敌人 +50%。
 */
export function computeSquadHitDamage(unitId: string, targetEnemyId: string, volleyActive: boolean): number {
  const unit = getUnit(unitId);
  let dmg = unit.attack_damage * (volleyActive && unitId === 'unit_archer' ? 1.5 : 1);
  if (unitId === 'unit_pikeman' && getEnemy(targetEnemyId).move_speed > 3.0) {
    dmg += unit.attack_damage * 0.5;
  }
  return dmg;
}

/**
 * 敌方事件式单击伤害（B1）：固定伤害、冷却 1.0s 门控。
 * 盾墙令激活时班组承伤 ×0.7（仅班组 —— 建筑/主堡不受盾墙减免，对齐 combat.ts）。
 */
export function computeEnemyHitDamage(enemyId: string, shieldWallActive: boolean, damageMultiplier = 1): number {
  return getEnemy(enemyId).damage * (shieldWallActive ? 0.7 : 1) * damageMultiplier;
}

// ============ 白天阶段：采购 / 修复 / 升级 ============

function unitIdOfCard(cardId: string): string {
  return cardId.replace('card_unit_', 'unit_');
}
function buildingIdOfCard(cardId: string): string {
  return cardId.replace('card_building_', 'building_');
}

/** 军械卡 → 径向半径（按预设布局分配） */
function radiusForSquad(state: RunState, preset: PresetConfig, unitId: string): number {
  const unit = getUnit(unitId);
  if (unit.role === 'ranged') return preset.layout.archer_radius;
  // 前排班由外向内分配（越后买的位置越靠内）
  const frontCount = state.squads.filter(s => {
    const u = getUnit(s.unit_id);
    return u.role === 'front' && !s.is_emergency;
  }).length;
  const radii = preset.layout.front_squad_radii;
  return radii[Math.min(frontCount, radii.length - 1)];
}

function deployUnitCard(state: RunState, preset: PresetConfig, cardId: string, halfHealth: boolean): boolean {
  const unitId = unitIdOfCard(cardId);
  const unit = getUnit(unitId);
  const card = getCard(cardId);
  if (state.military_used + unit.military_cost > DESIGN_MILITARY_CAPACITY) {
    state.military_blocked++;
    return false;
  }
  if (state.gold < card.cost_day) return false;
  state.gold -= card.cost_day;
  const radius = radiusForSquad(state, preset, unitId);
  state.squads.push({
    id: `sq_${state.squads.length}`,
    unit_id: unitId,
    health: halfHealth ? Math.floor(unit.max_health * 0.5) : unit.max_health,
    max_health: unit.max_health,
    radius,
    upgrade_level: 0,
    on_field: true,
    is_emergency: false,
    attack_cooldown: 0,
    war_spirit_block_timer: 0,
    damage_dealt: 0,
    attacks: 0,
    kills: 0,
  });
  state.military_used += unit.military_cost;
  return true;
}

function deployBuildingCard(state: RunState, preset: PresetConfig, cardId: string, halfHealth: boolean): boolean {
  const buildingId = buildingIdOfCard(cardId);
  const bd = getBuilding(buildingId);
  const card = getCard(cardId);
  if (state.work_used + bd.work_cost > DESIGN_WORK_CAPACITY) {
    state.work_blocked++;
    state.work_blocked_gold_left.push(state.gold); // 记录"被阻塞时的剩余金币"
    return false;
  }
  if (state.gold < card.cost_day) return false;
  state.gold -= card.cost_day;
  const radius =
    buildingId === 'building_wall' ? preset.layout.wall_radius
    : buildingId === 'building_arrow_tower' ? preset.layout.tower_radius
    : preset.layout.barracks_radius;
  state.buildings.push({
    id: `b_${state.buildings.length}`,
    building_id: buildingId,
    health: halfHealth ? Math.floor(bd.max_durability * 0.5) : bd.max_durability,
    max_health: bd.max_durability,
    radius,
    upgrade_level: 0,
    destroyed: false,
    attack_cooldown: 0,
  });
  state.work_used += bd.work_cost;
  return true;
}

/** 同名牌升级（I3）：仅 +50% maxHP/级 + 回复，M1 无攻击加成（对齐 game applySquadUpgrade）。 */
function upgradeEntity(state: RunState, cardId: string): boolean {
  const card = getCard(cardId);
  if (card.category === 'unit') {
    const unitId = unitIdOfCard(cardId);
    const sq = state.squads.find(s => s.unit_id === unitId && !s.is_emergency);
    if (!sq || sq.upgrade_level >= UPGRADE_MAX_LEVEL) return false;
    if (state.gold < card.cost_day) return false;
    state.gold -= card.cost_day;
    sq.upgrade_level++;
    const base = getUnit(unitId).max_health;
    sq.max_health = Math.floor(base * (1 + UPGRADE_HP_PER_LEVEL * sq.upgrade_level));
    sq.health = Math.min(sq.max_health, sq.health + Math.floor(base * UPGRADE_HP_PER_LEVEL));
    state.upgrades_bought++;
    return true;
  }
  const buildingId = buildingIdOfCard(cardId);
  const b = state.buildings.find(x => x.building_id === buildingId && !x.destroyed);
  if (!b || b.upgrade_level >= UPGRADE_MAX_LEVEL) return false;
  if (state.gold < card.cost_day) return false;
  state.gold -= card.cost_day;
  b.upgrade_level++;
  const base = getBuilding(buildingId).max_durability;
  b.max_health = Math.floor(base * (1 + UPGRADE_HP_PER_LEVEL * b.upgrade_level));
  b.health = Math.min(b.max_health, b.health + Math.floor(base * UPGRADE_HP_PER_LEVEL));
  state.upgrades_bought++;
  return true;
}

/**
 * 白天采购策略（对齐 game 玩家决策的抽象）：
 * 1. 修复归营堆中且在 build_plan 内的卡（50% cost_day），修复后当天重新落阵（半血，全额 cost_day —— N4 双收费口径，按实现建模）；
 * 2. 按 build_plan 顺序采购缺失的卡（容量/金币约束下逐项尝试）；
 * 3. build_plan 全部落阵后按 upgrade_priority 升级（保留 60 金币缓冲）。
 */
function runDayPurchases(state: RunState, preset: PresetConfig, rng: SeededRNG): void {
  // 1. 修复 + 再落阵
  for (const cardId of [...state.damaged_camp.keys()]) {
    if (!preset.build_plan.includes(cardId)) continue;
    const count = state.damaged_camp.get(cardId) ?? 0;
    for (let i = 0; i < count; i++) {
      const cost = Math.ceil(getCard(cardId).cost_day * REPAIR_COST_RATIO);
      if (state.gold < cost) break;
      state.gold -= cost;
      state.damaged_camp.set(cardId, (state.damaged_camp.get(cardId) ?? 1) - 1);
      if ((state.damaged_camp.get(cardId) ?? 0) <= 0) state.damaged_camp.delete(cardId);
      state.recalled.add(cardId);
      state.repairs_bought++;
      // 修复后立即重新落阵（半血、全额 cost_day —— 对齐 game deployArmoryCard/recalledCards）
      const card = getCard(cardId);
      if (card.category === 'unit') {
        deployUnitCard(state, preset, cardId, true);
      } else {
        deployBuildingCard(state, preset, cardId, true);
      }
      state.recalled.delete(cardId);
    }
  }

  // 2. 采购计划（每回合只买"计划内且当前不在场"的卡；一天最多 4 项，模拟玩家注意力）
  let buys = 0;
  for (const cardId of preset.build_plan) {
    if (buys >= 4) break;
    const card = getCard(cardId);
    const onField =
      card.category === 'unit'
        ? state.squads.some(s => s.unit_id === unitIdOfCard(cardId))
        : state.buildings.some(b => b.building_id === buildingIdOfCard(cardId));
    if (onField) continue;
    if (state.damaged_camp.has(cardId)) continue; // 需先修复（走步骤 1）
    let ok = false;
    if (card.category === 'unit') ok = deployUnitCard(state, preset, cardId, false);
    else ok = deployBuildingCard(state, preset, cardId, false);
    if (ok) buys++;
    else if (state.gold < card.cost_day) break; // 没钱则停
    // 容量阻塞：继续尝试计划中更便宜的项（与玩家行为一致）
  }

  // 3. 升级（计划完成后，保留 60 金币缓冲）
  const planComplete = preset.build_plan.every(cardId => {
    const card = getCard(cardId);
    return card.category === 'unit'
      ? state.squads.some(s => s.unit_id === unitIdOfCard(cardId))
      : state.buildings.some(b => b.building_id === buildingIdOfCard(cardId));
  });
  if (!planComplete) return;
  let upgrades = 0;
  for (const cardId of preset.upgrade_priority) {
    if (upgrades >= 2) break;
    if (state.gold < getCard(cardId).cost_day + 60) break;
    if (upgradeEntity(state, cardId)) upgrades++;
  }
  void rng; // 预留：采购顺序抖动（当前确定性策略）
}

// ============ 夜间阶段 ============

function spawnWave(rt: NightRuntime, _state: RunState, day: number, waveNumber: number, variant: DifficultyVariant | null, rng: SeededRNG, hpMult: number): void {
  rt.wave_number = waveNumber;
  rt.wave_active = true;
  const entries = getVariantWaveComposition(day, waveNumber, variant);
  for (const entry of entries) {
    const ed = getEnemy(entry.enemyId);
    for (let i = 0; i < entry.count; i++) {
      rt.enemies.push({
        id: `e_${rt.enemies.length}`,
        enemy_id: entry.enemyId,
        health: Math.round(ed.max_health * hpMult),
        max_health: Math.round(ed.max_health * hpMult),
        dist: MAP_SPAWN_RADIUS * rng.range(0.95, 1.1),
        // 入场角度差异 → 到达防线时间错峰（同弧度同时出发的抽象）
        speed_factor: rng.range(0.55, 1.0),
        attack_cooldown: 0,
      });
    }
  }
}

function drawTactic(rt: NightRuntime, rng: SeededRNG, count: number): void {
  for (let i = 0; i < count; i++) {
    if (rt.hand.length >= TACTIC_HAND_SIZE) break;
    if (rt.deck.length === 0) {
      if (rt.discard.length === 0) break;
      rt.deck = rng.shuffle(rt.discard);
      rt.discard = [];
    }
    rt.hand.push(rt.deck.pop()!);
  }
}

/** 对外导出：增援牌实验选项（runSingleSimulation 参数）。 */
export interface ReinforceExperimentOptions {
  includeReinforce?: boolean;
  reinforceCost?: number;
  reinforceHP?: number;
  reinforceShieldOnEntry?: number;
  reinforceRefundOnSurvive?: boolean;
}

/** 夜间运行选项（实验开关，默认全关 = 与 game 当前发布口径一致）。 */
interface NightOptions extends ReinforceExperimentOptions {
  /** 诊断用：牌入池占手位但策略不打出（隔离牌库稀释效应）。 */
  reinforceInDeckOnly?: boolean;
  /** 诊断用：收紧增援打出条件——仅「前排全残/无前排」真正崩线才打。 */
  reinforceSmart?: boolean;
  /** 诊断用：关闭落单残兵（校准带纯节奏口径锁定）。 */
  stragglerOff?: boolean;
}

/** 战术牌策略（对 game 玩家决策的抽象，含反应延迟制造局间方差）。 */
function runTacticPolicy(
  rt: NightRuntime,
  state: RunState,
  preset: PresetConfig,
  rng: SeededRNG,
  dt: number,
  options?: NightOptions
): number {
  let played = 0;
  for (const id of TACTIC_IDS) {
    rt.tactic_cooldowns[id] = (rt.tactic_cooldowns[id] ?? 0) - dt;
  }
  const fieldSquads = state.squads.filter(s => s.on_field);
  const frontSquads = fieldSquads.filter(s => getUnit(s.unit_id).role === 'front');
  const archer = fieldSquads.find(s => s.unit_id === 'unit_archer');
  const wolvesNear = rt.enemies.filter(e => e.enemy_id === 'enemy_wolf' && e.dist <= 12).length;
  const engagedEnemies = rt.enemies.filter(e => e.dist <= 12).length;
  const hurtSquad = fieldSquads.some(s => s.health / s.max_health < 0.7);

  const tryPlay = (cardId: string, condition: boolean, effect?: () => void, costOverride?: number): void => {
    if (!condition) return;
    if (rt.tactic_cooldowns[cardId] > 0) return;
    const idx = rt.hand.indexOf(cardId);
    if (idx < 0) return;
    const card = getCard(cardId);
    let cost = costOverride ?? card.cost_night;
    if (rt.first_tactic_free) {
      cost = 0;
      rt.first_tactic_free = false;
    }
    if (state.war_spirit < cost) return;
    state.war_spirit -= cost;
    rt.hand.splice(idx, 1);
    rt.discard.push(cardId);
    // game：打出手牌后立即补抽 1（playTacticCard → drawTacticCards(1)）
    drawTactic(rt, rng, 1);
    // 效果
    if (effect) {
      effect();
    } else {
      if (cardId === 'card_tactic_shield_wall') rt.shield_wall_timer = card.duration;
      if (cardId === 'card_tactic_volley') rt.volley_timer = card.duration;
      if (cardId === 'card_tactic_fire_oil') {
        const frontRadius = frontSquads.length > 0 ? Math.max(...frontSquads.map(s => s.radius)) : 8;
        rt.fire_zone = { radius: frontRadius, remaining: card.duration };
      }
    }
    // 反应延迟：打出后该卡 6±2 秒内不再考虑
    rt.tactic_cooldowns[cardId] = rng.range(4, 8);
    state.card_play_counts[cardId] = (state.card_play_counts[cardId] ?? 0) + 1;
    played++;
  };

  // 火油：≥3 敌人接近防线
  tryPlay('card_tactic_fire_oil', engagedEnemies >= 3);
  // 盾墙：有班接敌且有班掉血 >30%
  tryPlay('card_tactic_shield_wall', engagedEnemies >= 2 && hurtSquad);
  // 齐射：弓手在场且 ≥3 狼接近
  tryPlay('card_tactic_volley', !!archer && wolvesNear >= 3);
  // 集结号：M1 无战斗效果，不打（保留在手牌占位，与 game 行为一致）

  // 紧急增援（N3 定案「近似牌入池」口径，实验开关）：
  // 防线告急（前排 <40% 血或防线有缺口）+ 有敌接近时召唤应急盾卫（满血、夜末消散、军令+1）。
  // N1 修复后口径：容量满时出牌被拒（战意/手牌不变）→ 策略层直接预检不打，零消耗。
  if (options?.includeReinforce || options?.reinforceSmart) {
    const frontCrisis = frontSquads.some(s => s.health / s.max_health < 0.4);
    const gapOnLine = state.squads.some(s => !s.on_field && !s.is_emergency);
    // smart 口径：仅「前排全残或已无前排」才视为真正崩线
    const collapse = frontSquads.length === 0 ||
      frontSquads.every(s => s.health / s.max_health < 0.4);
    const trigger = options?.reinforceSmart ? collapse : (frontCrisis || gapOnLine);
    const reason: 'crisis' | 'gap' | 'both' = frontCrisis && gapOnLine ? 'both' : frontCrisis ? 'crisis' : 'gap';
    const cost = options?.reinforceCost ?? getCard('card_tactic_reinforce').cost_night;
    const emgHP = options?.reinforceHP ?? getUnit('unit_shieldbearer').max_health;
    tryPlay(
      'card_tactic_reinforce',
      engagedEnemies >= 1 && trigger &&
        state.military_used + 1 <= DESIGN_MILITARY_CAPACITY,
      () => {
        const squadId = `sq_emg_${state.squads.length}`;
        state.squads.push({
          id: squadId,
          unit_id: 'unit_shieldbearer',
          health: emgHP,
          max_health: emgHP,
          radius: preset.layout.front_squad_radii[0],
          upgrade_level: 0,
          on_field: true,
          is_emergency: true,
          attack_cooldown: 0,
          war_spirit_block_timer: 0,
          shield_timer: options?.reinforceShieldOnEntry ?? 0,
          damage_dealt: 0,
          attacks: 0,
          kills: 0,
        });
        state.military_used += 1;
        rt.reinforce_spawned.push({ squad_id: squadId, cost });
        state.reinforce_plays.push({ night: state.day, reason });
      },
      cost
    );
  }

  return played;
}

function runNight(
  state: RunState,
  preset: PresetConfig,
  variant: DifficultyVariant | null,
  rng: SeededRNG,
  dtOverride?: number,
  targeting: 'nearest' | 'spread' = 'nearest',
  options?: NightOptions
): void {
  const hpMult = variant?.hp_multiplier ?? 1;
  const speedMult = variant?.speed_multiplier ?? 1;
  const rt: NightRuntime = {
    timer: 0,
    wave_number: 0,
    wave_active: false,
    gap_timer: WAVE_PREVIEW_LEAD_SECONDS,
    gap_total: WAVE_PREVIEW_LEAD_SECONDS,
    straggler_spawned: false,
    enemies: [],
    hand: [],
    deck: rng.shuffle(options?.includeReinforce || options?.reinforceInDeckOnly
      ? [...INITIAL_TACTIC_DECK, 'card_tactic_reinforce']
      : [...INITIAL_TACTIC_DECK]),
    discard: [],
    first_tactic_free: true,
    draws_done: 0,
    shield_wall_timer: 0,
    volley_timer: 0,
    fire_zone: null,
    tactic_cooldowns: {},
    reinforce_spawned: [],
  };
  drawTactic(rt, rng, NIGHT_TACTIC_DRAW_START);

  // 当夜统计
  let idleSeconds = 0;
  let emptyFieldSeconds = 0;
  let engagedSeconds = 0;
  let kills = 0;
  let squadLosses = 0;
  let squadRetreats = 0;
  let tacticsPlayed = 0;
  let warSpiritGen = 0;
  let goldEarned = 0;
  let spawnedTotal = 0;

  const dt = dtOverride ?? DT;
  const dmgMult = variant?.damage_multiplier ?? 1;

  const spawnWithCount = (waveNumber: number): void => {
    const before = rt.enemies.length;
    spawnWave(rt, state, state.day, waveNumber, variant, rng, hpMult);
    spawnedTotal += rt.enemies.length - before;
  };

  while (true) {
    rt.timer += dt;

    // ---- 波次状态机（I2） ----
    if (!rt.wave_active) {
      rt.gap_timer -= dt;
      // 批次二·落单残兵：第 2 夜起每个波间过半时确定性刷 2 只狼（基础 HP，不带变体 hpMult——game 无变体机制），
      // 填充空窗后半段；不改波次状态机，未杀残兵并入下一波（本就存于 rt.enemies）。
      if (
        !rt.straggler_spawned &&
        !options?.stragglerOff &&
        state.day >= STRAGGLER_START_DAY &&
        rt.wave_number >= 1 &&
        rt.gap_total > 0 &&
        rt.gap_timer <= rt.gap_total * (1 - STRAGGLER_GAP_FRACTION)
      ) {
        rt.straggler_spawned = true;
        const sd = getEnemy('enemy_wolf');
        for (let i = 0; i < STRAGGLER_COUNT_PER_GAP; i++) {
          rt.enemies.push({
            id: `e_${rt.enemies.length}`,
            enemy_id: 'enemy_wolf',
            health: sd.max_health,
            max_health: sd.max_health,
            dist: MAP_SPAWN_RADIUS * rng.range(0.95, 1.1),
            speed_factor: rng.range(0.55, 1.0),
            attack_cooldown: 0,
          });
          spawnedTotal += 1;
        }
      }
      if (rt.gap_timer <= 0) spawnWithCount(rt.wave_number + 1);
    }
    // 夜间每 8s 补抽 1 张
    const drawsDue = Math.floor(rt.timer / NIGHT_TACTIC_DRAW_INTERVAL);
    if (drawsDue > rt.draws_done) {
      rt.draws_done = drawsDue;
      drawTactic(rt, rng, 1);
    }
    // 波次间隙弃 2 抽 2（在波清空转间隙时触发，见下）

    const enemiesAlive = rt.enemies.length > 0;
    const anyEngaged = state.squads.some(s => {
      if (!s.on_field) return false;
      const u = getUnit(s.unit_id);
      return rt.enemies.some(e => Math.abs(e.dist - s.radius) <= u.attack_range);
    });
    if (!enemiesAlive || !anyEngaged) idleSeconds += dt;
    else engagedSeconds += dt;
    // game 批次二空窗口径：场上敌人为 0 的累计时长（含预演与波间前半段）
    if (rt.enemies.length === 0) emptyFieldSeconds += dt;

    // ---- 敌方回合（B1：事件式固定伤害，冷却 1.0s） ----
    for (let i = rt.enemies.length - 1; i >= 0; i--) {
      const en = rt.enemies[i];
      const ed = getEnemy(en.enemy_id);
      if (en.attack_cooldown > 0) en.attack_cooldown -= dt;

      // 索敌优先级（combat.ts）：班组(1.5) → 建筑(1.5) → 主堡(2.0)
      // targeting='nearest'：一维径向默认——所有敌人先遭遇最外层班组（集火，保守下界）
      // targeting='spread'：对照组——接敌半径内随机选班组（近似 2D 多路径分散承伤）
      let targetSquad: SimSquad | null = null;
      let bestS = Infinity;
      const candidates: SimSquad[] = [];
      for (const s of state.squads) {
        if (!s.on_field) continue;
        const d = Math.abs(en.dist - s.radius);
        if (d <= ENEMY_ENGAGE_RADIUS && d < bestS) {
          bestS = d;
          targetSquad = s;
        }
        if (d <= ENEMY_ENGAGE_RADIUS) candidates.push(s);
      }
      if (targeting === 'spread' && candidates.length > 1) {
        targetSquad = candidates[rng.intRange(0, candidates.length - 1)];
      }
      if (targetSquad) {
        if (en.attack_cooldown <= 0) {
          const shielded = rt.shield_wall_timer > 0 || (targetSquad.shield_timer ?? 0) > 0;
          targetSquad.health -= computeEnemyHitDamage(en.enemy_id, shielded, dmgMult);
          // 冷却补偿：保留本拍提前量，长程攻击节奏精确为 1.0s/次（消除 dt 离散化偏差）
          en.attack_cooldown += ENEMY_ATTACK_COOLDOWN;
        }
        continue; // 已接敌：不再移动
      }

      let targetBuilding: SimBuilding | null = null;
      let bestB = Infinity;
      for (const b of state.buildings) {
        if (b.destroyed) continue;
        const d = Math.abs(en.dist - b.radius);
        if (d <= ENEMY_ENGAGE_RADIUS && d < bestB) {
          bestB = d;
          targetBuilding = b;
        }
      }
      if (targetBuilding) {
        if (en.attack_cooldown <= 0) {
          targetBuilding.health -= ed.damage * dmgMult;
          en.attack_cooldown += ENEMY_ATTACK_COOLDOWN;
          if (targetBuilding.health <= 0) {
            targetBuilding.destroyed = true;
            const bd = getBuilding(targetBuilding.building_id);
            state.work_used -= bd.work_cost;
            // 建筑摧毁 → 对应卡入归营堆（I3）
            const cardId = `card_building_${targetBuilding.building_id.replace('building_', '')}`;
            state.damaged_camp.set(cardId, (state.damaged_camp.get(cardId) ?? 0) + 1);
          }
        }
        continue;
      }

      if (en.dist < KEEP_ENGAGE_RADIUS) {
        if (en.attack_cooldown <= 0) {
          state.keep_health -= ed.damage * dmgMult;
          en.attack_cooldown += ENEMY_ATTACK_COOLDOWN;
        }
      } else {
        en.dist = Math.max(0, en.dist - ed.move_speed * en.speed_factor * speedMult * dt);
      }

      // ---- 我方班组自动攻击（B2/I6/N2 口径） ----
      // （放在敌人循环外统一处理，此处只做敌人侧）
    }

    // ---- 我方班组回合 ----
    for (let i = state.squads.length - 1; i >= 0; i--) {
      const sq = state.squads[i];
      const unit = getUnit(sq.unit_id);
      if (!sq.on_field) continue;

      if (sq.war_spirit_block_timer > 0) {
        sq.war_spirit_block_timer = Math.max(0, sq.war_spirit_block_timer - dt);
      }
      if ((sq.shield_timer ?? 0) > 0) {
        sq.shield_timer = Math.max(0, (sq.shield_timer ?? 0) - dt);
      }
      if (sq.attack_cooldown > 0) sq.attack_cooldown -= dt;

      // 射程（齐射令：弓手射程 ×1.3 —— N2 实现口径）
      const volleyActive = rt.volley_timer > 0 && sq.unit_id === 'unit_archer';
      const range = unit.attack_range * (volleyActive ? 1.3 : 1);

      // 索敌：射程内最近敌人
      let target: SimEnemy | null = null;
      let bestD = Infinity;
      for (const en of rt.enemies) {
        const d = Math.abs(en.dist - sq.radius);
        if (d <= range && d < bestD) {
          bestD = d;
          target = en;
        }
      }

      // I6：接敌班每秒 0.5 战意（接敌 = 射程内有敌；撤退封锁期不计）
      const engaged = !!target && sq.war_spirit_block_timer <= 0;
      if (engaged) {
        const gain = WAR_SPIRIT_PER_ENGAGED_SQUAD_PER_SEC * dt;
        state.war_spirit = Math.min(WAR_SPIRIT_MAX, state.war_spirit + gain);
        warSpiritGen += gain;
      }

      if (target && sq.attack_cooldown <= 0) {
        // 伤害公式见 computeSquadHitDamage：齐射 ×1.5（N2 实现口径）；枪卒反冲锋 +50%（B2）
        const dmg = computeSquadHitDamage(sq.unit_id, target.enemy_id, volleyActive);
        target.health -= dmg;
        sq.damage_dealt += dmg;
        sq.attacks++;
        // 冷却补偿：保留本拍提前量，长程攻击节奏精确为 attack_speed 秒/次（⌈t/attack_speed⌉ 口径）
        sq.attack_cooldown += unit.attack_speed; // game: attackCooldown = attack_speed（秒）
        if (target.health <= 0) {
          const ed = getEnemy(target.enemy_id);
          state.gold += ed.reward_gold;
          goldEarned += ed.reward_gold;
          state.war_spirit = Math.min(WAR_SPIRIT_MAX, state.war_spirit + ed.reward_war_spirit);
          warSpiritGen += ed.reward_war_spirit;
          state.total_kills++;
          kills++;
          sq.kills++;
          rt.enemies.splice(rt.enemies.indexOf(target), 1);
        }
      }

      // 撤退策略（血线以下撤退保卡：离场、5s 战意封锁；应急班不撤——夜末消散机制本身就是其生命周期）
      if (!sq.is_emergency && sq.health / sq.max_health < preset.retreat_threshold) {
        sq.on_field = false;
        sq.war_spirit_block_timer = RETREAT_WAR_SPIRIT_BLOCK_SECONDS;
        squadRetreats++;
        state.total_retreats++;
        continue;
      }
      // 阵亡：常规班入归营堆（I3），应急增援直接消散
      if (sq.health <= 0) {
        if (!sq.is_emergency) {
          const cardId = `card_unit_${sq.unit_id.replace('unit_', '')}`;
          state.damaged_camp.set(cardId, (state.damaged_camp.get(cardId) ?? 0) + 1);
        }
        state.military_used -= unit.military_cost;
        state.squads.splice(i, 1);
        squadLosses++;
        state.total_casualties++;
      }
    }

    // ---- 建筑回合 ----
    for (const b of state.buildings) {
      if (b.destroyed) continue;
      const bd = getBuilding(b.building_id);
      if (b.attack_cooldown > 0) b.attack_cooldown -= dt;
      if (b.building_id === 'building_arrow_tower' && b.attack_cooldown <= 0) {
        let target: SimEnemy | null = null;
        let bestD = Infinity;
        for (const en of rt.enemies) {
          const d = Math.abs(en.dist - b.radius);
          if (d <= bd.attack_range && d < bestD) {
            bestD = d;
            target = en;
          }
        }
        if (target) {
          target.health -= bd.attack_damage; // 事件式固定伤害
          b.attack_cooldown += bd.attack_speed;
          if (target.health <= 0) {
            const ed = getEnemy(target.enemy_id);
            state.gold += ed.reward_gold;
            goldEarned += ed.reward_gold;
            state.war_spirit = Math.min(WAR_SPIRIT_MAX, state.war_spirit + ed.reward_war_spirit);
            warSpiritGen += ed.reward_war_spirit;
            state.total_kills++;
            kills++;
            rt.enemies.splice(rt.enemies.indexOf(target), 1);
          }
        }
      }
      // 兵营治疗（DPS 模型）：半径 4 内的班组每秒 +5
      if (b.building_id === 'building_barracks') {
        for (const sq of state.squads) {
          if (!sq.on_field) continue;
          if (Math.abs(sq.radius - b.radius) <= bd.heal_radius) {
            sq.health = Math.min(sq.max_health, sq.health + bd.heals_per_sec * dt);
          }
        }
      }
    }

    // ---- 火圈（DPS 模型，×dt 正确语义） ----
    if (rt.fire_zone) {
      rt.fire_zone.remaining -= dt;
      for (let i = rt.enemies.length - 1; i >= 0; i--) {
        const en = rt.enemies[i];
        if (Math.abs(en.dist - rt.fire_zone.radius) <= 3) {
          en.health -= 15 * dt;
          if (en.health <= 0) {
            const ed = getEnemy(en.enemy_id);
            state.gold += ed.reward_gold;
            goldEarned += ed.reward_gold;
            state.war_spirit = Math.min(WAR_SPIRIT_MAX, state.war_spirit + ed.reward_war_spirit);
            warSpiritGen += ed.reward_war_spirit;
            state.total_kills++;
            kills++;
            rt.enemies.splice(i, 1);
          }
        }
      }
      if (rt.fire_zone.remaining <= 0) rt.fire_zone = null;
    }

    // ---- 效果计时 ----
    if (rt.shield_wall_timer > 0) rt.shield_wall_timer -= dt;
    if (rt.volley_timer > 0) rt.volley_timer -= dt;

    // ---- 战术策略 ----
    tacticsPlayed += runTacticPolicy(rt, state, preset, rng, dt, options);

    // ---- 主堡沦陷判定 ----
    if (state.keep_health <= 0) {
      state.keep_health = 0;
      state.is_game_over = true;
      state.defeat_reason = 'main_keep_destroyed';
      state.night_stats.push({
        day: state.day,
        duration: rt.timer,
        end_reason: 'main_keep_destroyed',
        idle_seconds: idleSeconds,
        empty_field_seconds: emptyFieldSeconds,
        engaged_seconds: engagedSeconds,
        enemies_total: spawnedTotal,
        kills,
        squad_losses: squadLosses,
        squad_retreats: squadRetreats,
        tactic_cards_played: tacticsPlayed,
        war_spirit_generated: warSpiritGen,
        gold_earned: goldEarned,
      });
      return;
    }

    // ---- 波次推进 ----
    if (rt.wave_active && rt.enemies.length === 0) {
      if (rt.wave_number >= TOTAL_WAVES) {
        // 第 3 波清空 → 夜结束（cleared）
        break;
      }
      rt.wave_active = false;
      // 批次二：波间 10s；第 1 夜教学节奏 6s（对齐 game）
      const gapSeconds = state.day === 1 ? NIGHT1_WAVE_GAP_SECONDS : WAVE_GAP_SECONDS;
      rt.gap_timer = gapSeconds;
      rt.gap_total = gapSeconds;
      rt.straggler_spawned = false;
      // 波次间隙弃 2 抽 2
      const discardCount = Math.min(GAP_DISCARD_DRAW, rt.hand.length);
      for (let i = 0; i < discardCount; i++) {
        const idx = rng.intRange(0, rt.hand.length - 1);
        rt.discard.push(rt.hand.splice(idx, 1)[0]);
      }
      drawTactic(rt, rng, GAP_DISCARD_DRAW);
    }

    // ---- 240s 夜时长兜底（endNight 清场，无惩罚 —— 与 game 一致） ----
    if (rt.timer >= NIGHT_DURATION) break;
  }

  // ---- 夜末结算（endNight） ----
  const endReason: 'cleared' | 'timeout_240s' = rt.wave_active && rt.enemies.length > 0 ? 'timeout_240s' : 'cleared';
  // 方案 C：应急班存活到夜末 → 按次返还 50% 战意（先于折金结算，返还部分同样参与折金）
  if (options?.reinforceRefundOnSurvive) {
    for (const rec of rt.reinforce_spawned) {
      const sq = state.squads.find(s => s.id === rec.squad_id);
      if (sq && sq.on_field) {
        state.war_spirit = Math.min(WAR_SPIRIT_MAX, state.war_spirit + Math.floor(rec.cost * 0.5));
        state.reinforce_refunds++;
      }
    }
  }
  // 战意全额 50% 折算金币
  if (state.war_spirit > 0) {
    const bonus = Math.floor(state.war_spirit * WAR_SPIRIT_TO_GOLD_RATE);
    state.gold += bonus;
    goldEarned += bonus;
    state.war_spirit = 0;
  }
  // 撤退班次日回归（保留当前血量，昼间再自愈 20%）；应急增援夜末消散（释放军令，对齐 game removeSquad）
  for (const sq of state.squads) {
    if (!sq.on_field && !sq.is_emergency) sq.on_field = true;
  }
  for (const sq of state.squads) {
    if (sq.is_emergency) state.military_used -= getUnit(sq.unit_id).military_cost;
  }
  state.squads = state.squads.filter(s => !s.is_emergency);

  state.night_stats.push({
    day: state.day,
    duration: rt.timer,
    end_reason: endReason,
    idle_seconds: idleSeconds,
    empty_field_seconds: emptyFieldSeconds,
    engaged_seconds: engagedSeconds,
    enemies_total: spawnedTotal,
    kills,
    squad_losses: squadLosses,
    squad_retreats: squadRetreats,
    tactic_cards_played: tacticsPlayed,
    war_spirit_generated: warSpiritGen,
    gold_earned: goldEarned,
  });
  state.gold_curve.push(state.gold);
}

// ============ 昼间过渡（startNextDay） ============

function runDayTransition(state: RunState): void {
  for (const b of state.buildings) {
    if (!b.destroyed) b.health = Math.min(b.max_health, b.health + b.max_health * DAY_BUILDING_HEAL_RATIO);
  }
  for (const sq of state.squads) {
    sq.health = Math.min(sq.max_health, sq.health + sq.max_health * DAY_SQUAD_HEAL_RATIO);
  }
  state.day++;
}

// ============ 单局模拟 ============

export function runSingleSimulation(
  presetName: string,
  runId: number,
  seed: number,
  variantName: string = 'current',
  targeting: 'nearest' | 'spread' = 'nearest',
  options?: NightOptions
): SingleRunReport {
  const preset = getPreset(presetName);
  const variant = variantName === 'current' ? null : getVariant(variantName);
  const rng = new SeededRNG(seed);
  const state = initState();

  // Day 1：白天采购
  runDayPurchases(state, preset, rng);

  while (!state.is_game_over && state.day <= VICTORY_DAYS) {
    runNight(state, preset, variant, rng, undefined, targeting, options);
    if (state.is_game_over) break;

    if (state.day >= VICTORY_DAYS) {
      state.victory = true;
      state.is_game_over = true;
      break;
    }

    runDayTransition(state);
    runDayPurchases(state, preset, rng);
  }

  if (!state.is_game_over) {
    state.victory = true;
    state.is_game_over = true;
  }

  return {
    run_id: runId,
    preset_name: presetName,
    variant_name: variantName,
    victory: state.victory,
    days_survived: state.defeat_reason ? state.day : VICTORY_DAYS,
    defeat_reason: state.defeat_reason,
    final_gold: state.gold,
    final_main_keep_health: state.keep_health,
    total_casualties: state.total_casualties,
    total_retreats: state.total_retreats,
    total_enemy_kills: state.total_kills,
    gold_curve: state.gold_curve,
    night_stats: state.night_stats,
    military_blocked: state.military_blocked,
    work_blocked: state.work_blocked,
    work_blocked_gold_left: state.work_blocked_gold_left,
    upgrades_bought: state.upgrades_bought,
    repairs_bought: state.repairs_bought,
    reinforce_plays: state.reinforce_plays.length > 0 ? state.reinforce_plays : undefined,
    reinforce_refunds: state.reinforce_refunds > 0 ? state.reinforce_refunds : undefined,
    tactic_play_counts: state.card_play_counts,
  };
}

// 导出内部函数供单测使用
export const _internal = {
  initState,
  runDayPurchases,
  runNight,
  runDayTransition,
  deployUnitCard,
  deployBuildingCard,
  upgradeEntity,
  radiusForSquad,
  runTacticPolicy,
  SeededRNG,
};
