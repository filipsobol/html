# PR #5 attribute ablation

## Recommendation

**For a general-purpose default, keep A (`a9d7fe5`) and consider dropping B (`969b51c`) if predictable repeated-query latency is the priority. Do not call B’s benefits minor:** it saves roughly 10.7 MiB (34–35%) after broad queries and materially improves small cold query workloads. Keeping B is defensible for memory-constrained, parse-once/query-once usage. No code or PR changes were made by this investigation.

Without B, A still improves cold queries and fresh attribute reads. It saves only about 1.3–1.5 MiB (4–5%) after broad queries and has its own warm-read/query costs, especially on Bun. Dropping both is appropriate only for a profile dominated by repeated cached attribute reads/queries; these measurements do not support dropping A as a general default.

## Isolated variants

- **F:** actual PR #5 `590bb7abe2174fc9a320fbde56a8cc06abe18044`, A + B. Its Git tree exactly equals previous published `cf0d182`.
- **P:** F with the complete B commit reversed (including its tests): cached attribute pairs for selectors, no mutable attribute records unless requested/edited.
- **O:** P with the complete A commit reversed: selectors and getters materialize full attribute records. Class matching and bounded parser scratch remain enabled in every variant; the removed shared final buffer remains disabled.

This is a conditional ablation, not an invalid independent 2×2: B uses A’s helper. All variants came from archived PR #5 source, never pending root source. Changed source/test file sets and final hashes were checked.

## Timing

Node 26.13.0 / Bun 1.4.4; Ryzen 9800X3D, WSL2. Same twelve cached pages (4,843,812 characters), same unminified `bun build --target=node` mutable bundles. Three fresh launches per runtime/mode; cyclic module load order, alternating round order, 600 ms warmup per variant, nine ≥160 ms rounds. All serial; no outliers removed. Values below are medians of three process medians. **B reduction = 1 − F/P; A reduction = 1 − P/O**, using ratios of medians; negative means slower. Small differences are not reliable gains.

| Workload | Node O / P / F, ms | Bun O / P / F, ms | B reduction Node / Bun | A reduction Node / Bun |
|---|---:|---:|---:|---:|
| Parse only | 9.55 / 9.46 / 9.42 | 8.22 / 8.22 / 8.12 | +0.4% / +1.3% | +1.0% / -0.0% |
| Parse + one `all(a[href])` | 13.47 / 12.46 / 11.17 | 13.56 / 12.30 / 10.37 | +10.4% / +15.7% | +7.5% / +9.3% |
| Parse + one `all(.active)` | 23.36 / 17.33 / 11.33 | 25.26 / 20.84 / 12.98 | +34.6% / +37.7% | +25.8% / +17.5% |
| Parse + seven separate queries | 28.98 / 22.56 / 19.46 | 31.76 / 26.53 / 19.24 | +13.7% / +27.5% | +22.1% / +16.5% |
| Parse + one combined seven-selector query | 26.17 / 20.50 / 15.72 | 28.62 / 22.71 / 15.55 | +23.4% / +31.5% | +21.6% / +20.7% |
| Warm eight class queries | 8.79 / 8.78 / 21.61 | 7.89 / 10.05 / 21.33 | -146.2% / -112.2% | +0.2% / -27.5% |
| Warm eleven attribute queries | 8.47 / 9.46 / 22.87 | 7.94 / 10.30 / 23.14 | -141.7% / -124.7% | -11.7% / -29.7% |
| Fresh five-key getAttr/hasAttr (parse excluded) | 16.45 / 11.76 / 12.10 | 18.29 / 15.76 / 15.18 | -2.9% / +3.7% | +28.5% / +13.8% |
| Warm five-key getAttr/hasAttr | 4.35 / 4.64 / 4.70 | 2.64 / 4.41 / 4.19 | -1.3% / +4.8% | -6.5% / -66.7% |
| Pairs prewarmed, warm eleven queries | 10.37 / 9.60 / 10.59 | 8.45 / 11.00 / 10.52 | -10.3% / +4.4% | +7.5% / -30.2% |

