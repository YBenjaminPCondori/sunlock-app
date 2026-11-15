// The "lander at this moment" schematic: its state is a pure function of the reading at the
// timeline's clock time, and it agrees with the mission evaluator behind the verdict.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getLanderState, discOffset, flowPhase } from "../.build/lander.js";
import { simulateMission, arrayPowerPerM2 } from "../.build/power.js";
import { skyAt, readSite } from "../.build/selene.js";

const spec = { loadW: 100, arrayM2: 4, batteryWh: 10000, dod: 0.8, heaterW: 60 };
const reading = (o = {}) => ({ sunFrac: 1, sunElev: 1, sunAz: 120, sunHorizon: 0.2, earthElev: 3, earthHorizon: 1, comm: true, ...o });

const sites = JSON.parse(fs.readFileSync(new URL("../public/terrain/sites.json", import.meta.url), "utf8")).sites;
const dgr2 = sites.find((s) => s.id === "de-gerlache-rim-2");
const STEP_MS = 30 * 60000;
const T0 = Date.UTC(2027, 1, 4);
const at = (ms) => getLanderState(readSite(dgr2, skyAt(new Date(ms))), spec, "tracking");

test("full Sun, Sun-facing panels: generation is the power model's, heaters off, battery charging", () => {
  const s = getLanderState(reading(), spec, "tracking");
  assert.equal(s.generationW, arrayPowerPerM2(1, 1, "tracking") * 4);
  assert.equal(s.heatersOn, false);
  assert.equal(s.netW, s.generationW - 100);
  assert.equal(s.flow, "charging");
  assert.ok(Math.abs(s.generationShare - 1) < 1e-12);
});

test("dark: no generation, heaters on, battery drains by load plus heaters", () => {
  const s = getLanderState(reading({ sunFrac: 0, sunElev: -1 }), spec, "tracking");
  assert.equal(s.generationW, 0);
  assert.equal(s.heatersOn, true);
  assert.equal(s.netW, -160);
  assert.equal(s.flow, "draining");
});

test("heaters follow the evaluator's rule: on below half a disc, off from half a disc", () => {
  assert.equal(getLanderState(reading({ sunFrac: 0.49 }), spec, "tracking").heatersOn, true);
  assert.equal(getLanderState(reading({ sunFrac: 0.5 }), spec, "tracking").heatersOn, false);
  assert.equal(getLanderState(reading({ sunFrac: 0 }), { ...spec, heaterW: 0 }, "tracking").heatersOn, false);
});

test("net power equals what simulateMission applies to the battery over one step", () => {
  for (const r of [reading(), reading({ sunFrac: 0.3 }), reading({ sunFrac: 0, sunElev: -2 })]) {
    for (const mode of ["tracking", "vertical", "horizontal"]) {
      const s = getLanderState(r, spec, mode);
      const sample = { t: 0, lit: r.sunFrac > 0, sunElev: r.sunElev, sunAz: r.sunAz, sunFrac: r.sunFrac, comm: r.comm };
      const run = simulateMission([sample], 0, 1, 30, mode, spec, { initialSocPct: 50 });
      const usable = spec.batteryWh * spec.dod;
      const expected = Math.min(100, 50 + (100 * s.netW * 0.5) / usable);
      assert.ok(Math.abs(run.soc[0] - expected) < 1e-3, `${mode} frac ${r.sunFrac}: ${run.soc[0]} vs ${expected}`);
    }
  }
});

test("clearance and disc shares come from the skyline, and comm is passed through unchanged", () => {
  const s = getLanderState(reading({ sunElev: 0.2, sunHorizon: 0.2, sunFrac: 0.5, earthElev: 1, earthHorizon: 1, comm: true }), spec, "tracking");
  assert.equal(s.sunClearDeg, 0);
  assert.ok(Math.abs(s.earthFrac - 0.5) < 1e-12, "Earth's centre on the skyline shows half its disc");
  assert.equal(s.comm, true);
  const hidden = getLanderState(reading({ earthElev: -1, earthHorizon: 1, comm: false }), spec, "tracking");
  assert.equal(hidden.earthFrac, 0);
  assert.equal(hidden.comm, false);
});

test("missing or non-numeric readings give no state rather than a guessed one", () => {
  assert.equal(getLanderState(null, spec, "tracking"), null);
  assert.equal(getLanderState(undefined, spec, "tracking"), null);
  assert.equal(getLanderState(reading({ sunElev: NaN }), spec, "tracking"), null);
  assert.equal(getLanderState(reading({ earthHorizon: undefined }), spec, "tracking"), null);
});

test("seeking: the state at a time does not depend on how the clock got there", () => {
  const target = T0 + 400 * STEP_MS;
  const direct = at(target);
  let forward = null;
  for (let t = T0; t <= target; t += STEP_MS) forward = at(t); // played forwards
  let backward = null;
  for (let t = T0 + 900 * STEP_MS; t >= target; t -= 7 * STEP_MS) backward = at(t); // scrubbed back in jumps
  backward = at(target);
  assert.deepEqual(forward, direct);
  assert.deepEqual(backward, direct);
});

