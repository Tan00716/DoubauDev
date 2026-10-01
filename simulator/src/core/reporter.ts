/**
 * EMBERHOLD Batch Report Generator v2
 * 聚合单局报告：胜率、存活昼夜、败因分布、经济曲线、夜时长/空窗、容量压力。
 */

import type { SingleRunReport, BatchReport, BalanceFlag, ComparisonReport, NightStat } from '../types/index.js';
import { VICTORY_DAYS } from '../types/index.js';

export function generateBatchReport(
  presetName: string,
  runs: SingleRunReport[],
  batchId: string,
  variantName = 'current'
): BatchReport {
  const total = runs.length;
  if (total === 0) throw new Error('No runs to aggregate');
  const victories = runs.filter(r => r.victory);
  const victoryRate = victories.length / total;

  const daysSurvived = runs.map(r => r.days_survived);
  const avgDays = daysSurvived.reduce((a, b) => a + b, 0) / total;
  const medianDays = median(daysSurvived);

  // 每夜守夜率：到达该夜的 run 中，度过该夜（夜统计存在且非沦陷）的比例
  const survivalRateByDay: Record<number, number> = {};
  for (let d = 1; d <= VICTORY_DAYS; d++) {
    const reached = runs.filter(r => r.night_stats.some(n => n.day === d));
    if (reached.length === 0) {
      survivalRateByDay[d] = 0;
      continue;
    }
    const passed = reached.filter(r => {
      const n = r.night_stats.find(x => x.day === d)!;
      return n.end_reason !== 'main_keep_destroyed';
    });
    survivalRateByDay[d] = passed.length / reached.length;
  }

  // 败因分布 + 败亡昼夜分布
  const defeatReasons: Record<string, number> = {};
  const defeatDays: Record<number, number> = {};
  for (const r of runs) {
    if (r.defeat_reason) {
      defeatReasons[r.defeat_reason] = (defeatReasons[r.defeat_reason] || 0) + 1;
      const lostNight = r.night_stats.find(n => n.end_reason === 'main_keep_destroyed')?.day;
      if (lostNight) defeatDays[lostNight] = (defeatDays[lostNight] || 0) + 1;
    }
  }

  // 经济曲线（每夜结束后金币均值）
  const maxCurveLen = Math.max(...runs.map(r => r.gold_curve.length));
  const avgGoldCurve: number[] = [];
  for (let i = 0; i < maxCurveLen; i++) {
    const golds = runs.map(r => r.gold_curve[i] ?? r.gold_curve[r.gold_curve.length - 1]);
    avgGoldCurve.push(golds.reduce((a, b) => a + b, 0) / total);
  }

  // 夜时长 / 空窗 / 兜底
  const avgNightDuration: number[] = [];
  const avgNightIdleRatio: number[] = [];
  const nightTimeoutCount: number[] = [];
  for (let d = 1; d <= VICTORY_DAYS; d++) {
    const stats: NightStat[] = runs
      .map(r => r.night_stats.find(n => n.day === d))
      .filter((n): n is NightStat => !!n);
    if (stats.length === 0) {
      avgNightDuration.push(0);
      avgNightIdleRatio.push(0);
      nightTimeoutCount.push(0);
      continue;
    }
    avgNightDuration.push(stats.reduce((s, n) => s + n.duration, 0) / stats.length);
    avgNightIdleRatio.push(stats.reduce((s, n) => s + n.idle_seconds / Math.max(n.duration, 0.01), 0) / stats.length);
    nightTimeoutCount.push(stats.filter(n => n.end_reason === 'timeout_240s').length);
  }

  const avgCasualties = runs.reduce((s, r) => s + r.total_casualties, 0) / total;
  const avgRetreats = runs.reduce((s, r) => s + r.total_retreats, 0) / total;
  const avgFinalGold = runs.reduce((s, r) => s + r.final_gold, 0) / total;
  const avgFinalKeep = runs.reduce((s, r) => s + r.final_main_keep_health, 0) / total;

  // 容量压力
  const avgMilitaryBlocked = runs.reduce((s, r) => s + r.military_blocked, 0) / total;
  const avgWorkBlocked = runs.reduce((s, r) => s + r.work_blocked, 0) / total;
  // 工令阻塞且当时金币 ≥ 目标卡成本的比例（按 run 是否出现"有钱没容量"）
  const runsWithGoldBlocked = runs.filter(r =>
    r.work_blocked > 0 &&
    r.night_stats.length >= 1 // 至少活过第一夜
  ).length;
  const workBlockedWithGoldRate = total > 0 ? runsWithGoldBlocked / total : 0;

  const avgUpgrades = runs.reduce((s, r) => s + r.upgrades_bought, 0) / total;
  const avgRepairs = runs.reduce((s, r) => s + r.repairs_bought, 0) / total;

  // 平衡标记
  const flags: BalanceFlag[] = [];
  if (victoryRate > 0.9) {
    flags.push({ type: 'warning', message: `胜率 ${(victoryRate * 100).toFixed(1)}%，显著高于 90% 目标带上限，数值过易`, metric: 'victory_rate', value: victoryRate, threshold: 0.9 });
  } else if (victoryRate < 0.15) {
    flags.push({ type: 'error', message: `胜率 ${(victoryRate * 100).toFixed(1)}%，低于 15%，数值过难`, metric: 'victory_rate', value: victoryRate, threshold: 0.15 });
  }
  const earlyIdle = avgNightIdleRatio[0] ?? 0;
  if (earlyIdle > 0.5) {
    flags.push({ type: 'info', message: `第 1 夜平均空窗占比 ${(earlyIdle * 100).toFixed(0)}%，前期夜内空窗期过长`, metric: 'night1_idle_ratio', value: earlyIdle, threshold: 0.5 });
  }
  if (workBlockedWithGoldRate > 0.5) {
    flags.push({ type: 'info', message: `${(workBlockedWithGoldRate * 100).toFixed(0)}% 的局出现"金币充足但工令容量不足"的阻塞`, metric: 'work_blocked_with_gold_rate', value: workBlockedWithGoldRate, threshold: 0.5 });
  }

  return {
    batch_id: batchId,
    preset_name: presetName,
    variant_name: variantName,
    total_runs: total,
    victory_rate: victoryRate,
    avg_days_survived: avgDays,
    median_days_survived: medianDays,
    survival_rate_by_day: survivalRateByDay,
    defeat_reason_distribution: defeatReasons,
    defeat_day_distribution: defeatDays,
    avg_final_gold: avgFinalGold,
    avg_final_keep_health: avgFinalKeep,
    avg_gold_curve: avgGoldCurve,
    avg_casualties: avgCasualties,
    avg_retreats: avgRetreats,
    avg_night_duration: avgNightDuration,
    avg_night_idle_ratio: avgNightIdleRatio,
    night_timeout_count: nightTimeoutCount,
    avg_military_blocked: avgMilitaryBlocked,
    avg_work_blocked: avgWorkBlocked,
    work_blocked_with_gold_rate: workBlockedWithGoldRate,
    avg_upgrades: avgUpgrades,
    avg_repairs: avgRepairs,
    balance_flags: flags,
    runs,
  };
}