Cold single/standard/combined queries include parsing and start with fresh attribute state. Fresh getter timings exclude parsing and element enumeration. Warm rows reuse already queried/read documents. The combined selector list returns a union, unlike seven separate arrays; compare variants within its row, not its result count against separate queries.

### Single-variant fresh-process confirmation

Node showed module-position/JIT sensitivity, so the two key workloads were rerun with exactly one imported variant per process, six matched triples per runtime, all six variant-order permutations. Below percentages are **medians of six paired reductions**, not ratios of the displayed time medians. Ranges are descriptive, not confidence intervals. Every cold-seven pair favors B and A; every warm-eleven pair favors removing B and favors O over P.

| Workload / runtime | O / P / F median ms | B paired reduction (range) | A paired reduction (range) |
|---|---:|---:|---:|
| cold-standard7 / Node | 28.66 / 24.55 / 21.09 | +13.8% (+10.1 to +20.3) | +13.3% (+8.8 to +17.4) |
| cold-standard7 / Bun | 31.25 / 26.86 / 19.00 | +28.8% (+27.4 to +33.5) | +13.5% (+8.1 to +19.9) |
| warm-attrs11 / Node | 10.18 / 11.69 / 25.56 | -115.8% (-127.9 to -110.9) | -13.4% (-21.9 to -7.4) |
| warm-attrs11 / Bun | 7.80 / 9.74 / 22.93 | -135.4% (-146.0 to -126.2) | -24.9% (-29.5 to -22.7) |

Thus B’s incremental cold-seven gain is about **14% Node / 29% Bun**, but its warm-eleven cost is about **2.2× / 2.35×** relative to P. A without B retains about **13% cold-seven improvement** on both runtimes, while warm-eleven is about **13% / 25% slower** than O. These effects are not the previous full-PR-versus-main percentages.

### Repetition crossover

Each operation parses all pages once, then runs the entire selector batch N times on those documents. Seven-query N=2 means 14 separate `all` calls per page, not two selectors. Parse is included; final-batch results remain observable.

| Batch / repeats | Node O / P / F, ms | Bun O / P / F, ms | B reduction Node / Bun |
|---|---:|---:|---:|
| Seven standard / 1 | 28.98 / 22.56 / 19.46 | 31.76 / 26.53 / 19.24 | +13.7% / +27.5% |
| Seven standard / 2 | 35.47 / 29.59 / 29.06 | 38.72 / 34.45 / 30.08 | +1.8% / +12.7% |
| Seven standard / 4 | 45.95 / 40.49 / 50.97 | 52.22 / 49.75 / 50.54 | -25.9% / -1.6% |
| Seven standard / 8 | 69.75 / 64.83 / 86.53 | 77.30 / 76.88 / 92.74 | -33.5% / -20.6% |
| Eleven attribute / 1 | 31.46 / 27.06 / 32.69 | 32.62 / 30.33 / 32.78 | -20.8% / -8.1% |
| Eleven attribute / 2 | 38.97 / 36.30 / 55.78 | 41.14 / 41.55 / 55.86 | -53.7% / -34.5% |
| Eleven attribute / 4 | 56.45 / 55.33 / 101.90 | 57.54 / 62.86 / 103.15 | -84.2% / -64.1% |
| Eleven attribute / 8 | 91.26 / 92.73 / 193.21 | 89.60 / 104.40 / 197.16 | -108.4% / -88.9% |

For the standard batch B’s gain is nearly exhausted by two batches on Node; four batches lose on Node and are approximately tied on Bun; eight batches lose clearly on both. For the broader attribute batch, B already loses at the first eleven-query batch. There is **no universal query-count crossover**: selector coverage and attribute lengths matter; one `.active` query benefits much more than one `a[href]` query.

## Retained memory: causal attribution

