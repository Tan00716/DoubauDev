/**
 * A10 异常机制消融：区分「应急班死亡有害」vs「纯战意经济」。
 * M1 应急班不死：reinforceHP=99999（打不死，纯增益坦克）
 * M2 战意等效免费：cost=10 但夜末全额返还不可行 → 用 C 开关近似（返还 50%）对照。
 * 若 M1 下 A10 恢复到对照水平以上 → 死亡环节有害；若仍 13% → 纯经济挤占。
 */
import { runSingleSimulation } from '../src/core/engine';

const RUNS = 1000, SEED = 20261001;
const CONFIGS: [string, Record<string, unknown>][] = [
  ['A10 原样', { reinforceCost: 10 }],
  ['A10+班不死', { reinforceCost: 10, reinforceHP: 99999 }],
  ['A8+班不死', { reinforceCost: 8, reinforceHP: 99999 }],
  ['15意+班不死', { reinforceHP: 99999 }],
];

for (const preset of ['baseline', 'turtle'] as const) {
  console.log(`\n===== preset=${preset}（${RUNS} 局）=====`);
  for (const [name, opt] of CONFIGS) {
    let wins = 0;
    for (let i = 0; i < RUNS; i++) {
      const r = runSingleSimulation(preset, i, SEED + i, 'ease_dmg_0_6', 'nearest', { includeReinforce: true, ...opt });
      if (r.victory) wins++;
    }
    console.log(`${name.padEnd(10)} 胜率=${(wins / RUNS * 100).toFixed(1)}%`);
  }
}
