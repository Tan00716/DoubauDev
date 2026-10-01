import type { PresetConfig } from '../types/index.js';

/**
 * 预设（Build + 策略）v2.1 —— 对齐 game deployArmoryCard 语义（commit 37f798f0）：
 *
 * 【关键口径】军械册每种卡唯一一张：
 *  - 卡不在场 → 部署新实体（花 cost_day）；
 *  - 实体已在场 → 同名再部署 = 升级（+50% maxHP/级，Lv3 封顶，仍花 cost_day）；
 *  - 阵亡/被摧毁 → 卡入归营堆，次日 50% 修复后半血再落阵（升级清零）。
 * 因此 M1 内不可能出现「2 个盾卫班 / 2 面墙」——
 *  - 军令占用上限 = 盾卫1 + 弓手1 + 枪卒1 = 3 / 容量 6（永不阻塞）；
 *  - 工令占用上限 = 城墙1 + 箭塔2 + 兵营2 = 5 / 容量 8（永不阻塞）。
 * 三套 preset 的差异只来自：采购顺序（首夜阵容不同）、撤退血线、升级优先级。
 *
 * 采购抽象：每天最多 4 项采购/升级（玩家注意力上限），day 1 从 500 金币起步。
 *
 * 径向防线布局（layout）：对 game 2D 布阵的一维抽象。
 * 敌人从半径 13.5 处入场，向主堡推进；前排班先接敌，
 * 撤退/阵亡后敌人继续推进到城墙半径，逐层剥防线（与 combat.ts
 * 「班组(1.5) → 建筑(1.5) → 主堡(2.0)」的索敌优先级一致）。
 */

export const PRESETS: Record<string, PresetConfig> = {
  baseline: {
    name: 'baseline',
    description: '均衡：先成军（盾+枪+弓）再筑防（墙→塔→营），撤退血线 0.2',
    commander_id: 'commander_oen',
    build_plan: [
      'card_unit_shieldbearer',
      'card_unit_pikeman',
      'card_unit_archer',
      'card_building_wall',
      'card_building_arrow_tower',
      'card_building_barracks',
    ],
    upgrade_priority: [
      'card_unit_shieldbearer',
      'card_unit_pikeman',
      'card_unit_archer',
      'card_building_arrow_tower',
      'card_building_wall',
      'card_building_barracks',
    ],
    retreat_threshold: 0.2,
    layout: {
      front_squad_radii: [10.5, 9.5, 8.5, 7.5, 6.5, 6.0],
      archer_radius: 5.5,
      wall_radius: 8.0,
      tower_radius: 6.0,
      barracks_radius: 4.0,
    },
    max_days: 8,
  },

  turtle: {
    name: 'turtle',
    description: '龟城：先筑防（墙→塔）再成军，惜兵早撤（0.35），优先升塔墙',
    commander_id: 'commander_oen',
    build_plan: [
      'card_building_wall',
      'card_building_arrow_tower',
      'card_unit_shieldbearer',
      'card_unit_pikeman',
      'card_building_barracks',
      'card_unit_archer',
    ],
    upgrade_priority: [
      'card_building_arrow_tower',
      'card_building_wall',
      'card_unit_shieldbearer',
      'card_unit_pikeman',
      'card_unit_archer',
    ],
    retreat_threshold: 0.35, // 龟城更惜兵：更早撤退保卡
    layout: {
      front_squad_radii: [10.5, 9.5],
      archer_radius: 5.5,
      wall_radius: 8.0,
      tower_radius: 6.0,
      barracks_radius: 4.0,
    },
    max_days: 8,
  },

  aggressive: {
    name: 'aggressive',
    description: '激进：全军先落（盾+枪+弓+营），工事最晚，硬顶输出（撤退血线 0.1）',
    commander_id: 'commander_oen',
    build_plan: [
      'card_unit_shieldbearer',
      'card_unit_pikeman',
      'card_unit_archer',
      'card_building_barracks',
      'card_building_arrow_tower',
      'card_building_wall',
    ],
    upgrade_priority: [
      'card_unit_shieldbearer',
      'card_unit_pikeman',
      'card_unit_archer',
      'card_building_arrow_tower',
    ],
    retreat_threshold: 0.1, // 激进Build更晚撤退、硬顶输出
    layout: {
      front_squad_radii: [10.5, 9.5, 8.5, 7.5, 6.5, 6.0],
      archer_radius: 5.5,
      wall_radius: 8.0,
      tower_radius: 6.0,
      barracks_radius: 4.0,
    },
    max_days: 8,
  },
};

export function getPreset(name: string): PresetConfig {
  const p = PRESETS[name];
  if (!p) throw new Error(`Unknown preset: ${name}. Available: ${Object.keys(PRESETS).join(', ')}`);
  return p;
}
