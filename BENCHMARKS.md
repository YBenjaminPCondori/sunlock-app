# Benchmarks and validation

Everything here is produced by committed scripts against the modules the app ships.
**Re-run date: 15 Nov 2026, after the azimuth fix described in §1.**

```bash
cd web
npm run validate   # map-wide comparison against NASA's LOLA visibility product
npm run verify     # JPL Horizons: geometry + frame
npm run bench      # disc, position, azimuth sensitivity
npm run bench:ray  # ray-sampling interval study
npm run bench:conv # convergence + disc-criterion study
```

---

## 1. Pre-registered validation against NASA products

Four hypotheses were fixed and committed (`research/PREREGISTRATION.md`) **before** any
comparison ran. All four pass. The pre-registration commit is `83b4287` (15 Nov 2026, 00:55 GMT)
in the project's original repository, `github.com/shahaman098/sunlock`; this repository's
history starts later, so the ordering can only be checked there.

The numbers below are the ones in the committed result files
(`research/validation/result-converged.json`, `result-wac.json`) and in the app
(`web/public/terrain/validation.json`).

| # | Reference | Metric | Result | Threshold | |
|---|---|---|---|---|---|
| **H1** | LOLA `AVGVISIB_85S_060M` (18.6 yr, 60 m) | Pearson r | **0.9897** | ≥ 0.90 | ✅ |
| | | RMSE | **1.88 pp** | — | |
| | | bias | **+0.01 pp** | ≤ 5 pp | ✅ |
| **H2** | LOLA `LPSR_85S_060M` permanent shadow | IoU | **0.926** | ≥ 0.80 | ✅ |
| **H3** | LROC `WAC_POLE_ILL_TWI_SOUTH` (image-based) | Pearson r | **0.980** | ≥ 0.85 | ✅ |
| | | RMSE / bias | 3.09 pp / +1.59 pp | — | |
| **H4** | LOLA Earth-visibility map | Pearson r | **0.9894** | ≥ 0.90 | ✅ |
| | | RMSE / bias | 2.98 pp / +0.19 pp | — | |

Sample: fixed seed, 85–90°S, 2,000 points drawn, hourly over 18.6 years (the pre-registered
primary run). H1 uses the 1,782 points with valid reference data, H4 1,471, H3 the 296 inside
the LROC map's 88–90°S coverage. H2 confusion matrix over all 2,000: TP 212, FP 6, FN 11,
TN 1,771.

An earlier 500-point, 3-hourly rerun gave r = 0.9948; it was replaced by the pre-registered
2,000-point hourly run above and is not the reported result.

**At landing sites the error is larger than map-wide.** At 105 published Artemis III landing
locations: r = 0.915, RMSE **6.8 pp**, bias −1.1 pp, 80 of 105 within 5 pp. Landing sites sit
on crests and rims, where sunlight changes over tens of metres, so a survival verdict at a
named site carries more uncertainty than the map-wide figure suggests.

H3 is the strongest external test: the LROC map is derived from **3,807 photographs** taken
over one lunar year, so it checks our predicted shadows against *observed* shadows (296
points inside its 88–90°S coverage, 1-hourly integration over the observation window).

### What this validation caught

**A 180° azimuth error.** Our horizon was looked up half a turn from the Sun, so every site was
tested against terrain on the opposite side. The pole hid it (near-isotropic terrain) and
summits looked plausible; a permanently shadowed crater exposed it:

| Location | Before fix | After fix | NASA reference |
|---|---|---|---|
| Cabeus floor | 30.5% | **0.0%** | **0.0%** |
| de Gerlache rim | 4.0% | **14.5%** | 14.4% |
| Connecting Ridge | 54.8% | 56.7% | 51.6% |
| South pole | 28.0% | 29.6% | 27.0% |

A rotation sweep over 60 points: r = −0.18 at 0°, +0.44 at 90°, **+0.98 at 180°**. The fix is in
`scripts/build-terrain.mjs` and `web/src/lib/terrain.ts`.

**Every illumination number changed as a result** — the Shackleton peak went from 86% to 73%
over the 180-day window.

## 2. Against JPL Horizons (unchanged by the fix)

Twelve epochs, Horizons API.

| Quantity | Max difference |
|---|---|
| Sun direction (astrometric RA/Dec from the Moon) | 21.0″ |
| Earth direction | 22.7″ |
| Sub-solar longitude (frame) | **0.0032°** |
| Sub-solar latitude | 0.0021° |
| Sub-observer longitude | 0.0079° |

The frame test is the important one: an earlier implementation using only the polynomial
prime meridian was 2.24° off and drifting 0.6°/yr, while its latitude matched to 0.001°.

---

## 3. Sensitivity (recomputed after the fix)

| Effect | Magnitude |
|---|---|
| Finite solar disc vs centre-of-disc | ≤ 0.26% |
| Landing point moved ±250 m (horizon fixed) | σ ≤ 0.08% |
| Horizon azimuth sampled at 4° instead of 1° | ≤ 0.24% |
| Ray interval 80 → 320 m (nearest-neighbour) | 60.6% → 81.8% |

The first three are negligible. The fourth is real and is *sampling* sensitivity, not a bug:
coarser ray intervals step over ridges and inflate sunlight. The named sites use the converged
profile (bilinear, 40 m, 150 km), which scores r = 0.990 against NASA. The older 160 m
nearest-neighbour profile (r = 0.991 on a 300-point, 3-hourly run) is kept only for comparison.

### Convergence with bilinear sampling

| Step | Disc centre | Any part of disc |
|---|---|---|
| 80 m | 58.2% | 63.8% |
| 40 m | 58.2% | 62.8% |
| 20 m | 57.7% | 62.1% |
| 10 m | 55.8% | 61.8% |

Stable to a couple of points — much better behaved than the pre-fix measurements, which
mixed a rotated horizon into the comparison.

---

## 4. What is *not* validated

- **Mission survival over a full 14-day stay.** The photograph-based timing check
  (`research/validation/result-wac-movie.json`) covers 7-day stays in one month; when the model
  says "survives", the photographed light agrees 82.7% of the time.
- **Accuracy at a specific landing point.** See the landing-site figures in §1: 6.8 pp RMSE at
  published sites, against 1.88 pp map-wide.
- **Re-running §1 needs NASA's raw LOLA elevation model**, which is not stored in this
  repository; the result files are committed, the input is pinned in `data/sources.json`.
- No thermal, dust or power-system model. Array output is first-order.
- Physical libration enters only through the IAU series; no SPICE cross-check.
