import type { BuildingData } from '../types/index.js';

/**
 * 建筑数据 —— 与 game/src/content/data.ts BUILDINGS 逐字段一致（commit 37f798f0）。
 * 兵营治疗：combat.ts 中 5 HP/s、半径 4.0（DPS 模型，非事件式）。
 */

export const BUILDINGS: Record<string, BuildingData> = {
  building_wall: {
    building_id: 'building_wall',
    building_name: '城墙',
    work_cost: 1,
    gold_cost: 25,
    max_durability: 300,
    attack_damage: 0,
    attack_range: 0,
    attack_speed: 0,
    heals_per_sec: 0,
    heal_radius: 0,
  },
  building_arrow_tower: {
    building_id: 'building_arrow_tower',
    building_name: '箭塔',
    work_cost: 2,
    gold_cost: 60,
    max_durability: 150,
    attack_damage: 15,
    attack_range: 7.0,
    attack_speed: 1.0, // 冷却 1.0s（事件式固定伤害）
    heals_per_sec: 0,
    heal_radius: 0,
  },
  building_barracks: {
    building_id: 'building_barracks',
    building_name: '兵营',
    work_cost: 2,
    gold_cost: 80,
    max_durability: 200,
    attack_damage: 0,
    attack_range: 0,
    attack_speed: 0,
    heals_per_sec: 5,
    heal_radius: 4.0,
  },
};

export function getBuilding(buildingId: string): BuildingData {
  const b = BUILDINGS[buildingId];
  if (!b) throw new Error(`Unknown building: ${buildingId}`);
  return b;
}
