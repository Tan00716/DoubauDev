import type { EnemyData } from '../types/index.js';

/**
 * 敌人数据 —— 与 game/src/content/data.ts ENEMIES 逐字段一致（commit 37f798f0）。
 * B1 修复后：damage 为事件式固定伤害（攻击冷却 1.0s 门控，不再乘 dt）。
 * 狼群 move_speed=3.5 > 3.0，触发枪卒反冲锋 +50% 加成（B2）。
 */

export const ENEMIES: Record<string, EnemyData> = {
  enemy_wolf: {
    enemy_id: 'enemy_wolf',
    enemy_name: '狼群',
    max_health: 30,
    damage: 6,
    attack_range: 1.0,
    move_speed: 3.5,
    reward_gold: 2,
    reward_war_spirit: 1,
  },
  enemy_shield_crusher: {
    enemy_id: 'enemy_shield_crusher',
    enemy_name: '盾卫粉碎者',
    max_health: 80,
    damage: 10,
    attack_range: 1.2,
    move_speed: 2.0,
    reward_gold: 3,
    reward_war_spirit: 2,
  },
  enemy_burrower: {
    enemy_id: 'enemy_burrower',
    enemy_name: '掘地者',
    max_health: 50,
    damage: 8,
    attack_range: 1.0,
    move_speed: 2.5,
    reward_gold: 3,
    reward_war_spirit: 2,
  },
};

export function getEnemy(enemyId: string): EnemyData {
  const e = ENEMIES[enemyId];
  if (!e) throw new Error(`Unknown enemy: ${enemyId}`);
  return e;
}
