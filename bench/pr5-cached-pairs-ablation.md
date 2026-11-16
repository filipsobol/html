# PR #5: remaining cached-pairs attribute tradeoff

## Recommendation

**Retaining A (`a9d7fe5`) is defensible for a general default favoring fresh documents and a few queries/reads; it is not an across-the-board improvement.** That workload preference is a policy assumption, not something this corpus can establish. If repeated mutable queries are the acceptance criterion, removing A's selector path is justified. Do not attribute these conditional effects to the whole PR or to class matching/parser scratch.

The remaining regression is real: A saves roughly **4 ms per fresh seven-query corpus batch**, but costs **1.35 ms Node / 2.43 ms Bun per warm eleven-query batch**. Fresh public getter batches improve, while warm getter batches cost **0.39 / 1.63 ms**. Broad-query retained memory improves only **about 4%**. The original scanner's much larger memory savings no longer apply.

The exploratory split is feasible, not a free fix: getters-only removes this selector regression but also gives up the cold-selector gain; selectors-only fixes the public warm-getter regression but gives up fresh-getter gains. Neither dominates full A or its reversal. There is no universal workload weighting or single query-count crossover.

## Frozen comparison and protocol

- **P:** actual published PR #5 `38ccb845e8165733a80c20eef70527a3c0521710`, tree `46dc03e1e757b0849cbcc753b5d19d9ac0b0a2a4`.
- **O:** P with the exact A commit reversed, including its tests. The raw scanner is absent in both; class matching and bounded parser scratch remain enabled.
- Fresh Git archives were restored under `/tmp/pr5-cached-pairs-ablation`; earlier temporary directories no longer existed. Every recorded P/O source hash matches the previously verified ablation source. P also matches published Git source directly. Pending root optimizations were never inputs.
- Same twelve cached pages, Node **26.13.0**, Bun **1.4.4**, Ryzen 9800X3D/WSL2, the same unminified `bun build --target=node` mutable-bundle protocol as the prior investigation (fresh builds, hashes archived). All CPU work was **serial**.
- Primary: **four independent matched P/O process pairs per runtime/workload**, balanced PO/OP/PO/OP, exactly one variant imported per process. Each process uses 600 ms warmup and nine ≥160 ms timed rounds; its median is one sample. No samples removed.
- Repetition: two independent matched pairs per runtime/N, PO then OP. These are lower-replication crossover probes, not equally strong confirmation. Timing excludes validation documents. Every process verifies observable counts/serialized lengths; all fingerprints agree across P/O and runtimes.

The earlier report's multi-variant timings and earlier single-variant confirmations are **not pooled** with these new measurements. Absolute times differ from earlier runs; fresh-getter gains, especially Bun's, are smaller here. Inner rounds are not independent processes; ranges below are descriptive, not confidence intervals.

## Independent primary confirmation

Times are medians of four process medians, milliseconds per complete twelve-page corpus operation. **Saved ms** and **reduction** are medians of matched-pair differences and reductions (`1 − P/O`), so they need not equal differences/ratios of the displayed marginal medians. Negative values mean A loses.

| Workload / runtime | O ms | P ms | Saved ms | Paired reduction (range) |
|---|---:|---:|---:|---:|
| Parse + seven standard queries / Node | 33.84 | 28.79 | +3.95 | +11.7% (+8.8 to +18.7) |
| Parse + seven standard queries / Bun | 35.22 | 30.69 | +4.25 | +12.1% (+8.5 to +16.1) |
| Warm eleven attribute queries / Node | 11.15 | 12.71 | -1.35 | -11.5% (-17.1 to -8.8) |
| Warm eleven attribute queries / Bun | 8.19 | 10.62 | -2.43 | -29.7% (-35.7 to -23.3) |
| Fresh five-key getAttr/hasAttr / Node | 16.84 | 13.37 | +3.31 | +19.8% (+18.6 to +24.4) |
| Fresh five-key getAttr/hasAttr / Bun | 18.46 | 16.66 | +1.27 | +7.1% (+0.7 to +17.9) |
| Warm five-key getAttr/hasAttr / Node | 4.27 | 4.66 | -0.39 | -9.1% (-17.9 to -6.2) |
| Warm five-key getAttr/hasAttr / Bun | 1.92 | 3.54 | -1.63 | -85.0% (-88.7 to -76.4) |

