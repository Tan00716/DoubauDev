/** 关键定价档跨种子复验（排除种子特异性）：7/8/10 意 × 3 种子基座 */
import { runSingleSimulation } from '../src/core/engine';
const RUNS = 1000;
const SEEDS = [20261001, 777000, 555111];
const COSTS = [7, 8, 10];
for (const seedBase of SEEDS) {
  const line: string[] = [];
  for (const cost of COSTS) {
    for (const preset of ['baseline', 'turtle'] as const) {
      let wins = 0;
      for (let i = 0; i < RUNS; i++) {
        const r = runSingleSimulation(preset, i, seedBase + i, 'ease_dmg_0_6', 'nearest',
          { includeReinforce: true, reinforceCost: cost });
        if (r.victory) wins++;
      }
      line.push(`${cost}意/${preset}=${(wins / RUNS * 100).toFixed(1)}%`);
    }
  }
  console.log(`seed=${seedBase}  ` + line.join('  '));
}
