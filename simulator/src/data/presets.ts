import type { PresetConfig } from '../types/index.js';

/**
 * Preset Build Configurations for Simulation
 * Two distinct builds for comparison
 */

export const PRESETS: Record<string, PresetConfig> = {
  baseline: {
    name: 'baseline',
    description: '均衡 Build：2盾卫 + 2弓手 + 2枪卒，城墙×3 + 箭塔×1 + 兵营×1',
    commander_id: 'commander_oen',
    initial_gold: 500,
    initial_squads: [
      { unit_id: 'unit_shieldbearer' },
      { unit_id: 'unit_shieldbearer' },
      { unit_id: 'unit_archer' },
      { unit_id: 'unit_archer' },
      { unit_id: 'unit_pikeman' },
      { unit_id: 'unit_pikeman' },
    ],
    initial_buildings: [
      { building_id: 'building_wall' },
      { building_id: 'building_wall' },
      { building_id: 'building_wall' },
      { building_id: 'building_arrow_tower' },
      { building_id: 'building_barracks' },
    ],
    waves: [
      // Day 1: Tutorial - small wolf pack (1 route)
      [
        { enemies: [{ enemy_id: 'enemy_wolf_pack', count: 4 }], spawn_delay_seconds: 0 },
      ],
      // Day 2: Mixed small force (2 routes)
      [
        { enemies: [{ enemy_id: 'enemy_wolf_pack', count: 5 }, { enemy_id: 'enemy_shield_crusher', count: 1 }], spawn_delay_seconds: 0 },
      ],
      // Day 3: Shield push (2 routes)
      [
        { enemies: [{ enemy_id: 'enemy_shield_crusher', count: 2 }, { enemy_id: 'enemy_wolf_pack', count: 4 }], spawn_delay_seconds: 0 },
      ],
      // Day 4: Burrowers appear (2 routes)
      [
        { enemies: [{ enemy_id: 'enemy_burrower', count: 2 }, { enemy_id: 'enemy_shield_crusher', count: 2 }, { enemy_id: 'enemy_wolf_pack', count: 5 }], spawn_delay_seconds: 0 },
      ],
      // Day 5: Heavy mixed (3 routes)
      [
        { enemies: [{ enemy_id: 'enemy_shield_crusher', count: 3 }, { enemy_id: 'enemy_burrower', count: 2 }, { enemy_id: 'enemy_wolf_pack', count: 6 }], spawn_delay_seconds: 0 },
      ],
      // Day 6: Elite night - 2 waves
      [
        { enemies: [{ enemy_id: 'enemy_shield_crusher', count: 3 }, { enemy_id: 'enemy_burrower', count: 3 }], spawn_delay_seconds: 0 },
        { enemies: [{ enemy_id: 'enemy_wolf_pack', count: 10 }], spawn_delay_seconds: 20 },
      ],
      // Day 7: Siege pressure - 2 waves
      [
        { enemies: [{ enemy_id: 'enemy_shield_crusher', count: 4 }, { enemy_id: 'enemy_burrower', count: 3 }], spawn_delay_seconds: 0 },
        { enemies: [{ enemy_id: 'enemy_wolf_pack', count: 10 }, { enemy_id: 'enemy_shield_crusher', count: 2 }], spawn_delay_seconds: 20 },
      ],
      // Day 8: Final siege - 3 waves
      [
        { enemies: [{ enemy_id: 'enemy_shield_crusher', count: 5 }, { enemy_id: 'enemy_burrower', count: 4 }], spawn_delay_seconds: 0 },
        { enemies: [{ enemy_id: 'enemy_wolf_pack', count: 14 }, { enemy_id: 'enemy_shield_crusher', count: 4 }], spawn_delay_seconds: 15 },
        { enemies: [{ enemy_id: 'enemy_burrower', count: 5 }, { enemy_id: 'enemy_shield_crusher', count: 5 }], spawn_delay_seconds: 20 },
      ],
    ],
    max_days: 8,
    difficulty: 0,
  },

  turtle: {
    name: 'turtle',
    description: '龟城 Build：1盾卫 + 1枪卒，城墙×3 + 箭塔×2 + 兵营×1（薇拉指挥官）',
    commander_id: 'commander_veira',
    initial_gold: 500,
    initial_squads: [
      { unit_id: 'unit_shieldbearer' },
      { unit_id: 'unit_pikeman' },
    ],
    initial_buildings: [
      { building_id: 'building_wall' },
      { building_id: 'building_wall' },
      { building_id: 'building_wall' },
      { building_id: 'building_arrow_tower' },
      { building_id: 'building_arrow_tower' },
      { building_id: 'building_barracks' },
    ],
    // Same waves as baseline for fair comparison
    waves: [
      [{ enemies: [{ enemy_id: 'enemy_wolf_pack', count: 4 }], spawn_delay_seconds: 0 }],
      [{ enemies: [{ enemy_id: 'enemy_wolf_pack', count: 5 }, { enemy_id: 'enemy_shield_crusher', count: 1 }], spawn_delay_seconds: 0 }],
      [{ enemies: [{ enemy_id: 'enemy_shield_crusher', count: 2 }, { enemy_id: 'enemy_wolf_pack', count: 4 }], spawn_delay_seconds: 0 }],
      [{ enemies: [{ enemy_id: 'enemy_burrower', count: 2 }, { enemy_id: 'enemy_shield_crusher', count: 2 }, { enemy_id: 'enemy_wolf_pack', count: 5 }], spawn_delay_seconds: 0 }],
      [{ enemies: [{ enemy_id: 'enemy_shield_crusher', count: 3 }, { enemy_id: 'enemy_burrower', count: 2 }, { enemy_id: 'enemy_wolf_pack', count: 6 }], spawn_delay_seconds: 0 }],
      [
        { enemies: [{ enemy_id: 'enemy_shield_crusher', count: 3 }, { enemy_id: 'enemy_burrower', count: 2 }], spawn_delay_seconds: 0 },
        { enemies: [{ enemy_id: 'enemy_wolf_pack', count: 8 }], spawn_delay_seconds: 20 },
      ],
      [
        { enemies: [{ enemy_id: 'enemy_shield_crusher', count: 2 }, { enemy_id: 'enemy_burrower', count: 1 }], spawn_delay_seconds: 0 },
        { enemies: [{ enemy_id: 'enemy_wolf_pack', count: 4 }, { enemy_id: 'enemy_burrower', count: 1 }], spawn_delay_seconds: 20 },
      ],
      [
        { enemies: [{ enemy_id: 'enemy_shield_crusher', count: 2 }, { enemy_id: 'enemy_burrower', count: 2 }], spawn_delay_seconds: 0 },
        { enemies: [{ enemy_id: 'enemy_wolf_pack', count: 5 }, { enemy_id: 'enemy_shield_crusher', count: 1 }], spawn_delay_seconds: 20 },
      ],
    ],
    max_days: 8,
    difficulty: 0,
  },

  aggressive: {
    name: 'aggressive',
    description: '激进 Build：3盾卫 + 2枪卒 + 1弓手，城墙×1 + 箭塔×1 + 兵营×1（高军团配比）',
    commander_id: 'commander_oen',
    initial_gold: 500,
    initial_squads: [
      { unit_id: 'unit_shieldbearer' },
      { unit_id: 'unit_shieldbearer' },
      { unit_id: 'unit_shieldbearer' },
      { unit_id: 'unit_pikeman' },
      { unit_id: 'unit_pikeman' },
      { unit_id: 'unit_archer' },
    ],
    initial_buildings: [
      { building_id: 'building_wall' },
      { building_id: 'building_arrow_tower' },
      { building_id: 'building_barracks' },
    ],
    waves: [
      [{ enemies: [{ enemy_id: 'enemy_wolf_pack', count: 4 }], spawn_delay_seconds: 0 }],
      [{ enemies: [{ enemy_id: 'enemy_wolf_pack', count: 5 }, { enemy_id: 'enemy_shield_crusher', count: 1 }], spawn_delay_seconds: 0 }],
      [{ enemies: [{ enemy_id: 'enemy_shield_crusher', count: 2 }, { enemy_id: 'enemy_wolf_pack', count: 4 }], spawn_delay_seconds: 0 }],
      [{ enemies: [{ enemy_id: 'enemy_burrower', count: 2 }, { enemy_id: 'enemy_shield_crusher', count: 2 }, { enemy_id: 'enemy_wolf_pack', count: 5 }], spawn_delay_seconds: 0 }],
      [{ enemies: [{ enemy_id: 'enemy_shield_crusher', count: 3 }, { enemy_id: 'enemy_burrower', count: 2 }, { enemy_id: 'enemy_wolf_pack', count: 6 }], spawn_delay_seconds: 0 }],
      [
        { enemies: [{ enemy_id: 'enemy_shield_crusher', count: 3 }, { enemy_id: 'enemy_burrower', count: 2 }], spawn_delay_seconds: 0 },
        { enemies: [{ enemy_id: 'enemy_wolf_pack', count: 8 }], spawn_delay_seconds: 20 },
      ],
      [
        { enemies: [{ enemy_id: 'enemy_shield_crusher', count: 2 }, { enemy_id: 'enemy_burrower', count: 1 }], spawn_delay_seconds: 0 },
        { enemies: [{ enemy_id: 'enemy_wolf_pack', count: 4 }, { enemy_id: 'enemy_burrower', count: 1 }], spawn_delay_seconds: 20 },
      ],
      [
        { enemies: [{ enemy_id: 'enemy_shield_crusher', count: 2 }, { enemy_id: 'enemy_burrower', count: 2 }], spawn_delay_seconds: 0 },
        { enemies: [{ enemy_id: 'enemy_wolf_pack', count: 5 }, { enemy_id: 'enemy_shield_crusher', count: 1 }], spawn_delay_seconds: 20 },
      ],
    ],
    max_days: 8,
    difficulty: 0,
  },
};

export function getPreset(name: string): PresetConfig {
  const p = PRESETS[name];
  if (!p) throw new Error(`Unknown preset: ${name}. Available: ${Object.keys(PRESETS).join(', ')}`);
  return p;
}