test("pause and resume: the same clock time always gives the same state; restart and end are ordinary times", () => {
  const t = T0 + 123 * STEP_MS;
  assert.deepEqual(at(t), at(t));
  const start = Date.UTC(2027, 0, 1), end = Date.UTC(2028, 0, 1);
  assert.ok(at(start) && at(end), "first and last moments of the modelled year have a state");
  assert.deepEqual(at(start), at(start));
});

test("playback speed: any step size lands on the same states at the times it visits", () => {
  for (const stride of [12, 48, 144]) { // 6 h, 1 day, 3 days per tick at 30-minute steps
    for (let i = 0; i <= 288; i += stride) assert.deepEqual(at(T0 + i * STEP_MS), at(T0 + i * STEP_MS));
  }
  assert.deepEqual(at(T0 + 144 * STEP_MS), at(T0 + 3 * 48 * STEP_MS));
});

test("irregular timestamps (off the 30-minute grid) are evaluated at that exact time, not snapped", () => {
  const a = at(T0 + 10 * STEP_MS), mid = at(T0 + 10 * STEP_MS + 7 * 60000 + 13000), b = at(T0 + 11 * STEP_MS);
  assert.ok(mid);
  const lo = Math.min(a.sunClearDeg, b.sunClearDeg) - 1e-6, hi = Math.max(a.sunClearDeg, b.sunClearDeg) + 1e-6;
  assert.ok(mid.sunClearDeg >= lo && mid.sunClearDeg <= hi, "the Sun's clearance lies between its neighbours");
});

test("drawing position: true near the skyline, held and flagged far from it", () => {
  assert.deepEqual(discOffset(0.4), { radii: 0.4, held: false });
  assert.deepEqual(discOffset(-1), { radii: -1, held: false });
  assert.deepEqual(discOffset(9), { radii: 2.4, held: true });
  assert.deepEqual(discOffset(-9), { radii: -1.6, held: true });
  assert.equal(discOffset(NaN).held, true);
});

test("moving dashes are a function of the clock: they stop when it stops and reverse when it reverses", () => {
  const p = 6 * 3600000;
  assert.equal(flowPhase(0), 0);
  assert.equal(flowPhase(p / 2), 0.5);
  assert.equal(flowPhase(p), 0);
  assert.equal(flowPhase(T0), flowPhase(T0));
  assert.ok(flowPhase(T0 + STEP_MS) > flowPhase(T0) || flowPhase(T0 + STEP_MS) < 0.1);
  assert.ok(flowPhase(-1) >= 0 && flowPhase(-1) < 1);
  assert.equal(flowPhase(NaN), 0);
});

// ---- the Sun's and Earth's paths against the skyline over the stay
import { getSkyPath, pathRuns } from "../.build/lander.js";

const stayReadings = (startMs, steps, stride = 1) => {
  const out = [];
  for (let i = 0; i < steps; i += stride) out.push(readSite(dgr2, skyAt(new Date(startMs + i * STEP_MS))));
  return out;
};

test("sky path: one point per reading, in time order, each equal to the model's own reading", () => {
  const rs = stayReadings(T0, 14 * 48);
  const path = getSkyPath(rs, 30);
  assert.equal(path.points.length, rs.length);
  assert.equal(path.skipped, 0);
  assert.equal(path.spanH, (rs.length - 1) * 0.5);
  for (const i of [0, 1, 100, 671]) {
    const p = path.points[i], r = rs[i];
    assert.equal(p.h, i * 0.5);
    assert.equal(p.sunClearDeg, r.sunElev - r.sunHorizon);
    assert.equal(p.earthClearDeg, r.earthElev - r.earthHorizon);
    assert.equal(p.lit, r.sunFrac > 0);
    assert.equal(p.comm, r.comm);
  }
  assert.ok(path.maxAbsDeg > 0 && path.points.every((p) => Math.abs(p.sunClearDeg) <= path.maxAbsDeg + 1e-12));
});

test("sky path: its first point is the lander state at the clock time", () => {
  const rs = stayReadings(T0, 48);
  const first = getSkyPath(rs, 30).points[0], now = getLanderState(rs[0], spec, "tracking");
  assert.equal(first.sunClearDeg, now.sunClearDeg);
  assert.equal(first.earthClearDeg, now.earthClearDeg);
  assert.equal(first.lit, now.sunFrac > 0);
  assert.equal(first.comm, now.comm);
});

test("sky path: lit and dark stretches match the stay the verdict is computed on", () => {
  // the 4 Feb landing at de Gerlache Rim 2 has a long dark stretch (the README's failing case)
  const path = getSkyPath(stayReadings(T0, 14 * 48), 30);
  const dark = pathRuns(path.points, (p) => p.lit, 1).filter((r) => !r.on);
  const longestDarkH = Math.max(...dark.map((r) => r.points[r.points.length - 1].h - r.points[0].h));
  assert.ok(longestDarkH > 150 && longestDarkH < 260, `longest dark ${longestDarkH} h`);
});

