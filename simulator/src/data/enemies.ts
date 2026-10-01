import type { EnemyData } from '../types/index.js';

/**
 * Minimal Enemy Dataset (3 enemies for M1 baseline)
 * Aligned with design doc rev.26 enemy tables
 */

export const ENEMIES: Record<string, EnemyData> = {
  enemy_wolf_pack: {
    enemy_id: 'enemy_wolf_pack',
    enemy_name: '狼群',
    type: 'swarm',
    max_health: 45,
    damage: 8,
    attack_range: 1.5,
    attack_speed: 1.0,
    move_speed: 5,
    armor: 1,
    target_priority: 'squad',
    countered_by: ['unit_pikeman', 'building_arrow_tower'],
  },
  enemy_shield_crusher: {
    enemy_id: 'enemy_shield_crusher',
    enemy_name: '盾卫敌人',
    type: 'tank',
    max_health: 200,
    damage: 18,
    attack_range: 1.5,
    attack_speed: 1.5,
    move_speed: 2,
    armor: 12,
    target_priority: 'wall',
    countered_by: ['unit_pikeman', 'unit_archer'],
  },
  enemy_burrower: {
    enemy_id: 'enemy_burrower',
    enemy_name: '掘地者',
    type: 'assassin',
    max_health: 80,
    damage: 25,
    attack_range: 1.5,
    attack_speed: 1.2,
    move_speed: 3,
    armor: 3,
    target_priority: 'main_keep',
    countered_by: ['unit_shieldbearer', 'building_arrow_tower'],
  },
};

export function getEnemy(enemyId: string): EnemyData {
  const e = ENEMIES[enemyId];
  if (!e) throw new Error(`Unknown enemy: ${enemyId}`);
  return e;
}
