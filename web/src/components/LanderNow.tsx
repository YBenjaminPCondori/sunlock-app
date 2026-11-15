import { discOffset, flowPhase, pathRuns, type LanderState, type SkyPath, type SkyPathPoint } from "../lib/lander";
import { fmtPower } from "../lib/power";

type Props = {
  /** the lander's state for the time on the timeline clock, or null when there is no data */
  state: LanderState | null;
  /** the timeline clock, ms: only used to move the dashes, so they stop when the clock stops */
  tMs: number;
  siteName: string;
  /** Sun and Earth against the skyline from the clock time to the end of the stay, or null */
  path: SkyPath | null;
  stayDays: number;
};

const W = 360, H = 132;
const GROUND = 108;
const SUN = { x: 54, sky: 74, r: 11 };
const EARTH = { x: 306, sky: 74, r: 14 };
const BODY = { x: 180, y: 84 };

const signed = (deg: number) => `${deg >= 0 ? "+" : "−"}${Math.abs(deg).toFixed(2)}°`;

/**
 * The lander on the surface at the moment shown on the timeline: how much of the Sun and of
 * Earth clears the local skyline, what the panels make, where the power goes, and whether
 * there is a direct line to Earth.
 *
 * Every value is computed by the model for the clock time (lib/lander.ts); the drawing of the
 * lander itself is illustrative and not to scale. There is no animation clock in here: the
 * picture is a function of the props, so it plays, pauses, scrubs and changes speed with the
 * timeline and cannot drift from it.
 */
const PW = 360, PH = 78, PL = 30, PR = 6, PT = 8, PB = 14;

/**
 * The Sun's and Earth's paths against the skyline from the clock time to the end of the stay.
 * Height is degrees above or below the skyline in each body's own direction, so the line
 * crossing zero is a sunrise, sunset, Earthrise or Earthset. Each vertex is one model time
 * step; the lines are straight between steps and nothing is smoothed.
 */
