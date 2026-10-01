/**
 * 前瞻实验：N3 定案「紧急增援近似牌入池」对胜率的量化影响。
 * 产品定 ×0.6 基准时该牌尚未入池——入池后夜间多一张 15 战意应急盾卫，需评估难度下移幅度。
 */
import { runSingleSimulation } from '../src/core/engine';

const RUNS = 1000, SEED = 20261001;
const presets = ['baseline', 'turtle', 'aggressive'];

for (const variant of ['current', 'ease_dmg_0_6']) {
  console.log(`\n=== variant=${variant}（${RUNS} 局/preset）===`);
  console.log('preset      无增援牌   入池后     Δ');
  for (const p of presets) {
    let w0 = 0, w1 = 0;
    for (let i = 0; i < RUNS; i++) {
      if (runSingleSimulation(p, i, SEED + i, variant).victory) w0++;
      if (runSingleSimulation(p, i, SEED + i, variant, 'nearest', { includeReinforce: true }).victory) w1++;
    }
    const a = w0 / RUNS * 100, b = w1 / RUNS * 100;
    console.log(`${p.padEnd(11)} ${(a).toFixed(1).padStart(5)}%   ${(b).toFixed(1).padStart(5)}%   ${(b - a >= 0 ? '+' : '')}${(b - a).toFixed(1)}pp`);
  }
}
