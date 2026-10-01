/**
 * EMBERHOLD Simulator v2 - 类型定义
 * 数值与常量全部对齐 game/（commit 37f798f0）：
 *  - src/content/data.ts（单位/建筑/敌人/卡牌）
 *  - src/gameplay/game-state.ts（容量、夜时长、波次表、战意、通关判定）
 *  - src/gameplay/combat.ts（事件式固定伤害、冷却门控、盾墙/齐射/枪卒加成）
 */

// ============ 常量（与 game-state.ts 逐一对应） ============

export const DESIGN_MILITARY_CAPACITY = 6; // 军令容量
export const DESIGN_WORK_CAPACITY = 8; // 工令容量
export const NIGHT_DURATION = 240; // 夜时长（秒，兜底）
export const TOTAL_WAVES = 3; // 每夜波数
export const WAVE_GAP_SECONDS = 15; // 波次间隙
export const WAVE_PREVIEW_LEAD_SECONDS = 5; // 首波威胁预演
export const WAR_SPIRIT_PER_ENGAGED_SQUAD_PER_SEC = 0.5; // 接敌班每秒战意
export const RETREAT_WAR_SPIRIT_BLOCK_SECONDS = 5; // 撤退战意封锁
export const VICTORY_DAYS = 8; // 通关昼夜数
export const WAR_SPIRIT_MAX = 40;
export const MAIN_KEEP_MAX_HEALTH = 1000;
export const STARTING_GOLD = 500;
export const ENEMY_ATTACK_COOLDOWN = 1.0; // 敌方攻击冷却（事件式固定伤害）
export const NIGHT_TACTIC_DRAW_INTERVAL = 8; // 夜间每 8 秒补抽 1 张
export const TACTIC_HAND_SIZE = 5;
export const NIGHT_TACTIC_DRAW_START = 3;
export const GAP_DISCARD_DRAW = 2; // 波次间隙弃 2 抽 2
export const MAP_SPAWN_RADIUS = 13.5; // MAP_SIZE(30) * 0.45
export const KEEP_ENGAGE_RADIUS = 2.0; // 敌人距主堡 2.0 内开始攻击
export const ENEMY_ENGAGE_RADIUS = 1.5; // 敌人对班组/建筑的索敌半径
export const DAY_SQUAD_HEAL_RATIO = 0.2; // 昼间班组自愈 20%
export const DAY_BUILDING_HEAL_RATIO = 0.3; // 昼间建筑自愈 30%
export const WAR_SPIRIT_TO_GOLD_RATE = 0.5; // 夜末战意全额 50% 折算金币
export const REPAIR_COST_RATIO = 0.5; // 受损归营堆修复 = cost_day × 50%
export const UPGRADE_HP_PER_LEVEL = 0.5; // 同名牌升级：每级 maxHP +50%（仅血量，M1 无攻击加成）
export const UPGRADE_MAX_LEVEL = 2; // Lv3 上限（0/1/2）

export const DT = 0.25; // 模拟步长（秒）

// ============ 内容数据类型（对齐 game/src/content/data.ts） ============

export interface UnitData {
  unit_id: string;
  unit_name: string;
  squad_size: number;
  military_cost: number;
  max_health: number;
  attack_damage: number;
  attack_range: number;
  attack_speed: number; // 注意：game 中 attack_speed 是冷却秒数（combat.ts: sq.attackCooldown = data.attack_speed）
  defense_type: 'heavy' | 'medium' | 'light' | 'none';
  move_speed: number;
  role: 'front' | 'ranged';
}

export interface BuildingData {
  building_id: string;
  building_name: string;
  work_cost: number;
  gold_cost: number;
  max_durability: number;
  attack_damage: number;
  attack_range: number;
  attack_speed: number; // 冷却秒数
  heals_per_sec: number; // 兵营：每秒治疗
  heal_radius: number;
}

export interface EnemyData {
  enemy_id: string;
  enemy_name: string;
  max_health: number;
  damage: number; // 事件式固定伤害（B1：不乘 dt）
  attack_range: number;
  move_speed: number;
  reward_gold: number;
  reward_war_spirit: number;
}

export interface CardData {
  card_id: string;
  card_name: string;
  layer: 'armory' | 'tactic';
  category: 'unit' | 'building' | 'tactic' | 'formation';
  cost_day: number; // 白天金币
  cost_night: number; // 夜间战意
  duration: number; // 战术牌持续秒数
}

// ============ 难度收紧变体 ============

export interface DifficultyVariant {
  name: string;
  description: string;
  /** 各敌人数量乘数（作用于波次表 count） */
  count_multiplier: number;
  /** 敌人血量乘数 */
  hp_multiplier?: number;
  /** 敌人伤害乘数 */
  damage_multiplier?: number;
  /** 敌人移速乘数（测试与难度调参用；0 = 固定靶） */
  speed_multiplier?: number;
  /** 波次构成覆写（可选，直接替换 getWaveComposition 结果） */
  wave_override?: (day: number, wave: number) => { enemyId: string; count: number }[];
}

// ============ 预设（Build + 策略） ============

export interface PurchaseStep {
  card_id: string; // 军械册卡（同 game card_id）
}

