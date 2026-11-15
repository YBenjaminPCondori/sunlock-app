# Validating a browser-based lunar polar illumination model against NASA's LOLA visibility map

**SUNLOCK technical note** · 15 November 2026 · code: `github.com/shahaman098/sunlock-app`
(earlier history, including the pre-registration commit `83b4287`: `github.com/shahaman098/sunlock`)

---

## Abstract

We test a browser-based lunar south-pole illumination model against NASA's published
average-visibility product (`AVGVISIB_85S_060M_201608`, PGDA product 69) — 18.6 years of
hourly illumination computed by the LOLA team from their own terrain, with an independent
pipeline. At 1,782 random sample points between 85°S and 90°S the model reproduces the
reference with Pearson **r = 0.990**, RMSE **1.88 percentage points** and mean bias **+0.01 pp**.
At 105 published landing locations, which sit on crests and rims, the error is larger:
RMSE **6.8 pp**.

The comparison found a defect that no internal check had caught: the local horizon was being
looked up **180° away** from the Sun's azimuth, so every site was tested against terrain on the
opposite side. Correcting it moved a permanently shadowed crater floor from 30.5% to 0.0%
(reference: 0.0%) and raised the correlation across 60 diagnostics points from −0.18 to +0.98.
Every illumination number produced by the model before this fix was wrong in a
site-dependent way; the corrected values are reported here.

The astronomy is verified separately against JPL Horizons: sub-solar longitude agrees to
**0.0032°**, sun direction to 21″.

---

## 1. Introduction

Tools that predict polar illumination are only as good as their terrain handling. Published
values for the best south-pole sites cluster at 85–88% (Mazarico et al. 2011; Gläser et al.
2017), but those figures depend on terrain resolution, ray-sampling interval, observer height,
temporal baseline and whether the Sun's disc centre or any part of its disc must clear the
horizon.

Internal consistency does not establish correctness. This note reports an external test
against a reference product we did not produce, and the defect that test exposed.

## 2. Data

| Product | Source | Resolution | Use |
|---|---|---|---|
| `AVGVISIB_85S_060M_201608` | PGDA product 69 (LOLA team) | 60 m/px, 85–90°S | reference, 18.6 yr hourly |
| `LPSR_85S_060M_201608` | PGDA product 69 | 60 m/px | permanent shadow (H2) |
| `AVGVISIB_85S_060M_201608_EARTH` | PGDA product 69 | 60 m/px | Earth visibility (H4) |
| `WAC_POLE_ILL_TWI_SOUTH` | LROC | 100 m/px, 88–90°S | photograph-based illumination (H3) |
| `LDEM_80S_80M` | PDS Geosciences | 80 m/px, 80–90°S | our terrain |
| `LDEM_80S_40M` | PDS Geosciences | 40 m/px | sampling study |
| `LDEM_875S_20M` | PDS Geosciences | 20 m/px, 87.5–90°S | sampling study |

The reference defines its metric explicitly: *"the percentage of timesteps where each pixel was
sunlit (by any fraction of the solar disc)"*, scaling `DN × 4×10⁻⁵`, over 18.6 years.

## 3. Method

For each sample point we ray-march a 360-azimuth horizon on the 80 m elevation model to a
150 km reach, subtracting the lunar curvature drop `d²/2R`. Sun and Earth directions come from
Astronomy Engine, rotated into the IAU 2015 lunar frame. A point is illuminated when any part
of the 0.266° solar disc clears the horizon in the Sun's azimuth.

Sampling: fixed seed, 2,000 points uniform in area over 85–90°S plus the nine named regions;
points falling outside valid data are dropped and counted.

## 4. Results

### 4.1 Pre-registered hypotheses — all four pass

| # | Reference product | Metric | Result | Threshold |
|---|---|---|---|---|
| H1 | LOLA average solar visibility (18.6 yr) | Pearson r | **0.990** | ≥ 0.90 |
| | | RMSE / bias | 1.88 pp / +0.01 pp | bias ≤ 5 pp |
| H2 | LOLA permanent shadow | IoU | **0.926** | ≥ 0.80 |
| H3 | **LROC WAC image-based** illumination | Pearson r | **0.980** | ≥ 0.85 |
| H4 | LOLA Earth visibility | Pearson r | **0.989** | ≥ 0.90 |