Every primary pair agrees on direction. Fresh getters exclude parsing and element enumeration; each operation gets newly parsed, unread elements. Warm rows reuse previously queried/read documents. A getter batch calls both APIs for each of five keys on every element; it is not one getter call.

## Measured selector repetition

Each operation parses once, then repeats the entire batch N times on those documents; parse is included. Standard7 is seven separate queries, not a combined selector union. The eleven-query attribute batch is different coverage, not simply four extra equivalent calls. Values below are **O / P ms** and median paired reduction; two pairs per cell.

| Batch / N | Node O / P | Node reduction | Bun O / P | Bun reduction |
|---|---:|---:|---:|---:|
| Standard7 / 1 | 31.49 / 27.05 | +14.1% | 35.79 / 30.10 | +15.9% |
| Standard7 / 2 | 38.35 / 37.06 | +3.3% | 40.40 / 37.14 | +8.1% |
| Standard7 / 4 | 47.76 / 52.57 | -10.0% | 53.57 / 52.56 | +1.9% |
| Standard7 / 8 | 77.41 / 68.54 | +11.3% | 81.22 / 87.42 | -7.7% |
| Standard7 / 16 | 128.07 / 134.08 | -5.1% | 137.52 / 147.69 | -7.4% |
| Attribute11 / 1 | 34.30 / 31.99 | +6.5% | 35.42 / 35.42 | -0.0% |
| Attribute11 / 2 | 45.92 / 47.35 | -3.1% | 45.56 / 46.57 | -2.2% |
| Attribute11 / 4 | 61.32 / 66.06 | -7.8% | 64.51 / 73.04 | -13.2% |
| Attribute11 / 8 | 100.40 / 125.84 | -25.4% | 92.25 / 117.15 | -27.0% |

**Bun standard7:** four batches are approximately tied (paired range -0.8% to +4.7%); eight and sixteen lose in both pairs. **Attribute11:** the first batch has a small Node gain and Bun tie; two batches lose in both pairs on both runtimes; eight lose substantially. Node attribute11/N=4 is mixed (+5.3% to -20.8%), so do not claim a smooth fitted curve.

**Node standard7 does not establish a stable monotonic crossover:** N=4 loses in both pairs, N=8 wins in both, and N=16 is mixed (-20.6% to +10.4%). This is process/JIT-sensitive end-to-end evidence, not license to discard inconvenient launches or assert that every operation beyond a threshold loses. Warm-attribute confirmation is much clearer than this standard-batch crossover probe.

## Direct first-plus-repeated getter batches

Each operation prepares fresh elements **outside timing**, then times N complete five-key getAttr/hasAttr batches together, retaining their summed result. N includes the first batch. This directly measures the workload, rather than extrapolating a crossover from separate fresh/warm rows. Two matched pairs per cell; O / P milliseconds.

| N | Node O / P | Node reduction | Bun O / P | Bun reduction |
|---:|---:|---:|---:|---:|
| 1 | 16.75 / 13.82 | +17.5% | 17.71 / 16.40 | +7.3% |
| 2 | 20.48 / 19.26 | +6.0% | 20.37 / 21.47 | -5.4% |
| 4 | 30.83 / 26.33 | +14.5% | 25.19 / 28.22 | -12.1% |
| 8 | 49.07 / 46.71 | +4.8% | 33.75 / 43.44 | -28.7% |
| 16 | 82.94 / 81.52 | +1.7% | 49.04 / 73.53 | -50.0% |

**Bun crosses between one and two batches**, with both pairs agreeing at every N: its initial saving is already exhausted by one subsequent batch. **Node has no measured crossover through sixteen batches**; the N=16 advantage is small (paired +0.8% to +2.6%), and the curve is not monotonic. Do not substitute the arithmetic ratio of separately measured cold savings and hot costs for this observed result, or extrapolate a precise Node threshold beyond N=16.

