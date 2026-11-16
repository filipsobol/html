# Performance ideas to revisit

## Requested-attribute scanning for mutable selectors

Decision: remove this optimization from PR #5 and the pending local mutable-query bridge. Class-token matching, bounded parser scratch reuse, and the other local optimizations remain. Cached-pair reads that avoid mutable attribute records (`a9d7fe5`) were initially retained, but are now deferred too; see the second section below.

Original commit: `969b51c28941e6abacb0452b99a2820715e32370` (`perf: match mutable attributes without parsing pairs`). The first scanner-free PR #5 head was `38ccb845e8165733a80c20eef70527a3c0521710`. Both attribute shortcuts are absent from the current head, `b2524a085c6ab8e651fb1926b9fd1d996b953135`. Each commit was dropped and scratch reuse replayed, not reverted with another commit.

### What it did

When a mutable selector requested an attribute, `values.lookup()` scanned the original start tag for that key instead of parsing and caching every attribute pair. It decoded only the matching value. Existing pairs were reused if another read had already populated them.

This avoided allocations on first queries but did not populate the pair cache itself, so later selectors could repeatedly scan and decode the same attributes. Class selectors were affected too. At that revision, public `getAttr()` / `hasAttr()` already used cached pairs independently of this scanner. That separate fast path is now deferred too.

### Isolated measurements

PR #5 only, with class-token matching, attribute-object avoidance, and scratch reuse held constant. Node 26.13.0 / Bun 1.4.4, Ryzen 7 9800X3D under WSL2; 12 cached pages / 4,843,812 source characters. These are not measurements of the later lazy mutable graph/query bridge.

| Workload | Node, scanner vs cached pairs | Bun, scanner vs cached pairs |
|---|---:|---:|
| Parse + seven queries on fresh documents | ~14% less time | ~29% less time |
| Parse + one `a[href]` query | ~10% less time | ~16% less time |
| Parse + one `.active` query | ~35% less time | ~38% less time |
| Repeated eleven-attribute-query batch | ~2.2× as much time | ~2.35× as much time |
| Parse + eleven attribute queries, first batch | ~21% more time | ~8% more time |
| Parse + eight batches of seven queries | ~34% more time | ~21% more time |

The cold-seven and warm-eleven results were also confirmed with six independent matched triples per runtime, one variant per process. Single-query and repetition rows use three balanced multi-module launches. Percentages from these different experiments should not be added.

Node retained memory (`heapUsed + external` after GC, documents and query results alive; median of five fresh processes):

- After eleven attribute queries: **31.54 → 20.80 MiB**, saving **10.74 MiB / 34%** with the scanner.
- After seven standard queries: **30.53 → 19.78 MiB**, saving **10.75 MiB / 35%**.
- After one `a[href]` query: **22.04 → 20.30 MiB**, saving about **1.75 MiB / 8%** (rounded endpoints).
- Parsing alone: essentially unchanged.
- After requesting every `.attributes` record, the large memory advantage mostly disappears (about 3% remained in this workload).
- Bun retained memory was not measured.

An internal probe after eleven queries found zero pair/record allocations with the scanner, versus 35,666 cached pair arrays without it. Prewarming pairs through `getAttr()` removed the large repeated-scanning penalty.

### Why defer it

The benefits are real and substantial for low-memory, parse-once/query-once workloads, but the repeated-query cost is too large for the default chosen here. Even the first broad batch of eleven attribute queries was slower. The standard seven-query advantage nearly disappeared after two batches on Node; there is no universal crossover count because selectors and attribute lengths matter.

In the earlier comparison, avoiding mutable attribute objects without this scanner saved about 13% cold-seven time on both runtimes, 29% / 14% fresh-getter time, and about 4% queried memory. Its separate warm-query/read costs, especially on Bun, were investigated again and led to deferring that optimization too; see below.

Before reintroducing the scanner, measure cold and repeated queries, pair-prewarmed/mixed API workflows, retained memory, missing/late attributes, and entity decoding under both runtimes. Do not accidentally restore it while extracting the lazy mutable graph PR: its numeric and State adapters must use cached attribute records unless these decisions are deliberately revisited. No adaptive attribute index has been adopted.

The archived full-suite results and the remaining PR drafts predate this removal. Refresh their performance comparisons against the scanner-free base before publishing them.

Detailed evidence and reproducibility:

