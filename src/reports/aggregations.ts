/** Pure aggregation functions for the Reports panel.
 *  Operate on `rows: unknown[][]` paired with `columns: string[]`.
 */

export type ColumnStats = {
  name: string;
  type: 'number' | 'string' | 'boolean' | 'date' | 'null';
  count: number;
  missing: number;
  distinct: number;
  numeric?: NumericStats;
  stringStats?: StringStats;
  dateStats?: DateStats;
  topValues?: { value: string; count: number }[];
};

export type NumericStats = {
  min: number;
  max: number;
  mean: number;
  median: number;
  stddev: number;
  p25: number;
  p75: number;
  p95: number;
};

export type StringStats = {
  avgLength: number;
  minLength: number;
  maxLength: number;
};

export type DateStats = {
  minIso: string;
  maxIso: string;
  rangeDays: number;
};

function inferColumnType(rows: unknown[][]): 'number' | 'string' | 'boolean' | 'date' | 'null' {
  let num = 0;
  let boo = 0;
  let dt = 0;
  let nonNull = 0;
  for (const r of rows) {
    const v = r[0];
    if (v === null || v === undefined || v === '') continue;
    nonNull++;
    if (typeof v === 'number' && Number.isFinite(v)) num++;
    else if (typeof v === 'boolean') boo++;
    else if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
      const t = Date.parse(v);
      if (!Number.isNaN(t)) dt++;
    }
  }
  if (nonNull === 0) return 'null';
  if (num / nonNull > 0.8) return 'number';
  if (boo / nonNull > 0.8) return 'boolean';
  if (dt / nonNull > 0.8) return 'date';
  return 'string';
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return Number.NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function numericStats(values: number[]): NumericStats {
  if (!values.length) {
    return {
      min: NaN,
      max: NaN,
      mean: NaN,
      median: NaN,
      stddev: NaN,
      p25: NaN,
      p75: NaN,
      p95: NaN,
    };
  }
  const sorted = values.slice().sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  const mean = sum / sorted.length;
  let sq = 0;
  for (const v of sorted) sq += (v - mean) ** 2;
  const stddev = Math.sqrt(sq / sorted.length);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean,
    median: quantile(sorted, 0.5),
    stddev,
    p25: quantile(sorted, 0.25),
    p75: quantile(sorted, 0.75),
    p95: quantile(sorted, 0.95),
  };
}

export function stringStats(values: string[]): StringStats {
  if (!values.length) return { avgLength: 0, minLength: 0, maxLength: 0 };
  let sum = 0;
  let min = Infinity;
  let max = 0;
  for (const v of values) {
    const n = v.length;
    sum += n;
    if (n < min) min = n;
    if (n > max) max = n;
  }
  return { avgLength: sum / values.length, minLength: min, maxLength: max };
}

export function computeColumnStats(column: string, colIdx: number, rows: unknown[][]): ColumnStats {
  const slice = rows.map((r) => r[colIdx]);
  const nonNull = slice.filter((v) => v !== null && v !== undefined && v !== '');
  const count = nonNull.length;
  const missing = slice.length - count;
  const distinctSet = new Set(nonNull.map((v) => (v instanceof Date ? v.toISOString() : String(v))));
  const stats: ColumnStats = {
    name: column,
    type: 'null',
    count,
    missing,
    distinct: distinctSet.size,
  };
  // histogram-of-types + numeric/string/date stats
  const type = inferColumnStatsType(slice);
  stats.type = type;
  if (type === 'number') {
    const nums = nonNull.map((v) => Number(v)).filter((v) => Number.isFinite(v));
    stats.numeric = numericStats(nums);
  } else if (type === 'string') {
    const strs = nonNull.map((v) => String(v));
    stats.stringStats = stringStats(strs);
  } else if (type === 'date') {
    const dts = nonNull
      .map((v) => (v instanceof Date ? v.getTime() : Date.parse(String(v))))
      .filter((t) => !Number.isNaN(t))
      .sort((a, b) => a - b);
    if (dts.length) {
      const min = new Date(dts[0]).toISOString();
      const max = new Date(dts[dts.length - 1]).toISOString();
      stats.dateStats = {
        minIso: min,
        maxIso: max,
        rangeDays: Math.round((dts[dts.length - 1] - dts[0]) / (1000 * 60 * 60 * 24)),
      };
    }
  }
  // top-10 values
  const freq = new Map<string, number>();
  for (const v of nonNull) {
    const key = v instanceof Date ? v.toISOString() : String(v);
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }
  stats.topValues = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([value, c]) => ({ value, count: c }));
  return stats;
}

function inferColumnStatsType(slice: unknown[]): ColumnStats['type'] {
  let num = 0;
  let dt = 0;
  let nonNull = 0;
  for (const v of slice) {
    if (v === null || v === undefined || v === '') continue;
    nonNull++;
    if (typeof v === 'number' && Number.isFinite(v)) num++;
    else if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
      const t = Date.parse(v);
      if (!Number.isNaN(t)) dt++;
    }
  }
  if (nonNull === 0) return 'null';
  if (num / nonNull > 0.8) return 'number';
  if (dt / nonNull > 0.8) return 'date';
  return 'string';
}
