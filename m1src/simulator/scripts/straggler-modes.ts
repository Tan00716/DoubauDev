/**
 * 残兵奖励口径五档实验（对齐 game stragglerMode，供产品终裁）。
 * game 侧 30 局真实打法已跑（43-60% 带内）；本实验给模拟器侧（近最优采购）同口径五档数据，
 * 让产品看到玩家强度谱两端的完整对照。
 * 档位：default(2只全额) / no_reward(2只零奖励) / single(1只全额) / half_reward(2只减半) / off(不刷)
 */
import { runSingleSimulation } from '../src/core/engine';

const RUNS = 1000, SEED = 20261001;
const MODES = ['default', 'no_reward', 'single', 'half_reward', 'off'] as const;
const presets = ['baseline', 'turtle', 'aggressive'] as const;

console.log('模式(×1000局)     baseline  turtle    aggressive');
for (const mode of MODES) {
  const line: string[] = [];
  for (const preset of presets) {
    let wins = 0;
    for (let i = 0; i < RUNS; i++) {
      const r = runSingleSimulation(preset, i, SEED + i, 'ease_dmg_0_6', 'nearest', { stragglerMode: mode });
      if (r.victory) wins++;
    }
    line.push(`${(wins / RUNS * 100).toFixed(1)}%`);
  }
  console.log(`${mode.padEnd(14)}   ${line.join('    ').padEnd(6)}`);
}
