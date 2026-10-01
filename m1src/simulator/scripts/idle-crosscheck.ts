/**
 * 批次二空窗优化·模拟器交叉复核（对齐 game v7 节奏：波间 10s / 首夜 6s / 预演 3s / 第 2 夜起残兵）。
 * 口径（与 game checkWaveProgress 一致）：夜内场上敌人存活数为 0 的累计时长 / 夜总时长。
 * 验收线：第 1 夜 ≤50%、第 2 夜起 ≤40%。
 * 变体：ease_dmg_0_6（game 已落地 ×0.6：狼 6→4、粉碎者 10→6、掘地者 8→5）。
 */
import { runSingleSimulation } from '../src/core/engine';

const RUNS = 1000, SEED = 20261001;
const presets = ['baseline', 'turtle', 'aggressive'] as const;

for (const preset of presets) {
  // nightAgg[n] = [emptySecondsSum, durationSum, nightsCounted]
  const nightAgg: Record<number, [number, number, number]> = {};
  let wins = 0;
  for (let i = 0; i < RUNS; i++) {
    const r = runSingleSimulation(preset, i, SEED + i, 'ease_dmg_0_6', 'nearest');
    if (r.victory) wins++;
    for (const ns of r.night_stats) {
      const a = nightAgg[ns.day] ?? [0, 0, 0];
      a[0] += ns.empty_field_seconds;
      a[1] += ns.duration;
      a[2] += 1;
      nightAgg[ns.day] = a;
    }
  }
  console.log(`\n===== preset=${preset}  胜率=${(wins / RUNS * 100).toFixed(1)}%（前值 46.2/53.8/39.8）=====`);
  console.log('夜   场均时长  空窗占比(game口径:敌人为0)  样本  验收');
  for (const day of Object.keys(nightAgg).map(Number).sort((a, b) => a - b)) {
    const [emp, dur, cnt] = nightAgg[day];
    // 无接敌口径需另存——此处仅 game 口径；用 idle_seconds 需重跑，先输出 game 口径
    const pct = emp / dur * 100;
    const limit = day === 1 ? 50 : 40;
    console.log(
      `N${day}  ${(dur / cnt).toFixed(1).padStart(5)}s  ${(pct).toFixed(1).padStart(5)}%  n=${cnt}  ${pct <= limit ? 'PASS' : 'FAIL'}(≤${limit}%)`
    );
  }
}
