import { z } from 'zod';

export const CardDataSchema = z.object({
  card_id: z.string(),
  card_name: z.string(),
  layer: z.enum(['armory', 'tactic']),
  category: z.enum(['unit', 'building', 'tactic', 'formation', 'edict']),
  cost_day: z.number().int().min(0),
  cost_night: z.number().int().min(0),
  effect_description: z.string(),
  target_type: z.enum(['self', 'squad', 'building', 'terrain', 'enemy', 'global']),
  duration: z.number().int().min(0),
  rarity: z.enum(['common', 'rare', 'epic', 'legendary']),
  synergy_tags: z.array(z.string()),
  counterplay_tags: z.array(z.string()),
  upgrade_level: z.number().int().min(0).max(2).optional(),
});

export type CardData = z.infer<typeof CardDataSchema>;

export const UnitDataSchema = z.object({
  unit_id: z.string(),
  unit_name: z.string(),
  squad_size: z.number().int().min(1).max(8),
  military_cost: z.number().int().min(1).max(3),
  max_health: z.number().positive(),
  attack_damage: z.number().nonnegative(),
  attack_range: z.number().nonnegative(),
  attack_speed: z.number().positive(),
  defense_type: z.enum(['heavy', 'medium', 'light', 'none']),
  move_speed: z.number().positive(),
  color: z.string(),
});

export type UnitData = z.infer<typeof UnitDataSchema>;

export const BuildingDataSchema = z.object({
  building_id: z.string(),
  building_name: z.string(),
  category: z.enum(['defense', 'offense', 'support']),
  work_cost: z.number().int().min(1),
  gold_cost: z.number().int().min(0),
  max_durability: z.number().positive(),
  attack_damage: z.number().nonnegative(),
  attack_range: z.number().nonnegative(),
  attack_speed: z.number().nonnegative(),
  color: z.string(),
  size: z.number().positive().default(1),
});

export type BuildingData = z.infer<typeof BuildingDataSchema>;

export const EnemyDataSchema = z.object({
  enemy_id: z.string(),
  enemy_name: z.string(),
  max_health: z.number().positive(),
  damage: z.number().nonnegative(),
  attack_range: z.number().nonnegative(),
  move_speed: z.number().positive(),
  color: z.string(),
  size: z.number().positive().default(0.5),
  reward_gold: z.number().int().min(0).default(2),
  reward_war_spirit: z.number().int().min(0).default(2),
});

export type EnemyData = z.infer<typeof EnemyDataSchema>;

export const CommanderDataSchema = z.object({
  commander_id: z.string(),
  commander_name: z.string(),
  passive_rule: z.string(),
  ultimate_name: z.string(),
  ultimate_description: z.string(),
  color: z.string(),
});

export type CommanderData = z.infer<typeof CommanderDataSchema>;

// ====== M1 Data Set ======

export const UNITS: UnitData[] = [
  {
    unit_id: 'unit_shieldbearer',
    unit_name: '盾卫班',
    squad_size: 4,
    military_cost: 1,
    max_health: 120,
    attack_damage: 8,
    attack_range: 1.2,
    attack_speed: 1.5,
    defense_type: 'heavy',
    move_speed: 2.0,
    color: '#4a90d9',
  },
  {
    unit_id: 'unit_archer',
    unit_name: '弓手班',
    squad_size: 4,
    military_cost: 1,
    max_health: 60,
    attack_damage: 12,
    attack_range: 6.0,
    attack_speed: 1.2,
    defense_type: 'light',
    move_speed: 2.5,
    color: '#2ecc71',
  },
  {
    unit_id: 'unit_pikeman',
    unit_name: '枪卒班',
    squad_size: 4,
    military_cost: 1,
    max_health: 80,
    attack_damage: 10,
    attack_range: 1.8,
    attack_speed: 1.3,
    defense_type: 'medium',
    move_speed: 2.2,
    color: '#e67e22',
  },
];

export const BUILDINGS: BuildingData[] = [
  {
    building_id: 'building_wall',
    building_name: '城墙',
    category: 'defense',
    work_cost: 1,
    gold_cost: 25,
    max_durability: 300,
    attack_damage: 0,
    attack_range: 0,
    attack_speed: 0,
    color: '#7f8c8d',
    size: 1.0,
  },
  {
    building_id: 'building_arrow_tower',
    building_name: '箭塔',
    category: 'offense',
    work_cost: 2,
    gold_cost: 60,
    max_durability: 150,
    attack_damage: 15,
    attack_range: 7.0,
    attack_speed: 1.0,
    color: '#c0392b',
    size: 1.2,
  },
  {
    building_id: 'building_barracks',
    building_name: '兵营',
    category: 'support',
    work_cost: 2,
    gold_cost: 80,
    max_durability: 200,
    attack_damage: 0,
    attack_range: 0,
    attack_speed: 0,
    color: '#f39c12',
    size: 1.5,
  },
];

export const ENEMIES: EnemyData[] = [
  {
    enemy_id: 'enemy_wolf',
    enemy_name: '狼群',
    max_health: 30,
    damage: 6,
    attack_range: 1.0,
    move_speed: 3.5,
    color: '#8e44ad',
    size: 0.4,
    reward_gold: 2,
    reward_war_spirit: 1,
  },
  {
    enemy_id: 'enemy_shield_crusher',
    enemy_name: '盾卫',
    max_health: 80,
    damage: 10,
    attack_range: 1.2,
    move_speed: 2.0,
    color: '#2c3e50',
    size: 0.6,
    reward_gold: 3,
    reward_war_spirit: 2,
  },
  {
    enemy_id: 'enemy_burrower',
    enemy_name: '掘地者',
    max_health: 50,
    damage: 8,
    attack_range: 1.0,
    move_speed: 2.5,
    color: '#27ae60',
    size: 0.5,
    reward_gold: 3,
    reward_war_spirit: 2,
  },
];

