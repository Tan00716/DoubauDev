/**
 * EMBERHOLD Batch Report Generator
 * Aggregates single-run reports into statistical summaries
 */

import type { SingleRunReport, BatchReport, BalanceFlag, ComparisonReport } from '../types/index.js';

export function generateBatchReport(
  presetName: string,
  runs: SingleRunReport[],
  batchId: string
): BatchReport {
  const total = runs.length;
  const victories = runs.filter(r => r.victory);
  const victoryRate = victories.length / total;
  const daysSurvived = runs.map(r => r.days_survived);
  const avgDays = daysSurvived.reduce((a, b) => a + b, 0) / total;
  const medianDays = median(daysSurvived);

  // Victory rate by day (conditional: given they reached this day, did they survive it?)
  const maxDays = Math.max(...daysSurvived, ...runs.filter(r => r.victory).map(r => r.days_survived));
  const victoryRateByDay: Record<number, number> = {};
  for (let d = 1; d <= maxDays; d++) {
    const reachedDay = runs.filter(r => r.days_survived >= d || r.victory);
    const survivedDay = runs.filter(r => r.days_survived > d || (r.days_survived === d && r.victory) || r.victory);
    victoryRateByDay[d] = reachedDay.length > 0 ? survivedDay.length / reachedDay.length : 0;
  }

  // Defeat reason distribution
  const defeatReasons: Record<string, number> = {};
  for (const r of runs) {
    if (r.defeat_reason) {
      defeatReasons[r.defeat_reason] = (defeatReasons[r.defeat_reason] || 0) + 1;
    }
  }

  // Average curves
  const maxCurveLen = Math.max(...runs.map(r => r.gold_curve.length));
  const avgGoldCurve: number[] = [];
  const avgWarSpiritCurve: number[] = [];
  const avgCasualtiesPerDay: number[] = [];

  for (let i = 0; i < maxCurveLen; i++) {
    const golds = runs.map(r => r.gold_curve[i] ?? r.gold_curve[r.gold_curve.length - 1]);
    avgGoldCurve.push(golds.reduce((a, b) => a + b, 0) / total);

    const spirits = runs.map(r => r.war_spirit_curve[i] ?? r.war_spirit_curve[r.war_spirit_curve.length - 1]);
    avgWarSpiritCurve.push(spirits.reduce((a, b) => a + b, 0) / total);
  }

  // Casualties per day approximation
  for (let d = 1; d <= maxDays; d++) {
    const dayRuns = runs.filter(r => r.days_survived >= d || r.victory);
    if (dayRuns.length === 0) {
      avgCasualtiesPerDay.push(0);
      continue;
    }
    // Use total casualties / days survived as proxy for per-day rate
    const avgCas = dayRuns.reduce((sum, r) => sum + (r.total_casualties / Math.max(1, r.days_survived)), 0) / dayRuns.length;
    avgCasualtiesPerDay.push(avgCas);
  }

  // TTC/TTK averages
  const avgTtcPerDay: number[] = [];
  const avgTtkPerDay: number[] = [];
  for (let d = 0; d < maxDays; d++) {
    const ttcs = runs.map(r => r.avg_ttc_per_day[d] ?? 0).filter(v => v > 0);
    const ttks = runs.map(r => r.avg_ttk_per_day[d] ?? 0).filter(v => v > 0);
    avgTtcPerDay.push(ttcs.length > 0 ? ttcs.reduce((a, b) => a + b, 0) / ttcs.length : 0);
    avgTtkPerDay.push(ttks.length > 0 ? ttks.reduce((a, b) => a + b, 0) / ttks.length : 0);
  }

  // Balance flags
  const flags: BalanceFlag[] = [];

  // Flag 1: Overall victory rate
  if (victoryRate < 0.15) {
    flags.push({
      type: 'error',
      message: `整体胜率仅 ${(victoryRate * 100).toFixed(1)}%，可能过难`,
      metric: 'victory_rate',
      value: victoryRate,
      threshold: 0.15,
    });
  } else if (victoryRate > 0.85) {
    flags.push({
      type: 'warning',
      message: `整体胜率 ${(victoryRate * 100).toFixed(1)}%，可能过易`,
      metric: 'victory_rate',
      value: victoryRate,
      threshold: 0.85,
    });
  }

  // Flag 2: Day 3 economic check
  if (avgGoldCurve[3] !== undefined && avgGoldCurve[3] < 100) {
    flags.push({
      type: 'warning',
      message: `第3夜平均金币存量 ${avgGoldCurve[3].toFixed(0)}，存在经济赤字风险`,
      metric: 'gold_day3',
      value: avgGoldCurve[3],
      threshold: 100,
    });
  }

  // Flag 3: Day 6+ collapse rate
  const day6Defeats = runs.filter(r => r.days_survived >= 6 && !r.victory).length;
  const day6Total = runs.filter(r => r.days_survived >= 6).length;
  if (day6Total > 0) {
    const day6FailRate = day6Defeats / day6Total;
    if (day6FailRate > 0.7) {
      flags.push({
        type: 'warning',
        message: `领主夜(第6夜+)崩溃率 ${(day6FailRate * 100).toFixed(1)}%，后期难度曲线可能过陡`,
        metric: 'day6_fail_rate',
        value: day6FailRate,
        threshold: 0.7,
      });
    }
  }

  // Flag 4: Main keep health at end
  const avgFinalKeepHealth = runs.reduce((sum, r) => sum + r.final_main_keep_health, 0) / total;
  if (avgFinalKeepHealth < 200 && victoryRate > 0) {
    flags.push({
      type: 'info',
      message: `通关时平均主堡剩余血量 ${avgFinalKeepHealth.toFixed(0)}，终局紧张感充足`,
      metric: 'final_keep_health',
      value: avgFinalKeepHealth,
      threshold: 200,
    });
  }

  return {
    batch_id: batchId,
    preset_name: presetName,
    total_runs: total,
    victory_rate: victoryRate,
    avg_days_survived: avgDays,
    median_days_survived: medianDays,
    victory_rate_by_day: victoryRateByDay,
    defeat_reason_distribution: defeatReasons,
    avg_gold_curve: avgGoldCurve,
    avg_war_spirit_curve: avgWarSpiritCurve,
    avg_casualties_per_day: avgCasualtiesPerDay,
    avg_ttc_per_day: avgTtcPerDay,
    avg_ttk_per_day: avgTtkPerDay,
    balance_flags: flags,
    runs,
  };
}

