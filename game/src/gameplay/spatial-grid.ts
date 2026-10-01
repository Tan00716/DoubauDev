import type { Position } from './game-state';

/**
 * 均匀网格空间分区（MVP 批次一·性能项）：
 * 将寻敌从 O(实体数×候选数) 的暴力全表扫描降为只查附近 cell。
 * 语义与暴力法一致：返回距离小于 maxRange 的最近实体（同距离并列时取遍历先到者，与暴力法顺序差异可忽略）。
 */
export interface GriddedEntity {
  id: string;
  position: Position;
}

export class SpatialGrid<T extends GriddedEntity> {
  private cells = new Map<number, T[]>();
  private readonly cellSize: number;
  private readonly originX: number;
  private readonly originZ: number;
  private readonly dim: number;

  constructor(cellSize = 4, mapSize = 34) {
    this.cellSize = cellSize;
    this.originX = -mapSize / 2;
    this.originZ = -mapSize / 2;
    this.dim = Math.ceil(mapSize / cellSize);
  }

  private cellKey(cx: number, cz: number): number {
    return cx * 1024 + cz;
  }

  clear(): void {
    this.cells.clear();
  }

  insert(item: T): void {
    // 建议级修复（质检批次一复核）：insert 允许负格 / 越界格索引，而 queryNearest 将扫描范围
    // 钳制在 [0, dim-1]——两侧不对称。若实体短暂越出地图边界（位移 overshoot、击退等），
    // 会被写入永远查不到的格，表现为「实体存在却寻敌 miss」。此处同样钳制：
    // 越界实体吸附到边缘格，保证 insert / queryNearest 格索引空间一致。
    const cx = this.clampIndex(Math.floor((item.position.x - this.originX) / this.cellSize));
    const cz = this.clampIndex(Math.floor((item.position.z - this.originZ) / this.cellSize));
    const key = this.cellKey(cx, cz);
    const arr = this.cells.get(key);
    if (arr) arr.push(item);
    else this.cells.set(key, [item]);
  }

  private clampIndex(idx: number): number {
    return Math.min(this.dim - 1, Math.max(0, idx));
  }

  /** 实体被移出战场时同步从网格摘除，保证查询结果与实时数组一致。 */
  removeById(id: string): void {
    for (const arr of this.cells.values()) {
      const idx = arr.findIndex(e => e.id === id);
      if (idx >= 0) {
        arr.splice(idx, 1);
        return;
      }
    }
  }

  /**
   * 最近邻查询：返回距 pos 距离小于 maxRange 的最近实体；maxRange 传 Infinity 表示不限距离（全图）。
   */
  queryNearest(pos: Position, maxRange: number): T | null {
    const cx = Math.floor((pos.x - this.originX) / this.cellSize);
    const cz = Math.floor((pos.z - this.originZ) / this.cellSize);
    const r = maxRange === Infinity ? this.dim : Math.ceil(maxRange / this.cellSize);
    const minCx = Math.max(0, cx - r);
    const maxCx = Math.min(this.dim - 1, cx + r);
    const minCz = Math.max(0, cz - r);
    const maxCz = Math.min(this.dim - 1, cz + r);

    let nearest: T | null = null;
    let minDist = maxRange;
    for (let gx = minCx; gx <= maxCx; gx++) {
      for (let gz = minCz; gz <= maxCz; gz++) {
        const arr = this.cells.get(this.cellKey(gx, gz));
        if (!arr) continue;
        for (const item of arr) {
          const dx = item.position.x - pos.x;
          const dz = item.position.z - pos.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < minDist * minDist) {
            minDist = Math.sqrt(d2);
            nearest = item;
          }
        }
      }
    }
    return nearest;
  }
}
