/**
 * What the lander is doing at one moment, for the "lander at this moment" schematic.
 *
 * Everything here is DERIVED from the same model the verdict uses: the Sun and Earth angles
 * against the site's LOLA skyline (selene.ts) and the first-order power model (power.ts).
 * Nothing is measured telemetry, and there is no trajectory, altitude, velocity or attitude:
 * SUNLOCK has no such data, so none is shown.
 *
 * The state is a pure function of the reading at the timeline's clock time. There is no
 * second clock: play, pause, scrub and speed all work because the caller passes the reading
 * for whatever time is on the clock, and the same inputs always give the same state.
 */
import { arrayPowerPerM2, HEATER_SUN_FRACTION, type ArrayMode, type LanderSpec } from "./power";
import { EARTH_ANGULAR_RADIUS, SUN_ANGULAR_RADIUS, visibleDiscFraction } from "./selene";

/** The part of a site reading this needs (selene.ts `Reading` satisfies it). */
export type LanderReading = {
  sunFrac: number;
  sunElev: number;
  sunAz: number;
  sunHorizon: number;
  earthElev: number;
  earthHorizon: number;
  comm: boolean;
};

export type LanderState = {
  /** share of the Sun's disc above the skyline, 0..1 */
  sunFrac: number;
  /** Sun's centre above (+) or below (-) the skyline in its direction, degrees */
  sunClearDeg: number;
  /** the same, in solar radii: -1 = disc just hidden, +1 = disc just clear */
  sunClearRadii: number;
  /** share of Earth's disc above the skyline, 0..1 */
  earthFrac: number;
  /** Earth's centre above (+) or below (-) the skyline in its direction, degrees */
  earthClearDeg: number;
  earthClearRadii: number;
  /** direct line to Earth: any part of Earth's disc above the skyline (the app's rule) */
  comm: boolean;
  /** array output now, W */
  generationW: number;
  /** array output as a share of what Sun-facing panels of this area give in full sunlight, 0..1 */
  generationShare: number;
  /** constant electrical load, W */
  loadW: number;
  /** heater draw now, W (0 unless less than half the Sun is up and heaters are set) */
  heaterW: number;
  heatersOn: boolean;
  /** generation - load - heaters, W: positive charges the battery, negative drains it */
  netW: number;
  flow: "charging" | "draining" | "balanced";
  mode: ArrayMode;
};

const finite = (...v: number[]) => v.every((x) => typeof x === "number" && Number.isFinite(x));

/**
 * The lander's state for one reading. Returns null when the reading is missing or not a
 * number (no site chosen, or a time outside the modelled data): the caller then shows
 * "no data" rather than a guessed state.
 */
export function getLanderState(reading: LanderReading | null | undefined, spec: LanderSpec, mode: ArrayMode): LanderState | null {
  if (!reading) return null;
  const { sunFrac, sunElev, sunAz, sunHorizon, earthElev, earthHorizon } = reading;
  if (!finite(sunFrac, sunElev, sunAz, sunHorizon, earthElev, earthHorizon, spec.loadW, spec.arrayM2)) return null;

  const frac = Math.min(1, Math.max(0, sunFrac));
  const generationW = arrayPowerPerM2(sunElev, frac, mode, sunAz) * spec.arrayM2;
  const peakW = arrayPowerPerM2(90, 1, "tracking") * spec.arrayM2;
  // the same heater rule as simulateMission: on until at least half the Sun is up
  const heaterW = frac < HEATER_SUN_FRACTION ? spec.heaterW ?? 0 : 0;
  const netW = generationW - spec.loadW - heaterW;
  const sunClearDeg = sunElev - sunHorizon;
  const earthClearDeg = earthElev - earthHorizon;

  return {
    sunFrac: frac,
    sunClearDeg,
    sunClearRadii: sunClearDeg / SUN_ANGULAR_RADIUS,
    earthFrac: visibleDiscFraction(earthClearDeg, EARTH_ANGULAR_RADIUS),
    earthClearDeg,
    earthClearRadii: earthClearDeg / EARTH_ANGULAR_RADIUS,
    comm: reading.comm,
    generationW,
    generationShare: peakW > 0 ? Math.min(1, generationW / peakW) : 0,
    loadW: spec.loadW,
    heaterW,
    heatersOn: heaterW > 0,
    netW,
    flow: Math.abs(netW) < 0.5 ? "balanced" : netW > 0 ? "charging" : "draining",
    mode,
  };
}

