# PR #5: class matching and bounded parser scratch

Fresh main `3572e759d478434ae57c7e618358e5bdde2063a3` → published PR #5 `b2524a085c6ab8e651fb1926b9fd1d996b953135` (**O**), tree `6bf0950b66c5f4eb25f68c3b9d15ea89cefd8622`.

Only **two optimizations** remain: class matching without token-array allocation, and bounded parser-scratch reuse. Cached-pair mutable attribute shortcuts, the raw attribute scanner, and shared final Tree buffers are absent. O was independently restored from actual prior PR `38ccb845` with the exact `a9d7fe5` commit reversed. **All 45 tracked files of the newly published target match this frozen O byte-for-byte.** No unrelated root-worktree optimization enters these measurements.

## Findings

- Parse + seven queries improves **4.3% Node / 9.3% Bun**. Warm class queries improve **52.9% / 71.3% immutable**, **37.5% / 65.4% mutable**.
- Four explicit tiny snippets improve **78.2% / 17.5% immutable**, **74.3% / 17.6% mutable**. These are four snippets, not a historical fragment corpus.
- Corpus parsing, public getter reads and retained memory show no consistent broad improvement. Node mutable parsing has a 10.4% median improvement but one of four pairs reverses direction; do not generalize that magnitude.
- Warm mutable attribute queries remain sensitive: the primary Node row is 8.3% slower, but independent single-variant confirmation is mixed and reverses the aggregate direction. Bun retains a **small measured slowdown** (2.0% primary; 3.4% confirmation), not a demonstrated universal tie. Neither runtime supports a precise universal attribute-query percentage.

## Fresh balanced primary measurements

Node **26.13.0**, Bun **1.4.4**, Ryzen 9800X3D / WSL2. Twelve cached pages, 4,843,812 characters; same corpus and fresh builds for both revisions. Both APIs use identical unminified `bun build --target=node` flags. All CPU-heavy work was serial, after parent validation finished.

For every runtime/workload: **four independent fresh launches**, balanced module load order, alternating timed-round order; 600 ms warmup per module and nine ≥160 ms rounds per module. Node forces GC before rounds; Bun does not. One process median is one observation. All completed samples are retained; no historical main samples are reused.

Times below are **milliseconds per complete corpus workload**, or all four snippets. Values are medians of four process medians; reduction is `1 − median(O)/median(main)`, positive for faster O. Paired statistics and every round are archived separately; inner rounds are not independent process observations.

| Workload | Node main → O, ms | Reduction | Bun main → O, ms | Reduction |
|---|---:|---:|---:|---:|
| Parse, immutable | 7.094 → 7.143 | -0.7% | 6.114 → 6.193 | -1.3% |
| Parse, mutable | 11.331 → 10.150 | +10.4% | 8.892 → 8.818 | +0.8% |
| Parse + seven queries, mutable | 32.812 → 31.389 | +4.3% | 38.220 → 34.653 | +9.3% |
| Warm eight class queries, immutable | 15.905 → 7.493 | +52.9% | 25.843 → 7.421 | +71.3% |
| Warm eight class queries, mutable | 18.786 → 11.740 | +37.5% | 24.826 → 8.584 | +65.4% |
| Warm eleven attribute queries, immutable | 6.116 → 6.221 | -1.7% | 6.316 → 6.177 | +2.2% |
| Warm eleven attribute queries, mutable | 9.117 → 9.869 | -8.3% | 8.287 → 8.452 | -2.0% |
| Fresh five-key getAttr/hasAttr, mutable | 18.048 → 17.795 | +1.4% | 20.735 → 20.245 | +2.4% |
| Warm five-key getAttr/hasAttr, mutable | 4.261 → 4.453 | -4.5% | 2.732 → 2.769 | -1.3% |
| Four tiny snippets, immutable | 0.012411 → 0.002699 | +78.2% | 0.003893 → 0.003211 | +17.5% |
| Four tiny snippets, mutable | 0.013036 → 0.003346 | +74.3% | 0.004903 → 0.004037 | +17.6% |