export const COMMANDER: CommanderData = {
  commander_id: 'commander_oen',
  commander_name: '流浪战诗人·奥恩',
  passive_rule: '每夜第一张战术牌免费',
  ultimate_name: '终章',
  ultimate_description: '抽3张战术牌且本夜手牌上限+2',
  color: '#e74c3c',
};

export const ARMORY_CARDS: CardData[] = [
  {
    card_id: 'card_unit_shieldbearer',
    card_name: '盾卫班',
    layer: 'armory',
    category: 'unit',
    cost_day: 40,
    cost_night: 60,
    effect_description: '部署一支盾卫班',
    target_type: 'terrain',
    duration: 0,
    rarity: 'common',
    synergy_tags: ['shield', 'tank'],
    counterplay_tags: ['siege'],
  },
  {
    card_id: 'card_unit_archer',
    card_name: '弓手班',
    layer: 'armory',
    category: 'unit',
    cost_day: 35,
    cost_night: 53,
    effect_description: '部署一支弓手班',
    target_type: 'terrain',
    duration: 0,
    rarity: 'common',
    synergy_tags: ['archer', 'ranged'],
    counterplay_tags: ['assassin'],
  },
  {
    card_id: 'card_unit_pikeman',
    card_name: '枪卒班',
    layer: 'armory',
    category: 'unit',
    cost_day: 30,
    cost_night: 45,
    effect_description: '部署一支枪卒班',
    target_type: 'terrain',
    duration: 0,
    rarity: 'common',
    synergy_tags: ['pike', 'anti-charge'],
    counterplay_tags: ['siege'],
  },
  {
    card_id: 'card_building_wall',
    card_name: '城墙',
    layer: 'armory',
    category: 'building',
    cost_day: 25,
    cost_night: 38,
    effect_description: '建造一段城墙',
    target_type: 'terrain',
    duration: 0,
    rarity: 'common',
    synergy_tags: ['defense', 'fortification'],
    counterplay_tags: ['siege'],
  },
  {
    card_id: 'card_building_arrow_tower',
    card_name: '箭塔',
    layer: 'armory',
    category: 'building',
    cost_day: 60,
    cost_night: 90,
    effect_description: '建造一座箭塔',
    target_type: 'terrain',
    duration: 0,
    rarity: 'common',
    synergy_tags: ['tower', 'ranged'],
    counterplay_tags: ['anti-tower'],
  },
  {
    card_id: 'card_building_barracks',
    card_name: '兵营',
    layer: 'armory',
    category: 'building',
    cost_day: 80,
    cost_night: 120,
    effect_description: '建造一座兵营',
    target_type: 'terrain',
    duration: 0,
    rarity: 'common',
    synergy_tags: ['support', 'heal'],
    counterplay_tags: ['siege'],
  },
];

export const TACTIC_CARDS: CardData[] = [
  {
    card_id: 'card_tactic_fire_oil',
    card_name: '火油桶',
    layer: 'tactic',
    category: 'tactic',
    cost_day: 0,
    cost_night: 10,
    effect_description: '点燃一片区域，区域内敌人每秒受到15伤害，持续5秒',
    target_type: 'terrain',
    duration: 5,
    rarity: 'common',
    synergy_tags: ['fire', 'aoe'],
    counterplay_tags: ['plague_doctor'],
  },
  {
    card_id: 'card_tactic_shield_wall',
    card_name: '盾墙令',
    layer: 'tactic',
    category: 'formation',
    cost_day: 0,
    cost_night: 12,
    effect_description: '全军承伤-30%，持续8秒',
    target_type: 'global',
    duration: 8,
    rarity: 'common',
    synergy_tags: ['defense', 'formation'],
    counterplay_tags: ['siege'],
  },
  {
    card_id: 'card_tactic_volley',
    card_name: '齐射令',
    layer: 'tactic',
    category: 'tactic',
    cost_day: 0,
    cost_night: 8,
    effect_description: '所有弓手班攻速+50%，持续6秒',
    target_type: 'global',
    duration: 6,
    rarity: 'common',
    synergy_tags: ['archer', 'buff'],
    counterplay_tags: ['shield'],
  },
  {
    card_id: 'card_tactic_reinforce',
    card_name: '紧急增援',
    layer: 'tactic',
    category: 'tactic',
    cost_day: 0,
    cost_night: 15,
    effect_description: '立即在指定位置召唤一支盾卫班（夜末消散）',
    target_type: 'terrain',
    duration: 0,
    rarity: 'rare',
    synergy_tags: ['summon', 'emergency'],
    counterplay_tags: [],
  },
  {
    card_id: 'card_tactic_rally',
    card_name: '集结号',
    layer: 'tactic',
    category: 'tactic',
    cost_day: 0,
    cost_night: 6,
    effect_description: '所有班移速+50%，持续5秒',
    target_type: 'global',
    duration: 5,
    rarity: 'common',
    synergy_tags: ['mobility', 'buff'],
    counterplay_tags: [],
  },
];

export function getUnitData(unitId: string): UnitData | undefined {
  return UNITS.find(u => u.unit_id === unitId);
}

export function getBuildingData(buildingId: string): BuildingData | undefined {
  return BUILDINGS.find(b => b.building_id === buildingId);
}

export function getEnemyData(enemyId: string): EnemyData | undefined {
  return ENEMIES.find(e => e.enemy_id === enemyId);
}

export function getCardData(cardId: string): CardData | undefined {
  return [...ARMORY_CARDS, ...TACTIC_CARDS].find(c => c.card_id === cardId);
}