These are the pre-registered primary run: 2,000 points drawn, hourly over 18.6 years, of which
1,782 have valid reference data for H1 and 1,471 for H4 (`validation/result-converged.json`).
H2 confusion matrix over all 2,000: TP 212, FP 6, FN 11, TN 1,771. H3 uses the 296 points
inside the LROC map (`validation/result-wac.json`). An earlier 500-point, 3-hourly rerun gave
r = 0.995 for H1; it is superseded by the run reported here.

H3 is the independent-modality test: the LROC map comes from 3,807 photographs, not altimetry.

Bias by band: +0.15 pp (0–20% illumination, 737 points), −0.08 pp (20–50%, 1,042 points).
Only 3 points fall in 50–80% and none above, so the random sample says little about the
sunniest ground. Agreement is not carried by one end of the range it does cover.

The shipped convention — nearest-neighbour sampling at a 160 m interval — scores r = 0.991,
RMSE 1.79 pp on 270 points. The pre-registered hypothesis passes under both.

**Landing sites.** At 105 published Artemis III landing locations the same comparison gives
r = 0.915, RMSE 6.8 pp, bias −1.1 pp, with 80 of 105 within 5 pp
(`web/public/terrain/validation.json`). These are the sunniest crests, exactly where the
random sample is thin, and where sunlight changes over tens of metres.

**Deviation from the pre-registration.** The converged convention uses a 150 km horizon reach,
decided after H1 was first run; the pre-registered reach was 64 km, which the shipped
convention keeps.

### 4.1b Shadow timing against timestamped photographs (exploratory)

This comparison was **not pre-registered**; its choices were fixed in the script header before
any comparison with our model was run, and it is reported in full, including what does not agree.