Parse + queries includes parsing and seven separate queries. Warm rows reuse already queried/read documents. Fresh getters recreate documents and enumerate elements outside each timed getter interval; each batch calls both APIs for `class`, `id`, `href`, `title`, `data-testid` on every element. Validation objects are separate from timed documents. Exact selectors, snippets and preparation are embedded in the archived driver.

### Independent warm mutable attribute confirmation

Because the primary row was sensitive, this workload additionally received **four fresh matched process pairs per runtime**, alternating main/O and O/main. Each process imports only one variant, with the same warmup/round protocol. Both variants now use full attribute records; these are directly measured contemporary baselines, not old measurements or extrapolation.

| Runtime | Main median ms | O median ms | Time change (ratio of medians) | Median paired change; observed range |
|---|---:|---:|---:|---:|
| Node | 11.150 | 9.944 | -10.8% | -5.4%; -22.8% to +16.7% |
| Bun | 8.053 | 8.326 | +3.4% | +3.8%; +0.7% to +7.3% |

Here positive **time change means slower**. Node's four pair changes are approximately -22.8%, -20.0%, +9.1%, +16.7%: its direction is not stable across launches/protocols. Bun is consistently a little slower in confirmation, though its primary pairs are mixed. These descriptive ranges are not confidence intervals. The records-based baselines are broadly similar in absolute cost, but claiming exact equality or dismissing Bun's remaining small regression would overstate the evidence. No instruction-level/JIT attribution was established.

## Retained memory

Node only, **five fresh processes per variant/state**, alternating pair order. Median MiB of `heapUsed + external` delta, two GCs before and after; input strings, imports and a tiny API probe are already alive at baseline. Documents remain alive; queried cases also retain all eleven query-result arrays per page. This is not RSS or peak allocation.

| State | Main MiB | O MiB | Saved MiB |
|---|---:|---:|---:|
| Parsed immutable | 4.627 | 4.689 | -0.062 |
| Parsed mutable | 19.746 | 19.808 | -0.062 |
| Eleven queries, immutable | 16.945 | 17.005 | -0.060 |
| Eleven queries, mutable | 32.913 | 32.877 | +0.036 |

There is **no meaningful retained-memory saving** here. Immutable retained memory is slightly higher. Scratch is bounded to 4,096 nodes × 29 column bytes = 118,784 bytes (116 KiB) per loaded API module, plus headers; surviving scratch is included, not subtracted. No removed shared-buffer/scanner memory claim is carried forward.

## Verification and reproduction

- Independently verified target Git tree and **all 45 tracked files** against frozen O, plus all O source hashes against the earlier exact-reversal archive. Source hashes remain unchanged after builds and timing. Bundle, corpus and source hashes are archived.
- Fresh Node and Bun semantic drivers pass Tree equality on **12 pages + 500 seeded snippets**, immutable public signatures on those cases, mutable corpus selectors, and **1,000 raw/edited snippet cases** using 31 selectors plus getter/record checks. All timing fingerprints agree across revisions, runtimes and launches. API dispatch explicitly checks `setAttr` presence/absence.
- Parent reports **259 tests, complete types and production build** passing in the isolated exact target tree. Because every tracked target file matches O, those checks apply to the measured source; they were not redundantly rerun by this benchmark task. Fresh benchmark bundles and semantic checks above were independently run here. Parent reports publication through normal Git after explicit force-with-lease authorization; GitHub's SSH signature status is `unknown_key`, not a functional-test result.
- `bench/results/pr5-without-attribute-shortcuts.json` contains every raw round/process sample, fingerprints, paired statistics, memory components, exact reversed patch, full drivers, build/semantic logs, hashes, protocol and reproduction commands. Earlier reports supplied driver text/provenance only, **not timing samples**.
- This task changed only this new report and its new JSON in the root project. Temporary variants and drivers are under `/tmp/pr5-without-attribute-shortcuts`; root sources, existing reports, index, refs and remotes were not changed by this task. Parent history/publication/TODO/PR-body work is separate. No competitor suite, heap attribution, peak-allocation study or general workload-distribution claim was attempted.