test("sky path: missing readings are skipped and counted, never filled in", () => {
  const rs = stayReadings(T0, 10);
  rs[3] = null; rs[4] = { ...rs[4], sunElev: NaN };
  const path = getSkyPath(rs, 30);
  assert.equal(path.points.length, 8);
  assert.equal(path.skipped, 2);
  assert.deepEqual(path.points.map((p) => p.h), [0, 0.5, 1, 2.5, 3, 3.5, 4, 4.5]);
  const runs = pathRuns(path.points, () => true, 0.75);
  assert.equal(runs.length, 2, "the gap is not bridged by a line");
  assert.deepEqual(getSkyPath([], 30), { points: [], spanH: 0, maxAbsDeg: 0, skipped: 0 });
});

test("sky path: deterministic, and the same whether time was played, scrubbed or jumped to", () => {
  const a = getSkyPath(stayReadings(T0 + 96 * STEP_MS, 96), 30);
  getSkyPath(stayReadings(T0, 96), 30); getSkyPath(stayReadings(T0 + 500 * STEP_MS, 96), 30);
  const b = getSkyPath(stayReadings(T0 + 96 * STEP_MS, 96), 30);
  assert.deepEqual(a, b);
});

test("path runs: neighbouring runs share their boundary point so the drawn line has no holes", () => {
  const pts = [0, 1, 2, 3, 4, 5].map((h) => ({ h, v: h >= 2 && h <= 3 }));
  const runs = pathRuns(pts, (p) => p.v, 1.5);
  assert.deepEqual(runs.map((r) => [r.on, r.points.map((p) => p.h)]), [[false, [0, 1, 2]], [true, [2, 3, 4]], [false, [4, 5]]]);
});
// ---- the label beside the verdict: how the plan holds up, and how much of the stay Earth is in view
import { planRobustness, earthSharePct, stressTest } from "../.build/power.js";
import { buildSkies, siteSeries } from "../.build/analysis.js";

const ok = { survives: true, failure: null, lostAt: null, earthFailAt: null };
const bad = (lostAt) => ({ survives: false, failure: "battery", lostAt, earthFailAt: null });
const cases = (...rs) => rs.map((result, i) => ({ id: i === 0 ? "nominal" : `c${i}`, label: i === 0 ? "As planned" : `Case ${i}`, result }));

test("robustness: robust only when every case was run and passed", () => {
  assert.deepEqual(planRobustness(cases(ok, ok, ok)), { level: "robust", passing: 3, tested: 3, total: 3, firstFailure: null });
});

test("robustness: one failing case makes the plan marginal and names the earliest failure", () => {
  const r = planRobustness(cases(ok, bad(500), ok, bad(200)));
  assert.equal(r.level, "marginal");
  assert.equal(r.passing, 2);
  assert.equal(r.firstFailure, "Case 3");
});

test("robustness: a case that could not be run is never counted as a pass", () => {
  const r = planRobustness(cases(ok, ok, null));
  assert.equal(r.level, "untested");
  assert.equal(r.tested, 2);
  assert.equal(r.total, 3);
  assert.equal(planRobustness(cases(ok, bad(1), null)).level, "marginal", "a failure outranks an unknown");
});

test("robustness: no label when the plan fails as planned or there is nothing to judge by", () => {
  assert.equal(planRobustness(cases(bad(10), ok, ok)), null);
  assert.equal(planRobustness(cases(ok)), null);
  assert.equal(planRobustness([]), null);
  assert.equal(planRobustness(cases(null, ok)), null);
});

test("Earth share: counts the steps of the stay with Earth in view, and refuses stays past the data", () => {
  const s = [true, true, false, false, true, false, true, true].map((comm, i) => ({ t: i, sunElev: 0, lit: true, comm }));
  assert.equal(earthSharePct(s, 0, 8), 62.5);
  assert.equal(earthSharePct(s, 2, 4), 25);
  assert.equal(earthSharePct(s, 4, 8), null);
  assert.equal(earthSharePct(s, 0, 0), null);
  assert.equal(earthSharePct([{ t: 0, sunElev: 0, lit: true }], 0, 1), null, "no Earth data is not 0%");
});

test("README example, 16 Feb 11:30 at de Gerlache Rim 2: survives, but Earth is in view about a third of the stay", () => {
  const start = Date.UTC(2027, 1, 16, 11, 30), steps = 14 * 48;
  const ser = siteSeries(dgr2, buildSkies(new Date(start), 18, 30));
  const plain = { loadW: 100, arrayM2: 4, batteryWh: 10000, dod: 0.8 };
  const share = earthSharePct(ser, 0, steps);
  assert.ok(share > 28 && share < 38, `Earth share ${share}`);
  const st = stressTest(ser, 0, steps, 30, "tracking", plain);
  const r = planRobustness(st);
  assert.ok(r, "the plan survives as planned, so it gets a label");
  assert.equal(r.total, st.length);
  assert.equal(r.level, st.every((c) => c.result && c.result.survives) ? "robust" : st.some((c) => c.result && !c.result.survives) ? "marginal" : "untested");
});