/** Histogram binning + ASCII/SVG render. */
export interface Bin {
  lo: number;
  hi: number;
  count: number;
}

export function formatHistogramCountLabel(count: number): string {
  return `${count} value${count === 1 ? '' : 's'}`;
}

export function histogramBins(values: number[], nBins = 20): Bin[] {
  if (!values.length) return [];
  const sorted = values.slice().sort((a, b) => a - b);
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  if (lo === hi) return [{ lo, hi, count: values.length }];
  const span = hi - lo;
  const w = span / nBins;
  const bins: Bin[] = [];
  for (let i = 0; i < nBins; i++) {
    const bLo = lo + w * i;
    const bHi = i === nBins - 1 ? hi : lo + w * (i + 1);
    bins.push({ lo: bLo, hi: bHi, count: 0 });
  }
  for (const v of values) {
    let idx = Math.floor((v - lo) / w);
    if (idx >= nBins) idx = nBins - 1;
    if (idx < 0) idx = 0;
    bins[idx].count++;
  }
  return bins;
}

export function renderHistogramAscii(bins: Bin[]): string {
  if (!bins.length) return '(no values)';
  const maxBar = 40;
  const maxCount = Math.max(...bins.map((b) => b.count));
  return bins
    .map((b) => {
      const bar = '█'.repeat(Math.round((b.count / Math.max(1, maxCount)) * maxBar)).padEnd(maxBar);
      return `${pad(b.lo, 12)} … ${pad(b.hi, 12)} │ ${bar} ${b.count}`;
    })
    .join('\n');
}

function pad(n: number, w: number): string {
  if (!Number.isFinite(n)) return 'NaN'.padStart(w);
  const s = n.toFixed(2);
  return s.padStart(w);
}

export function renderHistogramSvg(bins: Bin[]): string {
  if (!bins.length) return '<svg width="0" height="0"></svg>';
  const w = 600;
  const h = 160;
  const barW = w / bins.length;
  const maxCount = Math.max(...bins.map((b) => b.count));
  const total = bins.reduce((s, b) => s + b.count, 0);
  const rect = bins
    .map((b, i) => {
      const bh = maxCount === 0 ? 0 : (b.count / maxCount) * (h - 20);
      return `<rect x="${(i * barW).toFixed(2)}" y="${(h - bh - 10).toFixed(2)}" width="${(barW - 1).toFixed(2)}" height="${bh.toFixed(2)}" fill="var(--accent)"/>`;
    })
    .join('');
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="max-width:100%;font-family:monospace">${rect}<text x="0" y="14" fill="var(--fg-muted)" font-size="10">n=${formatHistogramCountLabel(total)}</text></svg>`;
}
