import type { UnitData } from '../types/index.js';

/**
 * Minimal Unit Dataset (3 units for M1 baseline)
 * Aligned with design doc rev.26 unit tables
 */

export const UNITS: Record<string, UnitData> = {
  unit_shieldbearer: {
    unit_id: 'unit_shieldbearer',
    unit_name: '盾卫班',
    role: 'shield',
    squad_size: 5,
    military_cost: 2,
    max_health: 300,
    attack_damage: 12,
    attack_range: 1.5,
    attack_speed: 1.5,
    defense_type: 'heavy',
    move_speed: 2,
    armor: 8,
    war_spirit_on_contact: 0.5,
    synergy_tags: ['shield', 'tank', 'frontline', 'fortification'],
  },
  unit_archer: {
    unit_id: 'unit_archer',
    unit_name: '弓手班',
    role: 'archer',
    squad_size: 4,
    military_cost: 1,
    max_health: 120,
    attack_damage: 18,
    attack_range: 8,
    attack_speed: 1.2,
    defense_type: 'light',
    move_speed: 3,
    armor: 2,
    war_spirit_on_contact: 0.3,
    synergy_tags: ['archer', 'ranged', 'high_ground', 'fire'],
  },
  unit_pikeman: {
    unit_id: 'unit_pikeman',
    unit_name: '枪卒班',
    role: 'pike',
    squad_size: 5,
    military_cost: 1,
    max_health: 180,
    attack_damage: 15,
    attack_range: 2.5,
    attack_speed: 1.3,
    defense_type: 'medium',
    move_speed: 2.5,
    armor: 4,
    war_spirit_on_contact: 0.4,
    synergy_tags: ['pike', 'anti_cavalry', 'frontline', 'fortification'],
  },
};

export function getUnit(unitId: string): UnitData {
  const unit = UNITS[unitId];
  if (!unit) throw new Error(`Unknown unit: ${unitId}`);
  return unit;
}
