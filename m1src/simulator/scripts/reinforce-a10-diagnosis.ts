/**
 * A10 非单调异常诊断：胜率 15意→24%、10意→13.6%、8意→38.6% 跨种子复现。
 * 假设：10 意定价与火油(10)/盾墙(12) 同价格带，增援频繁打出把战意打到 0，
 * 挤占防御卡（火油/盾墙/齐射）的打出窗口。
 * 验证：对比三配置下各战术卡打出次数、战意耗尽后的防御卡跳过情况。
 */
import { runSingleSimulation } from '../src/core/engine';

const RUNS = 1000, SEED = 20261001;
const CONFIGS: [string, Record<string, unknown>][] = [
  ['对照15意', {}],
  ['A10意', { reinforceCost: 10 }],
  ['A8意', { reinforceCost: 8 }],
];

for (const preset of ['baseline', 'turtle'] as const) {
  console.log(`\n===== preset=${preset}（${RUNS} 局）=====`);
  for (const [name, opt] of CONFIGS) {
    const counts: Record<string, number> = {};
    let wins = 0, nights = 0;
    for (let i = 0; i < RUNS; i++) {
      const r = runSingleSimulation(preset, i, SEED + i, 'ease_dmg_0_6', 'nearest', { includeReinforce: true, ...opt });
      if (r.victory) wins++;
      nights += r.days_survived;
      for (const [card, n] of Object.entries(r.tactic_play_counts ?? {})) counts[card] = (counts[card] ?? 0) + n;
    }
    const per = (c: string) => ((counts[c] ?? 0) / RUNS).toFixed(2);
    console.log(
      `${name.padEnd(7)} 胜率=${(wins / RUNS * 100).toFixed(1)}%  ` +
      `局均夜数=${(nights / RUNS).toFixed(1)}  ` +
      `火油=${per('card_tactic_fire_oil')}  盾墙=${per('card_tactic_shield_wall')}  ` +
      `齐射=${per('card_tactic_volley')}  增援=${per('card_tactic_reinforce')}`
    );
  }
}