Node only; median of five independent fresh processes per cell. MiB of `heapUsed + external` delta after two GCs before/after. Corpus/module/API-probe state is present before baseline. All parsed documents and identical query-result arrays remain alive; this is not peak allocation or RSS.

| State after parsing | O MiB | P MiB | F MiB | B saved P → F | A saved O → P |
|---|---:|---:|---:|---:|---:|
| No reads/queries | 19.85 | 19.86 | 19.86 | +0.00 MiB (+0.0%) | -0.01 MiB (-0.0%) |
| One `a[href]` query | 22.12 | 22.04 | 20.30 | +1.75 MiB (+7.9%) | +0.08 MiB (+0.3%) |
| Seven standard queries | 32.01 | 30.53 | 19.78 | +10.75 MiB (+35.2%) | +1.48 MiB (+4.6%) |
| Eleven attribute queries | 32.86 | 31.54 | 20.80 | +10.74 MiB (+34.1%) | +1.32 MiB (+4.0%) |
| Eleven queries, then every `.attributes` record | 32.98 | 34.18 | 33.22 | +0.96 MiB (+2.8%) | -1.20 MiB (-3.6%) |

Most of the previously reported full-PR queried-memory reduction belongs to **B avoiding pairs**, not A avoiding records. For eleven queries B saves 10.74 MiB; A alone saves 1.32 MiB. A single link query touches fewer elements: B saves 1.75 MiB and A only 0.08 MiB. Once callers request every attribute record, the large savings mostly disappear; residual ~1 MiB differences are reported, not assumed to be zero. Plain parse memory is unchanged.

## Cache control and mechanism

- An untimed internal probe on both runtimes found 35,990 elements. After eleven attribute queries F creates **zero pairs/records**; P creates **35,666 pair arrays, zero records**; O creates **35,666 pairs and records**. For `a[href]` P/O touch 6,336 pair arrays instead. These probes are separate bundles/processes, not instrumentation inside timed runs.
- `getAttr`/`hasAttr` already use cached pairs under A regardless of B. The fresh-read F/P differences are small and inconsistent with a claimed scanner benefit; the A-versus-O fresh-read gain is the relevant causal effect.
- The pairs-prewarmed control calls `getAttr("class")` on every element without accessing `.attributes`. F/P then both have 35,990 pair arrays and no records; B’s large raw-scan penalty disappears. Single-variant repetitions put F/P in the same approximate 10–13 ms Node / 10–11 ms Bun range. Remaining small/JIT-sensitive differences are not interpreted as a raw-scanning effect: `lookup` takes its cached-pair path.
- Raw/edited attributes and explicit hydration are covered by semantic checks. Pending root query-bridge optimizations may change which handles take this path; none is included here, and these numbers should not be extrapolated to that future bridge.

## Verification and limits

- Matching archived unit suites pass: F **265**, P **264**, O **259** tests. All three pass `tsc --noEmit` and production `bun run build`. An initial F typecheck without the bench dependency symlink failed on missing competitor modules; linking installed bench dependencies resolved it, without installation or source edits.
- Before timing, both Node and Bun passed Tree equality for 12 corpus pages + 500 seeded snippets, public query checks for all pages, and 1,000 raw/edited snippet cases with 31 selectors and getter/record checks. Each timed launch also verifies per-page/query counts and summed serialized result lengths using separate validation documents. Fingerprints agree across variants and runtimes. All timings import the mutable API explicitly and assert `setAttr` exists.
- Raw samples, process-level paired reductions, confirmations, all memory samples, exact selector lists, drivers, patches, test/build logs, cache counts, hashes and reproduction commands are in `bench/results/pr5-attribute-ablation.json`. Inner rounds are not treated as independent launches; no formal confidence intervals are claimed.
- Only this report and its new JSON were written in the root project. No existing source/report/dependency files, refs/index, PR body or remote state were changed. All variants/build products/drivers are under `/tmp/pr5-attribute-ablation`. No revert was applied to an actual branch.
