import type { UnitData } from '../types/index.js';

/**
 * 单位数据 —— 与 game/src/content/data.ts UNITS 逐字段一致（commit 37f798f0）。
 * 注意：attack_speed 在 game 中是冷却秒数（combat.ts: sq.attackCooldown = data.attack_speed），
 * 与旧版模拟器「每秒攻击次数」语义相反，本版已对齐 game 语义。
 */

export const UNITS: Record<string, UnitData> = {
  unit_shieldbearer: {
    unit_id: 'unit_shieldbearer',
    unit_name: '盾卫班',
    squad_size: 4,
    military_cost: 1,
    max_health: 120,
    attack_damage: 8,
    attack_range: 1.2,
    attack_speed: 1.5, // 冷却 1.5s
    defense_type: 'heavy',
    move_speed: 2.0,
    role: 'front',
  },
  unit_archer: {
    unit_id: 'unit_archer',
    unit_name: '弓手班',
    squad_size: 4,
    military_cost: 1,
    max_health: 60,
    attack_damage: 12,
    attack_range: 6.0,
    attack_speed: 1.2, // 冷却 1.2s
    defense_type: 'light',
    move_speed: 2.5,
    role: 'ranged',
  },
  unit_pikeman: {
    unit_id: 'unit_pikeman',
    unit_name: '枪卒班',
    squad_size: 4,
    military_cost: 1,
    max_health: 80,
    attack_damage: 10,
    attack_range: 1.8,
    attack_speed: 1.3, // 冷却 1.3s
    defense_type: 'medium',
    move_speed: 2.2,
    role: 'front',
  },
};

export function getUnit(unitId: string): UnitData {
  const u = UNITS[unitId];
  if (!u) throw new Error(`Unknown unit: ${unitId}`);
  return u;
}