export type SkyPathPoint = {
  /** hours after the clock time */
  h: number;
  /** Sun's centre above (+) or below (-) the skyline in the Sun's direction, degrees */
  sunClearDeg: number;
  /** any part of the Sun's disc above the skyline */
  lit: boolean;
  /** Earth's centre above (+) or below (-) the skyline in Earth's direction, degrees */
  earthClearDeg: number;
  /** any part of Earth's disc above the skyline: a direct radio line */
  comm: boolean;
};

export type SkyPath = {
  points: SkyPathPoint[];
  /** hours covered, from the clock time to the last point */
  spanH: number;
  /** largest distance from the skyline reached by either body, degrees (for the scale) */
  maxAbsDeg: number;
  /** readings that were missing or not a number and were left out, never filled in */
  skipped: number;
};

/**
 * The Sun's and Earth's paths against the skyline over the stay: one point per reading, in
 * time order, starting at the clock time. Each point is the model's value for that time step;
 * nothing is interpolated or smoothed, and a missing reading is skipped and counted.
 */
export function getSkyPath(readings: (LanderReading | null | undefined)[], stepMin: number): SkyPath {
  const points: SkyPathPoint[] = [];
  let skipped = 0, maxAbsDeg = 0;
  for (let i = 0; i < readings.length; i++) {
    const r = readings[i];
    if (!r || !finite(r.sunElev, r.sunHorizon, r.earthElev, r.earthHorizon, r.sunFrac)) { skipped++; continue; }
    const sunClearDeg = r.sunElev - r.sunHorizon, earthClearDeg = r.earthElev - r.earthHorizon;
    maxAbsDeg = Math.max(maxAbsDeg, Math.abs(sunClearDeg), Math.abs(earthClearDeg));
    points.push({ h: (i * stepMin) / 60, sunClearDeg, lit: r.sunFrac > 0, earthClearDeg, comm: r.comm });
  }
  return { points, spanH: points.length ? points[points.length - 1].h : 0, maxAbsDeg, skipped };
}

/**
 * Split a path into runs where a yes/no state holds, so each run can be drawn in its own
 * colour. Neighbouring runs share their boundary point, so the line has no gaps; a break in
 * the data (points more than `maxGapH` apart) starts a new run and is not bridged.
 */
export function pathRuns<T extends { h: number }>(points: T[], on: (p: T) => boolean, maxGapH: number): { on: boolean; points: T[] }[] {
  const runs: { on: boolean; points: T[] }[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i], state = on(p), last = runs[runs.length - 1];
    const gap = i > 0 && p.h - points[i - 1].h > maxGapH;
    if (!last || gap) runs.push({ on: state, points: [p] });
    else if (last.on === state) last.points.push(p);
    else { last.points.push(p); runs.push({ on: state, points: [p] }); }
  }
  return runs;
}

/**
 * Where to draw a disc against its skyline, in disc radii above the skyline line. The true
 * offset is used while the disc is near the skyline (where it matters); far above or below
 * it is held at a fixed distance so the drawing stays inside its frame. `held` says the
 * position is no longer to scale, and the caller prints the true angle next to it.
 */
export function discOffset(clearRadii: number, maxUp = 2.4, maxDown = 1.6): { radii: number; held: boolean } {
  if (!Number.isFinite(clearRadii)) return { radii: -maxDown, held: true };
  if (clearRadii > maxUp) return { radii: maxUp, held: true };
  if (clearRadii < -maxDown) return { radii: -maxDown, held: true };
  return { radii: clearRadii, held: false };
}

/**
 * Phase of the moving dashes on the sunlight and radio lines, 0..1, taken from the timeline
 * time itself: they move only when the clock moves, stop where it stops, and run backwards
 * when the user scrubs backwards.
 */
export function flowPhase(tMs: number, periodMs = 6 * 3600000): number {
  if (!Number.isFinite(tMs) || periodMs <= 0) return 0;
  return (((tMs % periodMs) + periodMs) % periodMs) / periodMs;
}
