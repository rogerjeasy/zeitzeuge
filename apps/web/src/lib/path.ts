/**
 * Catmull-Rom → cubic Bézier. Turns the sampled horizon into a smooth path
 * without the overshoot a naive quadratic smoothing produces on sharp summits —
 * which matters here, because an overshooting Grosser Mythen would look wrong
 * to anyone who has seen it.
 */
export function smoothPath(
  points: readonly (readonly [number, number])[],
  scaleX = 100,
  scaleY = 100,
  tension = 0.5,
): string {
  if (points.length < 2) return "";

  const p = points.map(([x, y]) => [x * scaleX, y * scaleY] as const);
  let d = `M ${p[0][0].toFixed(3)} ${p[0][1].toFixed(3)}`;

  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2] ?? p2;

    const c1x = p1[0] + ((p2[0] - p0[0]) / 6) * tension;
    const c1y = p1[1] + ((p2[1] - p0[1]) / 6) * tension;
    const c2x = p2[0] - ((p3[0] - p1[0]) / 6) * tension;
    const c2y = p2[1] - ((p3[1] - p1[1]) / 6) * tension;

    d += ` C ${c1x.toFixed(3)} ${c1y.toFixed(3)}, ${c2x.toFixed(3)} ${c2y.toFixed(3)}, ${p2[0].toFixed(3)} ${p2[1].toFixed(3)}`;
  }

  return d;
}

/**
 * The curve as the Skyline Extractor (agent 6) would hand it over: sampled from
 * pixels, so slightly noisy and not yet registered against the terrain. The
 * offset between this and the ray-cast curve is the thing the match stage
 * resolves.
 */
export function jitterCurve(
  points: readonly (readonly [number, number])[],
  amplitude = 0.004,
): (readonly [number, number])[] {
  return points.map(([x, y], i) => {
    const noise =
      Math.sin(i * 1.7) * 0.6 + Math.sin(i * 0.43 + 1.2) * 0.4;
    return [x, y + noise * amplitude] as const;
  });
}
