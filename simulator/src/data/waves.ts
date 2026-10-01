import type { DifficultyVariant } from '../types/index.js';

/**
 * 显式波次表 —— 与 game/src/gameplay/game-state.ts getWaveComposition 完全一致（commit 37f798f0）。
 * 构成确定、无随机刷怪。难度收紧变体（DifficultyVariant）在此基础上做乘数/覆写。
 */

export interface WaveEntry { enemyId: string; count: number; }

export function getWaveComposition(day: number, wave: number): WaveEntry[] {
  const d = Math.max(1, day);
  if (wave <= 1) {
    return [{ enemyId: 'enemy_wolf', count: 2 + d }];
  }
  if (wave === 2) {
    return [
      { enemyId: 'enemy_wolf', count: 1 + Math.floor(d / 2) },
      { enemyId: 'enemy_shield_crusher', count: 1 + Math.floor(d / 3) },
    ];
  }
  if (wave === 3) {
    return [
      { enemyId: 'enemy_shield_crusher', count: 1 + Math.floor(d / 2) },
      { enemyId: 'enemy_burrower', count: 1 + Math.floor(d / 2) },
      { enemyId: 'enemy_wolf', count: d },
    ];
  }
  return [];
}

/** 应用难度变体后的波次构成（数量取整、至少 1）。 */
export function getVariantWaveComposition(
  day: number,
  wave: number,
  variant: DifficultyVariant | null
): WaveEntry[] {
  if (variant?.wave_override) {
    return variant.wave_override(day, wave).map(e => ({
      enemyId: e.enemyId,
      count: Math.max(1, Math.round(e.count * (variant.count_multiplier ?? 1))),
    }));
  }
  const base = getWaveComposition(day, wave);
  if (!variant || variant.count_multiplier === 1) return base;
  return base.map(e => ({
    enemyId: e.enemyId,
    count: Math.max(1, Math.round(e.count * variant.count_multiplier)),
  }));
}

/**
 * 难度收紧候选变体（供产品经理决策）。
 * 设计目标：把 baseline 胜率从 ~100% 收紧到 40–70% 区间（roguelite 单局主流难度带）。
 */
export const DIFFICULTY_VARIANTS: Record<string, DifficultyVariant> = {
  current: {
    name: 'current',
    description: '当前 M1 数值（commit 37f798f0 波次表原样）',
    count_multiplier: 1,
  },
  dense_1_5x: {
    name: 'dense_1_5x',
    description: '敌群密度 ×1.5（各波数量 ×1.5，构成不变）',
    count_multiplier: 1.5,
  },
  dense_2x: {
    name: 'dense_2x',
    description: '敌群密度 ×2（各波数量 ×2，构成不变）',
    count_multiplier: 2,
  },
  rebalanced: {
    name: 'rebalanced',
    description: '波次构成重排：首波即混编（狼+粉碎者），第2/3波粉碎者与掘地者提前上量，总量约 ×1.6',
    count_multiplier: 1,
    wave_override: (day, wave) => {
      const d = Math.max(1, day);
      if (wave <= 1) {
        return [
          { enemyId: 'enemy_wolf', count: 2 + d },
          { enemyId: 'enemy_shield_crusher', count: Math.floor(d / 2) },
        ];
      }
      if (wave === 2) {
        return [
          { enemyId: 'enemy_wolf', count: 1 + Math.floor(d / 2) },
          { enemyId: 'enemy_shield_crusher', count: 1 + Math.floor(d / 2) },
          { enemyId: 'enemy_burrower', count: Math.floor(d / 3) },
        ];
      }
      return [
        { enemyId: 'enemy_shield_crusher', count: 2 + Math.floor(d / 2) },
        { enemyId: 'enemy_burrower', count: 2 + Math.floor(d / 2) },
        { enemyId: 'enemy_wolf', count: 2 * d },
      ];
    },
  },
  dense_2_5x: {
    name: 'dense_2_5x',
    description: '敌群密度 ×2.5（激进收紧上界探针）',
    count_multiplier: 2.5,
  },
  // ---- 放宽型变体（M1 修复后数值过难的方向探针，供产品经理决策） ----
  ease_dmg_0_7: {
    name: 'ease_dmg_0_7',
    description: '敌方伤害 ×0.7（game 侧对应调低 ENEMIES.damage）',
    count_multiplier: 1,
    damage_multiplier: 0.7,
  },
  ease_dmg_0_5: {
    name: 'ease_dmg_0_5',
    description: '敌方伤害 ×0.5（game 侧对应调低 ENEMIES.damage）',
    count_multiplier: 1,
    damage_multiplier: 0.5,
  },
  ease_dmg_0_6: {
    name: 'ease_dmg_0_6',
    description: '敌方伤害 ×0.6',
    count_multiplier: 1,
    damage_multiplier: 0.6,
  },
  ease_count_0_75: {
    name: 'ease_count_0_75',
    description: '敌群数量 ×0.75（game 侧对应调低 getWaveComposition 数量系数）',
    count_multiplier: 0.75,
  },
  ease_count_0_6: {
    name: 'ease_count_0_6',
    description: '敌群数量 ×0.6',
    count_multiplier: 0.6,
  },
  ease_d07_c075: {
    name: 'ease_d07_c075',
    description: '组合放宽：伤害 ×0.7 + 数量 ×0.75',
    damage_multiplier: 0.7,
    count_multiplier: 0.75,
  },
};

export function getVariant(name: string): DifficultyVariant {
  const v = DIFFICULTY_VARIANTS[name];
  if (!v) throw new Error(`Unknown variant: ${name}. Available: ${Object.keys(DIFFICULTY_VARIANTS).join(', ')}`);
  return v;
}