function SkyPaths({ path, stayDays }: { path: SkyPath; stayDays: number }) {
  const span = Math.max(1, path.spanH);
  const top = Math.max(1, Math.ceil(path.maxAbsDeg));
  const x = (h: number) => PL + (h / span) * (PW - PL - PR);
  const y = (deg: number) => PT + ((top - Math.max(-top, Math.min(top, deg))) / (2 * top)) * (PH - PT - PB);
  const stepH = path.points.length > 1 ? path.points[1].h - path.points[0].h : 1;
  const line = (pts: SkyPathPoint[], key: "sunClearDeg" | "earthClearDeg") =>
    pts.map((p, i) => `${i ? "L" : "M"}${x(p.h).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");
  const sunRuns = pathRuns(path.points, (p) => p.lit, stepH * 1.5);
  const earthRuns = pathRuns(path.points, (p) => p.comm, stepH * 1.5);
  const first = path.points[0];
  const days = Math.round(span / 24);
  const litH = sunRuns.filter((r) => r.on).reduce((s, r) => s + (r.points[r.points.length - 1].h - r.points[0].h), 0);
  const commH = earthRuns.filter((r) => r.on).reduce((s, r) => s + (r.points[r.points.length - 1].h - r.points[0].h), 0);
  const label =
    `Sun and Earth against the skyline over the next ${days} days. ` +
    `Sun up for about ${Math.round((100 * litH) / span)}% of the time, Earth in view for about ${Math.round((100 * commH) / span)}%.`;

  return (
    <div className="ln-paths">
      <div className="ln-paths-head">
        <span className="ln-k">Sun and Earth paths · next {days === stayDays ? `${stayDays} days (your stay)` : `${days} days`}</span>
        <span className="ln-paths-key"><i className="k-sun" /> Sun <i className="k-earth" /> Earth <i className="k-off" /> hidden</span>
      </div>
      <svg viewBox={`0 0 ${PW} ${PH}`} className="ln-svg ln-paths-svg" role="img" aria-label={label}>
        {/* below the skyline is ground */}
        <rect className="ln-paths-ground" x={PL} y={y(0)} width={PW - PL - PR} height={PH - PB - y(0)} />
        <line className="ln-skyline" x1={PL} x2={PW - PR} y1={y(0)} y2={y(0)} />
        {Array.from({ length: Math.floor(span / 24) }, (_, d) => d + 1).map((d) => (
          <line key={d} className="ln-paths-day" x1={x(d * 24)} x2={x(d * 24)} y1={PT} y2={PH - PB} />
        ))}
        {earthRuns.map((r, i) => <path key={`e${i}`} d={line(r.points, "earthClearDeg")} className={r.on ? "ln-path is-earth" : "ln-path is-off"} />)}
        {sunRuns.map((r, i) => <path key={`s${i}`} d={line(r.points, "sunClearDeg")} className={r.on ? "ln-path is-sun" : "ln-path is-off"} />)}
        {/* where each body is at the clock time: the same values as the picture above */}
        <circle className="ln-paths-now is-earth" cx={x(0)} cy={y(first.earthClearDeg)} r="3" />
        <circle className="ln-paths-now is-sun" cx={x(0)} cy={y(first.sunClearDeg)} r="3" />
        <text className="ln-lab ln-lab-dim" x={PL - 3} y={PT + 3} textAnchor="end">+{top}°</text>
        <text className="ln-lab ln-lab-dim" x={PL - 3} y={y(0) + 3} textAnchor="end">sky</text>
        <text className="ln-lab ln-lab-dim" x={PL - 3} y={PH - PB} textAnchor="end">−{top}°</text>
        <text className="ln-lab ln-lab-dim" x={PL} y={PH - 3}>now</text>
        <text className="ln-lab ln-lab-dim" x={PW - PR} y={PH - 3} textAnchor="end">+{days} d</text>
      </svg>
      <p className="ln-note">
        Height above (+) or below (−) the local skyline in each body's own direction, one point per {Math.round(stepH * 60)} minutes of model time, straight lines between points.
        {path.skipped > 0 ? ` ${path.skipped} time step${path.skipped > 1 ? "s have" : " has"} no data and ${path.skipped > 1 ? "are" : "is"} left blank.` : ""}
        {" "}These are paths across the sky, not a flight path.
      </p>
    </div>
  );
}

export default function LanderNow({ state, tMs, siteName, path, stayDays }: Props) {
  if (!state) {
    return (
      <div className="ln">
        <div className="ln-head"><span className="ln-title">The lander at this moment</span></div>
        <p className="ln-none">No model data for this time and place, so nothing is drawn.</p>
      </div>
    );
  }

  const sun = discOffset(state.sunClearRadii);
  const earth = discOffset(state.earthClearRadii);
  const sunY = SUN.sky - sun.radii * SUN.r;
  const earthY = EARTH.sky - earth.radii * EARTH.r;
  const dash = -flowPhase(tMs) * 48; // one dash cycle is 12 units; four cycles per 6 h of timeline

  // where the light and the radio line meet the lander
  const panel = state.mode === "horizontal" ? { x: BODY.x, y: BODY.y - 20 } : { x: BODY.x - 23, y: BODY.y - 8 };
  const dish = { x: BODY.x + 15, y: BODY.y - 20 };
  const lit = state.sunFrac > 0;
  const glow = 0.25 + 0.75 * state.generationShare;

  const sunText = state.sunFrac >= 1 ? "whole disc up" : state.sunFrac <= 0 ? "hidden" : `${Math.round(state.sunFrac * 100)}% of disc up`;
  const earthText = state.earthFrac >= 1 ? "whole disc up" : state.earthFrac <= 0 ? "hidden" : `${Math.round(state.earthFrac * 100)}% of disc up`;
  const summary =
    `At ${siteName}: Sun ${sunText}, centre ${signed(state.sunClearDeg)} from the skyline. ` +
    `Panels make ${fmtPower(state.generationW)}, the lander uses ${fmtPower(state.loadW + state.heaterW)}` +
    `${state.heatersOn ? " including heaters" : ""}, so the battery is ${state.flow}. ` +
    `Earth ${earthText}; ${state.comm ? "direct line to Earth" : "no direct line to Earth"}.`;

  return (
    <div className="ln">
      <div className="ln-head">
        <span className="ln-title">Lander now</span>
        <span className="ln-tag" title="Angles and watts are computed by the model for the time on the clock. They are not telemetry from a spacecraft. The lander drawing is illustrative.">
          model · schematic
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="ln-svg" role="img" aria-label={summary}>
        <defs>
          <clipPath id="ln-sun-sky"><rect x="0" y="0" width={W / 2} height={SUN.sky} /></clipPath>
          <clipPath id="ln-earth-sky"><rect x={W / 2} y="0" width={W / 2} height={EARTH.sky} /></clipPath>
        </defs>

        {/* sunlight reaching the panels: brightness is the share of the disc that is up */}
        {lit && (
          <g className="ln-rays" opacity={0.25 + 0.75 * state.sunFrac}>
            {[-5, 0, 5].map((d) => (
              <line key={d} x1={SUN.x + SUN.r + 2} y1={Math.min(sunY, SUN.sky - 2) + d * 0.6} x2={panel.x - 3} y2={panel.y + d}
                    strokeDasharray="7 5" strokeDashoffset={dash} />
            ))}
          </g>
        )}

        {/* direct radio line: only while part of Earth is above the skyline */}
        {state.comm && (
          <line className="ln-link" x1={dish.x + 4} y1={dish.y - 2} x2={EARTH.x - EARTH.r - 2} y2={Math.min(earthY, EARTH.sky - 2)}
                strokeDasharray="2 4" strokeDashoffset={-dash} />
        )}

        {/* the Sun: the part below the skyline is drawn as an outline, the part above is filled */}
        <g clipPath="url(#ln-sun-sky)">
          <circle cx={SUN.x} cy={sunY} r={SUN.r + 5} className="ln-sun-glow" />
          <circle cx={SUN.x} cy={sunY} r={SUN.r} className="ln-sun" />
        </g>

        {/* Earth, the same way */}
        <g clipPath="url(#ln-earth-sky)">
          <circle cx={EARTH.x} cy={earthY} r={EARTH.r} className="ln-earth" />
        </g>

        {/* the local skyline in each direction, then the ground between */}
        <path className="ln-hill" d={`M0,${GROUND} L0,${SUN.sky} L${SUN.x + 30},${SUN.sky} Q${SUN.x + 48},${SUN.sky} ${SUN.x + 62},${GROUND} Z`} />
        <path className="ln-hill" d={`M${W},${GROUND} L${W},${EARTH.sky} L${EARTH.x - 30},${EARTH.sky} Q${EARTH.x - 48},${EARTH.sky} ${EARTH.x - 62},${GROUND} Z`} />
        <line className="ln-skyline" x1="0" y1={SUN.sky} x2={SUN.x + 30} y2={SUN.sky} />
        <line className="ln-skyline" x1={EARTH.x - 30} y1={EARTH.sky} x2={W} y2={EARTH.sky} />
        <rect className="ln-ground" x="0" y={GROUND} width={W} height={H - GROUND} />
        {/* outline of each whole disc, so the hidden part reads as hidden behind the hill */}
        <circle cx={SUN.x} cy={sunY} r={SUN.r} className="ln-disc-ghost" />
        <circle cx={EARTH.x} cy={earthY} r={EARTH.r} className="ln-disc-ghost" />

        {/* the lander (illustrative) */}
        <g className="ln-craft">
          {state.heatersOn && <ellipse className="ln-heat" cx={BODY.x} cy={BODY.y + 8} rx="20" ry="13" />}
          <path className="ln-leg" d={`M${BODY.x - 10},${BODY.y + 8} L${BODY.x - 19},${GROUND} M${BODY.x + 10},${BODY.y + 8} L${BODY.x + 19},${GROUND} M${BODY.x - 23},${GROUND} h8 M${BODY.x + 15},${GROUND} h8`} />
          <path className="ln-body" d={`M${BODY.x - 13},${BODY.y + 8} L${BODY.x - 9},${BODY.y - 10} L${BODY.x + 9},${BODY.y - 10} L${BODY.x + 13},${BODY.y + 8} Z`} />
          {/* panels, drawn the way the chosen orientation holds them */}
          {state.mode === "horizontal" && <rect className="ln-panel" x={BODY.x - 16} y={BODY.y - 15} width="32" height="3.5" style={{ fillOpacity: glow }} />}
          {state.mode === "vertical" && (
            <>
              <rect className="ln-panel" x={BODY.x - 21} y={BODY.y - 20} width="3.5" height="24" style={{ fillOpacity: glow }} />
              <rect className="ln-panel" x={BODY.x + 17.5} y={BODY.y - 20} width="3.5" height="24" style={{ fillOpacity: glow }} />
            </>
          )}
          {state.mode === "tracking" && (
            <>
              <line className="ln-mast" x1={BODY.x - 9} y1={BODY.y - 6} x2={BODY.x - 20} y2={BODY.y - 8} />
              <rect className="ln-panel" x={BODY.x - 24} y={BODY.y - 21} width="3.5" height="26" style={{ fillOpacity: glow }} transform={`rotate(-8 ${BODY.x - 22} ${BODY.y - 8})`} />
            </>
          )}
          {/* antenna */}
          <line className="ln-mast" x1={BODY.x + 7} y1={BODY.y - 10} x2={dish.x} y2={dish.y} />
          <path className={state.comm ? "ln-dish is-on" : "ln-dish"} d={`M${dish.x - 2},${dish.y - 5} Q${dish.x + 6},${dish.y} ${dish.x + 2},${dish.y + 5}`} />
          {/* which way the power is going */}
          {state.flow !== "balanced" && (
            <path className={state.flow === "charging" ? "ln-flow is-up" : "ln-flow is-down"}
                  d={state.flow === "charging"
                    ? `M${BODY.x},${BODY.y + 5} V${BODY.y - 5} M${BODY.x - 3.5},${BODY.y - 1.5} L${BODY.x},${BODY.y - 5.5} L${BODY.x + 3.5},${BODY.y - 1.5}`
                    : `M${BODY.x},${BODY.y - 6} V${BODY.y + 4} M${BODY.x - 3.5},${BODY.y + 0.5} L${BODY.x},${BODY.y + 4.5} L${BODY.x + 3.5},${BODY.y + 0.5}`} />
          )}
        </g>

        <text className="ln-lab" x={SUN.x} y={H - 8} textAnchor="middle">SUN {signed(state.sunClearDeg)}</text>
        <text className="ln-lab" x={EARTH.x} y={H - 8} textAnchor="middle">EARTH {signed(state.earthClearDeg)}</text>
        <text className="ln-lab ln-lab-dim" x={BODY.x} y={H - 8} textAnchor="middle">centre vs skyline</text>
      </svg>

      <dl className="ln-read">
        <div>
          <dt>Panels</dt>
          <dd className={lit ? "is-sun" : ""}>{fmtPower(state.generationW)}</dd>
          <dd className="ln-sub">Sun: {sunText}</dd>
        </div>
        <div>
          <dt>Using</dt>
          <dd>{fmtPower(state.loadW + state.heaterW)}</dd>
          <dd className="ln-sub">{state.heatersOn ? `incl. ${fmtPower(state.heaterW)} heaters` : "heaters off"}</dd>
        </div>
        <div>
          <dt>Battery</dt>
          <dd className={state.flow === "charging" ? "is-ok" : state.flow === "draining" ? "is-bad" : ""}>
            {state.netW > 0 ? "+" : state.netW < 0 ? "−" : ""}{fmtPower(Math.abs(state.netW))}
          </dd>
          <dd className="ln-sub">{state.flow}</dd>
        </div>
        <div>
          <dt>Earth link</dt>
          <dd className={state.comm ? "is-comm" : ""}>{state.comm ? "Direct" : "None"}</dd>
          <dd className="ln-sub">Earth: {earthText}</dd>
        </div>
      </dl>

      {path && path.points.length > 1 && <SkyPaths path={path} stayDays={stayDays} />}

      <p className="ln-note">
        Computed for the time on the clock from LOLA terrain and the Sun and Earth positions: a model result, not spacecraft telemetry.
        The lander drawing is illustrative{sun.held || earth.held ? "; a disc far from the skyline is drawn at a fixed distance, its true angle is the number shown" : ""}.
        SUNLOCK has no descent or trajectory data, so none is shown.
      </p>
    </div>
  );
}