export function generateComparisonReport(batchReports: BatchReport[]): ComparisonReport {
  const presets = batchReports.map(b => `${b.preset_name}@${b.variant_name}`);
  const crossFlags: BalanceFlag[] = [];
  if (batchReports.length >= 2) {
    const baseline = batchReports[0];
    for (let i = 1; i < batchReports.length; i++) {
      const other = batchReports[i];
      const vrDiff = other.victory_rate - baseline.victory_rate;
      if (Math.abs(vrDiff) > 0.15) {
        crossFlags.push({
          type: 'warning',
          message: `${other.preset_name} 胜率(${(other.victory_rate * 100).toFixed(1)}%) 与 ${baseline.preset_name}(${(baseline.victory_rate * 100).toFixed(1)}%) 差 ${(vrDiff * 100).toFixed(1)}pp，Build 间不平衡`,
          metric: 'victory_rate_delta',
          value: Math.abs(vrDiff),
          threshold: 0.15,
        });
      }
    }
  }
  return { presets, batch_reports: batchReports, cross_flags: crossFlags };
}

export function formatConsoleSummary(report: BatchReport): string {
  const L: string[] = [];
  const vr = (report.victory_rate * 100).toFixed(1);
  L.push(`▶ ${report.preset_name} @ ${report.variant_name} — ${report.total_runs} 局`);
  L.push(`  胜率: ${vr}%   平均存活: ${report.avg_days_survived.toFixed(1)} 昼夜   中位: ${report.median_days_survived}`);
  L.push(`  终局金币均值: ${report.avg_final_gold.toFixed(0)}   终局主堡血量均值: ${report.avg_final_keep_health.toFixed(0)}`);
  L.push(`  阵亡班均值: ${report.avg_casualties.toFixed(1)}   撤退保卡均值: ${report.avg_retreats.toFixed(1)}   升级均值: ${report.avg_upgrades.toFixed(1)}   修复均值: ${report.avg_repairs.toFixed(1)}`);
  const dayRates = Object.entries(report.survival_rate_by_day)
    .map(([d, r]) => `D${d}:${(r * 100).toFixed(0)}%`)
    .join('  ');
  L.push(`  各夜守夜率: ${dayRates}`);
  if (Object.keys(report.defeat_reason_distribution).length > 0) {
    const reasons = Object.entries(report.defeat_reason_distribution)
      .map(([r, c]) => `${r}×${c}`)
      .join('  ');
    L.push(`  败因: ${reasons}`);
    const defeatDays = Object.entries(report.defeat_day_distribution)
      .map(([d, c]) => `第${d}夜×${c}`)
      .join('  ');
    if (defeatDays) L.push(`  败亡夜分布: ${defeatDays}`);
  }
  L.push(`  各夜时长均值: ${report.avg_night_duration.map(d => d.toFixed(0) + 's').join(' ')}`);
  L.push(`  各夜空窗占比: ${report.avg_night_idle_ratio.map(d => (d * 100).toFixed(0) + '%').join(' ')}`);
  L.push(`  240s兜底次数: ${report.night_timeout_count.join('/')}`);
  L.push(`  军令阻塞均值: ${report.avg_military_blocked.toFixed(1)}   工令阻塞均值: ${report.avg_work_blocked.toFixed(1)}   有钱没工令占比: ${(report.work_blocked_with_gold_rate * 100).toFixed(0)}%`);
  if (report.balance_flags.length > 0) {
    for (const f of report.balance_flags) {
      L.push(`  [${f.type === 'error' ? '✗' : f.type === 'warning' ? '!' : 'ℹ'}] ${f.message}`);
    }
  }
  return L.join('\n');
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
