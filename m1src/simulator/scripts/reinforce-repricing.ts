/**
 * 增援牌定价预复验（跨残兵口径）。
 * 产品终裁残兵口径前，先在两个关键口径（default=game 现状 / no_reward=收紧候选）下
 * 跑定价关键档（6/7/8/10 意），终裁后定价决策可立即出，无需等复验。
 */
import { runSingleSimulation } from '../src/core/engine';

const RUNS = 500, SEED = 20261001;
const MODES = ['default', 'no_reward'] as const;
const COSTS = [6, 7, 8, 10];
const presets = ['baseline', 'turtle', 'aggressive'] as const;

for (const mode of MODES) {
  console.log(`\n===== stragglerMode=${mode}（每格 ${RUNS} 局）=====`);
  console.log('cost    baseline  turtle    aggressive');
  for (const cost of COSTS) {
    const line: string[] = [];
    for (const preset of presets) {
      let wins = 0;
      for (let i = 0; i < RUNS; i++) {
        const r = runSingleSimulation(preset, i, SEED + i, 'ease_dmg_0_6', 'nearest',
          { includeReinforce: true, reinforceCost: cost, stragglerMode: mode });
        if (r.victory) wins++;
      }
      line.push(`${(wins / RUNS * 100).toFixed(1)}%`);
    }
    console.log(`${String(cost).padEnd(7)} ${line.join('    ')}`);
  }
}