Reference: LROC `WAC_POLE_MOVIE_SOUTH`, one map-projected photograph of the pole per orbit.
All 261 frames of December 2009 were sampled on a fixed 1 km grid within 24 km of the pole
(1,793 points; 467,973 samples). A sample is "bright" above the Otsu threshold of the
photographs alone (I/F 0.0073). Our prediction is lit when at least half the solar disc clears
the converged LOLA skyline. Registration was confirmed without our model (photo bright share
vs. NASA's LOLA sunlight map: r = 0.872 in the stated orientation, at most 0.04 in the others).

| Test | Result | Baseline / caveat |
|---|---|---|
| Bright/dark state, per sample | 96.6% agree | "always dark" scores 81.2%; bright-class IoU 0.842 |
| Photographed transitions with a match of ours within 24 h | 1,519 of 1,802 | 283 (16%) unmatched |
| Timing error of matched transitions | median 0.5 h; 70% within 2 h | frames are 1.9 h apart; 90th percentile 11.7 h |
| 7-day mission survival, photographed light vs. ours | 95.9% agree (50,204 missions) | "always fails" scores 82% |
| When we say "survives", photographs agree | 82.7% | 1,839 of 10,640 predicted survivals fail on the photographed light |

With the app's "any part of the disc" rule, state agreement is 95.4% and the median timing error
3.3 h (our sunrise early, our sunset late): a photo pixel reads bright only with substantial
direct light. Threshold sensitivity: 97.5% at half the threshold, 92.8% at double.

Limits: one month in southern summer; a 100 m pixel on a slope facing away from a grazing Sun
reads dark while the Sun is above the skyline; 14-day stays could not be tested because the
month has no 14-day run of frames without a gap over 6 hours; survival here tests the shadow
timing fed to the power model, not the power model. Data: `research/validation/result-wac-movie.json`.

### 4.2 The defect the test found

An earlier build looked up the horizon at the azimuth **180° from the Sun**. The error is
invisible at the pole (where terrain is near-isotropic) and survives spot checks on summits,
but fails decisively in a crater:

| Location | Before | After | Reference |
|---|---|---|---|
| Cabeus floor (84.9°S, 35.5°W) | 30.5% | **0.0%** | **0.0%** |
| de Gerlache rim (88.6°S, 278.7°E) | 4.0% | **14.5%** | 14.4% |
| Connecting Ridge (89.3°S, 216.3°E) | 54.8% | 56.7% | 51.6% |
| South pole (89.999°S, 0°) | 28.0% | 29.6% | 27.0% |

A rotation sweep over 60 points made the diagnosis unambiguous:

| Horizon lookup rotation | r vs reference |
|---|---|
| 0° | −0.181 |
| 90° | 0.438 |
| 135° | 0.768 |
| **180°** | **0.980** |

The cause is an axis convention: this PDS polar-stereographic product stores lines and samples
opposite to the standard stereographic x/y convention, so the image-space direction must be
negated. The fix is in `scripts/build-terrain.mjs` and `web/src/lib/terrain.ts`.

### 4.3 Consequence for every published number

With the horizon corrected, the peak near Shackleton yields **73%** illumination over
1 Jan – 30 Jun 2027 (previously 86%), with a longest continuous darkness of **11.5 days**
(previously 3.5). The 73% is a region centre, not a searched optimum; published values of
85–88% refer to clusters 20–40 m wide found by search (Gläser et al. 2017).

## 5. Astronomy verification

Against JPL Horizons at 12 epochs:

| Quantity | Max difference |
|---|---|
| Sun direction | 21.0″ |
| Earth direction | 22.7″ |
| Sub-solar longitude | 0.0032° |
| Sub-solar latitude | 0.0021° |
| Sub-observer longitude | 0.0079° |

The frame test is essential: an earlier implementation using only the polynomial prime
meridian was 2.24° off and drifting 0.6°/yr while its latitude matched to 0.001°.

## 6. Sensitivity

| Effect | Magnitude |
|---|---|
| Finite solar disc vs centre-of-disc | ≤ 0.26% |
| Landing point moved ±250 m (horizon fixed) | σ ≤ 0.08% |
| Horizon azimuth sampled every 4° instead of 1° | ≤ 0.24% |
| Ray interval 80 → 320 m | 60.6% → 81.8% |

Ray-sampling interval is the largest remaining sensitivity. Coarse intervals step over ridges
and inflate sunlight; the shipped 160 m interval is the one that scores r = 0.991 against
NASA, which is its empirical justification.

## 7. Limitations

- Accuracy at a specific landing point is several times worse than map-wide (6.8 pp against
  1.88 pp RMSE), so a survival verdict at a named site is an early-planning estimate.
- Mission survival is checked against photographs only for 7-day stays in one month (§4.1b);
  14-day stays are untested.
- The 180° azimuth defect was found and fixed using the same NASA map that H1 is scored
  against. The thresholds were fixed beforehand, but H1 is not independent of that fix; H3
  (photographs) is.
- Re-running §4.1 needs NASA's raw LOLA elevation model, which is not stored in the repository.
- One hemisphere-season (180 days) in the product; the reference spans 18.6 years.
- No thermal, dust or power-system modelling. Array output is first-order.
- Physical libration enters only through the IAU series.

## 8. Conclusions

1. A browser-resident model, using public terrain and ephemerides, reproduces NASA's 18.6-year
   polar visibility map to r = 0.990 and 1.9 percentage points RMSE map-wide, and to 6.8
   points at published landing sites.
2. External validation found a 180° azimuth defect that internal checks and spot checks had
   missed. Reference products are worth more than self-consistency.
3. Illumination at a single point remains sensitive to ray interval and site choice; the
   number is only meaningful with its convention stated, and the map-wide test is the honest
   way to choose that convention.

## References

See `research/LITERATURE.md` for the annotated source list with quoted methodology.

## Reproduction

```bash
cd web
npm run validate   # map-wide comparison (this note's §4.1)
npm run verify     # JPL Horizons
npm run bench      # §6 first three rows
npm run bench:ray  # §6 ray interval
npm run bench:conv # convergence
```