export function generateComparisonReport(batchReports: BatchReport[]): ComparisonReport {
  const presets = batchReports.map(b => b.preset_name);
  const crossFlags: BalanceFlag[] = [];

  if (batchReports.length >= 2) {
    const baseline = batchReports[0];
    for (let i = 1; i < batchReports.length; i++) {
      const other = batchReports[i];
      const vrDiff = other.victory_rate - baseline.victory_rate;
      if (Math.abs(vrDiff) > 0.15) {
        crossFlags.push({
          type: 'warning',
          message: `${other.preset_name} 胜率(${ (other.victory_rate * 100).toFixed(1) }%) 与 ${baseline.preset_name}(${ (baseline.victory_rate * 100).toFixed(1) }%) 差异 ${ (vrDiff * 100).toFixed(1) }pp，Build间不平衡`,
          metric: 'victory_rate_delta',
          value: Math.abs(vrDiff),
          threshold: 0.15,
        });
      }
    }
  }

  return {
    presets,
    batch_reports: batchReports,
    cross_flags: crossFlags,
  };
}

export function formatConsoleSummary(report: BatchReport): string {
  const lines: string[] = [];
  lines.push(`╔══════════════════════════════════════════════════════════════╗`);
  lines.push(`║     EMBERHOLD Battle Simulator - Batch Report               ║`);
  lines.push(`╠══════════════════════════════════════════════════════════════╣`);
  lines.push(`║ Preset: ${padRight(report.preset_name, 50)} ║`);
  lines.push(`║ Runs:   ${padRight(report.total_runs.toString(), 50)} ║`);
  lines.push(`╠══════════════════════════════════════════════════════════════╣`);
  lines.push(`║ 胜率:         ${padRight((report.victory_rate * 100).toFixed(1) + '%', 43)} ║`);
  lines.push(`║ 平均存活昼夜:  ${padRight(report.avg_days_survived.toFixed(1), 43)} ║`);
  lines.push(`║ 中位存活昼夜:  ${padRight(report.median_days_survived.toFixed(1), 43)} ║`);
  lines.push(`╠══════════════════════════════════════════════════════════════╣`);
  lines.push(`║ 每昼夜存活率:                                                ║`);
  Object.entries(report.victory_rate_by_day).forEach(([day, rate]) => {
    const bar = '█'.repeat(Math.round(rate * 20)) + '░'.repeat(20 - Math.round(rate * 20));
    lines.push(`║  Day ${padLeft(day, 2)}: ${bar} ${padLeft((rate * 100).toFixed(0) + '%', 4)}                       ║`);
  });
  lines.push(`╠══════════════════════════════════════════════════════════════╣`);
  lines.push(`║ 败因分布:                                                    ║`);
  Object.entries(report.defeat_reason_distribution).forEach(([reason, count]) => {
    const pct = ((count / report.total_runs) * 100).toFixed(1);
    lines.push(`║  ${padRight(reason, 20)}: ${padLeft(count.toString(), 4)} (${padLeft(pct + '%', 6)})                  ║`);
  });
  lines.push(`╠══════════════════════════════════════════════════════════════╣`);
  lines.push(`║ 经济曲线 (平均金币):                                         ║`);
  report.avg_gold_curve.forEach((g, i) => {
    const bar = '█'.repeat(Math.min(20, Math.round(g / 50))) + '░'.repeat(Math.max(0, 20 - Math.round(g / 50)));
    lines.push(`║  Day ${padLeft(i.toString(), 2)}: ${bar} ${padLeft(g.toFixed(0), 4)}                     ║`);
  });
  lines.push(`╠══════════════════════════════════════════════════════════════╣`);
  lines.push(`║ 平衡标记:                                                    ║`);
  if (report.balance_flags.length === 0) {
    lines.push(`║  [无] 数值在预期范围内                                        ║`);
  } else {
    report.balance_flags.forEach(f => {
      const icon = f.type === 'error' ? '✗' : f.type === 'warning' ? '!' : 'ℹ';
      lines.push(`║  [${icon}] ${padRight(f.message.slice(0, 54), 54)} ║`);
    });
  }
  lines.push(`╚══════════════════════════════════════════════════════════════╝`);

  return lines.join('\n');
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}

function padLeft(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : ' '.repeat(len - str.length) + str;
}
