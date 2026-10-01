import type { BuildingData } from '../types/index.js';

/**
 * Minimal Building Dataset (3 buildings for M1 baseline)
 * Aligned with design doc rev.26 building tables
 */

export const BUILDINGS: Record<string, BuildingData> = {
  building_wall: {
    building_id: 'building_wall',
    building_name: '城墙',
    category: 'defense',
    work_cost: 1,
    gold_cost: 25,
    max_durability: 400,
    armor: 10,
    synergy_tags: ['defense', 'fortification', 'shield'],
  },
  building_arrow_tower: {
    building_id: 'building_arrow_tower',
    building_name: '箭塔',
    category: 'offense',
    work_cost: 2,
    gold_cost: 60,
    max_durability: 200,
    armor: 5,
    attack_damage: 14,
    attack_range: 10,
    attack_speed: 1.0,
    synergy_tags: ['archer', 'ranged', 'offense'],
  },
  building_barracks: {
    building_id: 'building_barracks',
    building_name: '兵营',
    category: 'support',
    work_cost: 2,
    gold_cost: 80,
    max_durability: 250,
    armor: 6,
    synergy_tags: ['heal', 'support', 'squad'],
  },
};

export function getBuilding(buildingId: string): BuildingData {
  const b = BUILDINGS[buildingId];
  if (!b) throw new Error(`Unknown building: ${buildingId}`);
  return b;
}