- [Attribute ablation report](bench/pr5-attribute-ablation.md)
- [Raw samples, variant patches, drivers, cache counts, and verification](bench/results/pr5-attribute-ablation.json)
- [Final PR #5 measurements without either attribute shortcut](bench/pr5-without-attribute-shortcuts.md)

## Avoiding mutable attribute records with cached-pair reads

Decision: defer `a9d7fe5c82e5483c4a6bb7bb1226c2a0768c55b8` (`perf: read mutable attributes from the tree`). PR #5 now contains only class-token matching and bounded parser scratch reuse, at `b2524a085c6ab8e651fb1926b9fd1d996b953135`.

### What it did

Public `getAttr()` / `hasAttr()` and mutable selector matching called a new `state.attribute()` helper. Until a record was explicitly requested or needed for editing, it read cached `[key, value, ...]` pairs through `values.attribute()`. This avoided building and freezing the attribute object on first access, but later reads continued searching the pair array. Once a record existed, the helper used it.

Removing this shortcut restores cached frozen-record reads for mutable getters and selectors. It does **not** remove parsed-pair caching itself, immutable pair reads, lazy Tree cache-array allocation, the lazy mutable State graph, numeric query handles, sibling indexing, or clean-subtree scans. The pending numeric bridge now uses `values.attributes()` plus own-property checks; its State path uses `state.attributes()` in the same way.

### Isolated measurements and tradeoffs

Published PR #5 with this change versus its exact reversal; class matching and scratch reuse held constant, raw scanner absent in both. Same 12-page corpus, Node 26.13.0 / Bun 1.4.4, Ryzen 9800X3D under WSL2. Four independent matched process pairs per runtime/workload, one variant imported per process. Values below are medians of paired percentages, not full-PR-versus-main results.

| Workload | Node, shortcut enabled | Bun, shortcut enabled |
|---|---:|---:|
| Parse + seven queries on fresh documents | 11.7% less time | 12.1% less time |
| Repeated eleven-attribute-query batch | 11.5% more time | 29.7% more time |
| Fresh five-key `getAttr`/`hasAttr` batch | 19.8% less time | 7.1% less time |
| Repeated five-key getter batch | 9.1% more time | 85.0% more time |

Every primary pair agreed on direction. The cold-seven saving was about 4 ms per corpus operation; the warm-eleven cost was about 1.35 ms Node / 2.43 ms Bun. These are different workloads, so do not divide them to assert a universal crossover. Fresh-getter gains were smaller than in the earlier investigation; do not pool the two experiments or promise one precise universal percentage.

Direct repetition probes (two matched pairs per cell):

- Bun's first-getter advantage was already exhausted by the second complete batch. At sixteen batches the shortcut took about 50% more total time.
- Node getter batches still slightly favored the shortcut through sixteen batches; the curve was not monotonic, so no precise later crossover was established.
- Eleven-attribute-query batches lost by the second batch on both runtimes.
- Bun's standard seven-query mix was approximately tied at four batches and lost at eight/sixteen. Node's mixed-query results were nonmonotonic and do not support a stable threshold.

Node retained memory, median of five fresh processes per cell (`heapUsed + external` after GC, identical documents/results alive; not peak/RSS):

| State | Without shortcut | With shortcut | Saving |
|---|---:|---:|---:|
| Seven queries | 32.01 MiB | 30.53 MiB | 1.48 MiB / 4.6% |
| Eleven attribute queries | 32.82 MiB | 31.54 MiB | 1.28 MiB / 3.9% |
| Five-key public getter batch | 32.32 MiB | 31.47 MiB | 0.85 MiB / 2.6% |
| Eleven queries, then every `.attributes` | 33.26 MiB | 34.10 MiB | **0.84 MiB more with shortcut** |

The post-hydration memory increase appeared in two independent investigations, but its cause was not established. Allocation order, GC, and string representation are hypotheses, not findings. Bun retained memory was not measured.

### Why defer it

This is a useful optimization for fresh documents with a few reads, not an across-the-board loss. The decision favors predictable repeated mutable reads/queries across both runtimes: the modest memory savings and cold-query improvement do not offset the chosen warm-path cost, especially on Bun. No universal workload distribution was measured.

A getters-only split restores record-based selector matching but gives up the cold-selector gain and keeps the getter tradeoff. A selectors-only split restores record-based public getters but keeps the bad repeated-query path. Exploratory split checks found no dominant option; they were not promoted or applied. No adaptive attribute index or automatic promotion policy has been adopted.

Before reconsidering, repeat fresh/warm/mixed reads, direct repetition, edits and explicit `.attributes` hydration, retained memory, and both-runtime checks. Do not restore this shortcut indirectly when extracting the later mutable graph/query PR.

Evidence:

- [Focused cached-pairs ablation](bench/pr5-cached-pairs-ablation.md)
- [Raw samples, exact patches, drivers, hashes, and checks](bench/results/pr5-cached-pairs-ablation.json)
- [Earlier three-variant ablation](bench/pr5-attribute-ablation.md)
- [Final two-optimization PR measurements](bench/pr5-without-attribute-shortcuts.md)
