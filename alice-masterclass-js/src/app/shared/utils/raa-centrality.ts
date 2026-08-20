import * as d3 from 'd3';

/**
 * One colour scale for both nuclear-modification exercises.
 *
 * Exercise 1 shows three collision classes and codes them peripheral `#38bdf8`,
 * semi-central `#fbbf24`, central `#f472b6`. Exercise 2 has ten centrality
 * classes, so the same three colours are stretched into a continuous scale over
 * the class midpoint: 0–5% stays pink, 30–40% stays amber and 70–80% stays sky
 * blue, which means the same colour keeps meaning the same physics across both
 * exercises. 80–90% has no counterpart in exercise 1 and gets its own indigo.
 */
const CENTRALITY_ANCHORS = [2.5, 35, 75, 85];
const CENTRALITY_COLORS = ['#f472b6', '#fbbf24', '#38bdf8', '#818cf8'];

const colorScale = d3
  .scaleLinear<string>()
  .domain(CENTRALITY_ANCHORS)
  .range(CENTRALITY_COLORS)
  .interpolate(d3.interpolateLab)
  .clamp(true);

/**
 * Vertical offset of the two beams in the collision icon (impact parameter):
 * 0 is head-on, larger is a glancing blow. Exercise 1 hard-codes 0 / 5 / 14 for
 * its three classes; here the same numbers are read off a continuous scale.
 */
const impactScale = d3
  .scaleLinear()
  .domain(CENTRALITY_ANCHORS)
  .range([0, 5, 14, 16])
  .clamp(true);

/** Midpoint of a centrality class key such as `10-20`, in percent. */
export function centralityMidpoint(key: string): number {
  const [from, to] = key.split('-').map((part) => Number(part));
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return 50;
  }
  return (from + to) / 2;
}

export function centralityColor(key: string): string {
  return colorScale(centralityMidpoint(key));
}

export function centralityImpactOffset(key: string): number {
  return impactScale(centralityMidpoint(key));
}

/** Formatted class label, e.g. `0–5%` with an en dash. */
export function centralityLabel(key: string): string {
  return `${key.replace('-', '–')}%`;
}