## Retained memory

Node only, **five fresh processes per variant/cell**, balanced order. Median MiB of `heapUsed + external` delta, two GCs before/after, identical documents/query-result arrays retained. This is neither RSS nor peak allocation.

| State | O MiB | P MiB | A saved |
|---|---:|---:|---:|
| Seven standard queries | 32.01 | 30.53 | 1.48 MiB / 4.6% |
| Eleven attribute queries | 32.82 | 31.54 | 1.28 MiB / 3.9% |
| Five-key public getter reads on every element | 32.32 | 31.47 | 0.85 MiB / 2.6% |
| Eleven queries, then every `.attributes` | 33.26 | 34.10 | **-0.84 MiB / -2.5%** |

The memory benefit is modest, and **P actually retains more measured memory after full hydration**, not exactly the same amount. The earlier independent measurement also found P higher after hydration (~1.20 MiB). No heap-snapshot attribution was attempted: allocation order, GC and string representation are possible factors, not established causes. Plain parse memory was not redundantly rerun.

## Origin of cost and exploratory split

A changes two dispatch sites: public `getAttr`/`hasAttr` in `src/mutable/node.ts`, and selector `matcher.attr` in `src/mutable/state.ts`. Both use `state.attribute`: before record hydration it reads cached attribute pairs through `values.attribute`; once a record exists it uses `Object.hasOwn`/record lookup. O materializes that record on first access. Avoiding record construction helps fresh operations and saves some retained memory; repeatedly searching pairs instead of reading the record explains the warm-path tradeoff. The independent exact-A reversal establishes the causal unit; these measurements do not isolate every instruction/JIT contribution.

Two additional temporary variants split only those call sites:

- **G, getters-only:** P public APIs, O selector callback. Selectors build records, avoiding the repeated selector pair path, but surrender the cold-selector benefit. Public getter-only workloads still have A's fresh/warm tradeoff until records are hydrated.
- **S, selectors-only:** P selector callback, O public APIs. Keeps the selector tradeoff, while public getters build records, sacrificing their initial saving to regain warm record reads.

Exploratory two-launch medians, **not matched contemporaneous P/O comparisons**:

| Variant / workload | Node ms | Bun ms |
|---|---:|---:|
| G / parse + standard7 | 31.78 | 36.35 |
| G / warm attribute11 | 9.48 | 8.26 |
| S / fresh public getters | 16.50 | 18.39 |
| S / warm public getters | 4.12 | 1.88 |

These are qualitatively consistent with restoring the corresponding O paths. Do not interpret G's Node warm number as a proven improvement over O: its launches were later, unpaired with the primary endpoints. Splits passed the same cross-variant semantic driver on both runtimes, but did not receive separate full unit/type/build suites. **G is a plausible narrower choice if eliminating the bad mutable-query row is the product priority; it does not eliminate warm getter-only costs.** S does not fix that query row. No split was applied to the PR.

## Verification and limits

- P **264 tests**, O **259 tests**, zero failures; both pass `tsc --noEmit` and production `bun run build` in frozen archives. Source hashes remain unchanged after testing/building/timing.
- Node and Bun each pass Tree equality on **12 pages + 500 seeded snippets**, public corpus queries, and **1,000 raw/edited snippet cases** with 31 selectors and getter/record checks. Independent timing fingerprints agree across runtimes/variants. Mutable API is explicitly imported and `setAttr` existence asserted.
- Split semantics additionally compare P/O/G/S on both runtimes. No adaptive index, source optimization, peak-allocation study, heap-snapshot explanation, competitor suite or general workload distribution was tested.
- Raw samples, process pair identities, all fingerprints, exact A/split patches, drivers, hashes, logs and reproduction commands are in `bench/results/pr5-cached-pairs-ablation.json`. Earlier evidence is referenced, not silently reused as new samples.
- Only this **new report and new JSON** were written in the root project. All variants/drivers/build products are under `/tmp`; no root source, existing report, index, ref, PR or remote was changed.
