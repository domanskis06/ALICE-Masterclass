import * as d3 from 'd3';

/**
 * Drawing helpers shared by the two Spectrum Analysis plot renderers.
 *
 * Both used to draw into a fixed 560 × 340 viewBox and let the browser stretch it
 * with `preserveAspectRatio="none"`. That distorted every glyph — a card twice as
 * wide as it is tall rendered the axis numbers at 1.6× their intended width — and
 * clipped whatever stuck out of the box, which for a spectrum is its own unit
 * label. The renderers now draw at the element's real pixel size instead, so a
 * plot on a card and the same plot in the enlarged dialog use identical type.
 */

/** Room for tick labels and the axis caption, in CSS pixels. */
export interface NmfPlotMargin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface NmfPlotBox {
  width: number;
  height: number;
}

/** Used until the element has been laid out (and by the unit tests). */
export const NMF_PLOT_FALLBACK: NmfPlotBox = { width: 560, height: 340 };

export function measure(element: Element): NmfPlotBox {
  const rect = element.getBoundingClientRect();
  return {
    width: Math.max(Math.round(rect.width) || NMF_PLOT_FALLBACK.width, 220),
    height: Math.max(Math.round(rect.height) || NMF_PLOT_FALLBACK.height, 160),
  };
}

/**
 * Widen the left margin when there is a rotated caption to fit beside the tick
 * labels. `counts / event / GeV/c / N_coll` is a legitimate unit here, and it has
 * to be readable rather than sliced off at the card edge.
 */
export function leftMarginFor(label: string, base = 48): number {
  return base + (label ? 16 : 0);
}

interface LabelPart {
  text: string;
  sub: boolean;
}

/**
 * `p_T (GeV/c)` → `p`, subscript `T`, ` (GeV/c)`.
 *
 * The axis captions come from the translations as `R_AA` and `p_T (GeV/c)`,
 * which is how the desktop app writes them in source but not how ROOT draws them.
 * A subscript runs from the underscore to the next space or punctuation.
 */
export function splitSubscripts(text: string): LabelPart[] {
  const parts: LabelPart[] = [];
  let rest = text;
  let plain = '';

  while (rest.length) {
    const at = rest.indexOf('_');
    if (at < 0) {
      plain += rest;
      break;
    }
    plain += rest.slice(0, at);
    rest = rest.slice(at + 1);
    const end = rest.search(/[\s(),/]/);
    const sub = end < 0 ? rest : rest.slice(0, end);
    rest = end < 0 ? '' : rest.slice(end);
    if (!sub) {
      // A stray underscore: keep it rather than swallowing it.
      plain += '_';
      continue;
    }
    if (plain) {
      parts.push({ text: plain, sub: false });
      plain = '';
    }
    parts.push({ text: sub, sub: true });
  }
  if (plain) {
    parts.push({ text: plain, sub: false });
  }
  return parts;
}

/** True when the caption carries at least one subscript. */
export function hasSubscript(text: string): boolean {
  return splitSubscripts(text).some((part) => part.sub);
}

/**
 * Append a `<text>` whose subscripts sit on a lowered baseline. `dy` is relative
 * to the previous tspan, so every run has to step back up to the baseline.
 */
export function drawLabel(
  parent: d3.Selection<SVGGElement, unknown, null, undefined>,
  text: string,
): d3.Selection<SVGTextElement, unknown, null, undefined> {
  const node = parent.append('text');
  const parts = splitSubscripts(text);
  let lowered = false;
  for (const part of parts) {
    const tspan = node.append('tspan').text(part.text);
    if (part.sub && !lowered) {
      tspan.attr('class', 'nmf-plot-sub').attr('dy', '0.3em');
      lowered = true;
    } else if (part.sub) {
      tspan.attr('class', 'nmf-plot-sub');
    } else if (lowered) {
      tspan.attr('dy', '-0.3em');
      lowered = false;
    }
  }
  return node;
}

/** Faint horizontal rules behind the data, the way ROOT's `SetGrid` draws them. */
export function drawGrid(
  plot: d3.Selection<SVGGElement, unknown, null, undefined>,
  y: d3.ScaleContinuousNumeric<number, number>,
  x0: number,
  x1: number,
  ticks: number[],
): void {
  const grid = plot.append('g').attr('class', 'nmf-plot-grid');
  for (const tick of ticks) {
    grid
      .append('line')
      .attr('x1', x0)
      .attr('x2', x1)
      .attr('y1', y(tick))
      .attr('y2', y(tick));
  }
}
