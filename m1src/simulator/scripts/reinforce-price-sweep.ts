/**
 * 定价价格曲线扫描：战意 6–16 全档位 × baseline/turtle，验证 A10 非单调形态。
 * 机制解释假设：应急班生存覆盖存在阈值——8 意可高频连打维持坦克覆盖，
 * 10 意频繁消耗战意却仍断覆盖（40/10=4 次整、余 0，防御卡也买不起），两头受损。
 */
import { runSingleSimulation } from '../src/core/engine';

const RUNS = 1000, SEED = 20261001;
const COSTS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

for (const preset of ['baseline', 'turtle'] as const) {
  console.log(`\n===== preset=${preset}（每档 ${RUNS} 局）=====`);
  for (const cost of COSTS) {
    let wins = 0, plays = 0;
    for (let i = 0; i < RUNS; i++) {
      const r = runSingleSimulation(preset, i, SEED + i, 'ease_dmg_0_6', 'nearest',
        { includeReinforce: true, reinforceCost: cost });
      if (r.victory) wins++;
      plays += (r.reinforce_plays ?? []).length;
    }
    const bar = '#'.repeat(Math.round(wins / RUNS * 40));
    console.log(`cost=${String(cost).padStart(2)}意  胜率=${(wins / RUNS * 100).toFixed(1).padStart(5)}%  局均打出=${(plays / RUNS).toFixed(2)}  ${bar}`);
  }
}
