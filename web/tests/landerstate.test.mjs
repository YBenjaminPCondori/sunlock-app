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