export interface PresetConfig {
  name: string;
  description: string;
  commander_id: 'commander_oen'; // M1 仅奥恩一名指挥官（被动：每夜第一张战术牌免费）
  /** 白天采购顺序（day 1 起按金币与容量允许逐项执行） */
  build_plan: string[];
  /** 全部落阵后的升级优先级（同名牌升级，Lv 上限 3） */
  upgrade_priority: string[];
  /** 班组自动撤退血线（占 maxHP 比例） */
  retreat_threshold: number;
  /** 防线半径布局（对 game 2D 布阵的径向抽象） */
  layout: {
    front_squad_radii: number[]; // 前排班（盾卫/枪卒）由外向内
    archer_radius: number;
    wall_radius: number;
    tower_radius: number;
    barracks_radius: number;
  };
  max_days: number;
}

// ============ 运行时实体 ============

export interface SimSquad {
  id: string;
  unit_id: string;
  health: number;
  max_health: number;
  radius: number;
  upgrade_level: number; // 0/1/2
  on_field: boolean; // false = 已撤退（当夜离场，次日回归）
  is_emergency: boolean; // 紧急增援（夜末消散）
  attack_cooldown: number;
  war_spirit_block_timer: number;
  /** 班组级减伤计时器（B2 方案：应急班入场自带 6s 盾墙，0.3 减伤仅作用自身） */
  shield_timer?: number;
  damage_dealt: number;
  attacks: number;
  kills: number;
}

export interface SimBuilding {
  id: string;
  building_id: string;
  health: number;
  max_health: number;
  radius: number;
  upgrade_level: number;
  destroyed: boolean;
  attack_cooldown: number;
}

export interface SimEnemy {
  id: string;
  enemy_id: string;
  health: number;
  max_health: number;
  dist: number; // 距主堡的径向距离
  speed_factor: number; // 入场角度差异的抽象（到达时间错峰）
  attack_cooldown: number;
}

// ============ 报告类型 ============

export interface NightStat {
  day: number;
  duration: number; // 实际夜时长
  end_reason: 'cleared' | 'timeout_240s' | 'main_keep_destroyed';
  idle_seconds: number; // 无敌人存活/接敌的空窗秒数（含预演+间隙）
  engaged_seconds: number; // 至少一个班接敌的秒数
  enemies_total: number;
  kills: number;
  squad_losses: number; // 阵亡（进归营堆）
  squad_retreats: number; // 撤退保卡
  tactic_cards_played: number;
  war_spirit_generated: number;
  gold_earned: number;
}

export interface SingleRunReport {
  run_id: number;
  preset_name: string;
  variant_name: string;
  victory: boolean;
  days_survived: number;
  defeat_reason: string | null; // 如 'main_keep_destroyed'
  final_gold: number;
  final_main_keep_health: number;
  total_casualties: number;
  total_retreats: number;
  total_enemy_kills: number;
  gold_curve: number[]; // 每夜结束后的金币
  night_stats: NightStat[];
  // 容量压力分析（军令 6 / 工令 8）
  military_blocked: number; // 因军令容量被阻塞的购买/部署次数
  work_blocked: number; // 因工令容量被阻塞的购买/部署次数
  work_blocked_gold_left: number[]; // 被阻塞时的剩余金币（判断是否"有钱没容量"）
  upgrades_bought: number;
  repairs_bought: number;
  /** 紧急增援打出记录（N3 入池实验；undefined = 未入池口径） */
  reinforce_plays?: { night: number; reason: 'crisis' | 'gap' | 'both' }[];
  /** 方案 C：应急班存活到夜末并触发返还的次数 */
  reinforce_refunds?: number;
  /** 各战术卡整局打出次数（诊断用） */
  tactic_play_counts?: Record<string, number>;
}

export interface BatchReport {
  batch_id: string;
  preset_name: string;
  variant_name: string;
  total_runs: number;
  victory_rate: number;
  avg_days_survived: number;
  median_days_survived: number;
  survival_rate_by_day: Record<number, number>; // 到达该夜者中守住该夜的比例
  defeat_reason_distribution: Record<string, number>;
  defeat_day_distribution: Record<number, number>;
  avg_final_gold: number;
  avg_final_keep_health: number;
  avg_gold_curve: number[];
  avg_casualties: number;
  avg_retreats: number;
  avg_night_duration: number[]; // 各夜平均时长
  avg_night_idle_ratio: number[]; // 各夜平均空窗占比
  night_timeout_count: number[]; // 各夜 240s 兜底结算次数
  avg_military_blocked: number;
  avg_work_blocked: number;
  work_blocked_with_gold_rate: number; // 被工令阻塞且金币足够的比例（天数口径）
  avg_upgrades: number;
  avg_repairs: number;
  balance_flags: BalanceFlag[];
  runs: SingleRunReport[];
}

export interface BalanceFlag {
  type: 'warning' | 'error' | 'info';
  message: string;
  metric: string;
  value: number;
  threshold: number;
}

export interface ComparisonReport {
  presets: string[];
  batch_reports: BatchReport[];
  cross_flags: BalanceFlag[];
}
