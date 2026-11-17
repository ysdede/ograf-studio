# Playback performance: what was slow, why, and what this fork changes

This branch is `zerodensity/ograf-studio` `dev` (0.34.0, `ce78bb9`) plus this fork's commits. Each commit is narrow, has a
test that fails without it, and says in its message what was slow and why. This file collects them with the measurements
that led to them, so they can be reviewed and taken upstream one by one.

Two kinds of graphics found the problems:

- **Tracking QA**, a realtime graphic fed 60 times a second by a Nodos Track pin: a Function, a 97-parameter full-screen
  AR shader and many bound fields. It found the costs of the **data path** (updates, Functions, shaders).
- **Six NFL and news packages made with stock Studio** (nine NFL templates, an NFL lower-third set, the Signal Blue news
  set, reviewed 2026-11-17). They found the costs of **loading and taking a graphic** (first Play, text fitting, Rules,
  package size).

## How it was measured

- **Data path:** Studio's own `nodos.html` in headless Chromium (ANGLE D3D11, RTX A6000) with a recorded 60 Hz Track,
  updates done per second, update latency, backlog, GPU use from Windows' per-process counters, WebGL draws per frame.
- **Load and take:** each unpacked package in headless Chromium through a host that does exactly what
  `packages/ograf-web-player/ograf-player.js` does (manifest, `import`, element, `load()`, `playAction`), with a mark at
  each step. **Cold** is a fresh browser context (empty HTTP and code cache), **warm** the same context navigated again.
  Each page plays twice: **Play** right after load and **replay** after `stopAction`. 3 cold and 3 warm runs per package,
  medians. Same machine as above; a second set at 4× CPU throttling stands in for a slower playout PC.
- **Causes:** CPU profiles per phase (load, Play to first frame, the take) and call counts of the suspect functions.
- **Pictures:** a screenshot of each package after its take, three per side, compared with the original. Packages with
  loops, clocks and tickers differ between two runs of the same package, so a difference counts only above that noise.

Machine-specific: absolute numbers are from a fast workstation. On a slower playout machine the same work takes longer
(the 4× column shows how much).

---

## Part 1. Loading and taking a graphic (2026-11-17)

### What was slow

| Package                            | Symptom with stock Studio                                                                |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| NFL lower-third set (coordinated)  | **545 ms** from Play to the first frame, **488 ms** on every replay; **5.8 s** at 4× CPU |
| Signal Blue news set (coordinated) | **973 ms** to ready from cold, 879 ms of it in `load()`; 14.2 MB downloaded              |
| 02 NFL Player Profile              | 534 ms to ready; `main.js` 9.2 MB                                                        |
| All eleven                         | every text layer refit on every frame (4 000 to 12 000 fit calls in one take)            |

### The six causes and fixes

#### 1. Rules re-rendered the whole graphic after every queued rule — `79ea0c7`

`CoordinatedGraphicElement.#drainRules` called `#render(frame)` after each rule it drained, also when the rule produced no
action. The lower-third set has 1 072 rules; at a take dozens are due at the same frame, so the same frame was rendered
**240 times before the first paint** (3 instances × 80 rules), all of it synchronous.

_Fix:_ render once when the drain reaches a frame it cannot run yet, and before a rule's actions run (so every action still
sees the current state). Renders at one frame with no paint between them were never visible.

_Measured:_ instance renders before the first frame 243 → 15. Play to first frame **545 → 100 ms**, replay **488 → 51 ms**,
long tasks during the take 531 → 86 ms; at 4× CPU **5.8 s → 0.84 s**. Test: 40 quiet rules rendered 41 times before,
at most 2 after.

#### 2. A held stroke track forced a layout per text layer per frame — `5a645ec`

`applyAnimatedPaint` writes the stroke width of every text that has a `strokeWidth` track, then calls the text's fit. The
fit reads `clientWidth`/`clientHeight` straight after that write, which forces a synchronous layout, and then returns
because nothing changed. Every text in all eleven packages (13 to 44 per package) had a **constant** stroke track on
auto-fit text, so each frame forced one layout per text.

_Fix:_ where a `ResizeObserver` watches the text box it already reports size changes, so the paint path refits only when the
stroke width changed. Without an observer (tests, older hosts) it refits every frame as before.

_Measured:_ fit calls in one take 3 754 → 106 (89-layer template), 4 845 → 182 (lower-third set). The packages kept 60 fps on
this machine either way; the saving is main-thread time per frame, which a slower machine or a busier page turns into
dropped frames.

#### 3. Every property sample copied and sorted its keyframes — `c946e08`

`getTrackValueAtFrame` ran `[...keyframes].sort(...)` with `localeCompare` on ids each time it sampled a property. The runtime
samples every animated property of every layer per frame: about **200 000 calls in one 1.6 s take** of an 89-layer
template.

_Fix:_ keep the sorted order per track in a `WeakMap`; a length check catches an in-place insert or removal. Samples are
unchanged.

#### 4. Rule images were inlined into `main.js` next to the same file — `ac34c25`

A visual rule that sets an image `src` kept its value as a `data:` URI, so the exporter wrote it into `main.js` as base64
**and** shipped the file in `assets/`. In 02 a 3400 × 2450 PNG (drawn in a 552 × 495 box) became 7 MB of JavaScript string,
parsed at every load.

_Fix:_ package rule `src` values like bindings (`packageUri`) and resolve them against the module URL when the exported module
starts, for templates and coordinated sets.

_Measured (02):_ `main.js` 9.2 → 1.8 MB, `load()` **206 → 68 ms**, cold ready 534 → 334 ms, download 15.6 → 8.1 MB.

#### 5. A coordinated export shipped one copy of each resource per template — `851e8fd`

Every template and shared component packaged its own copy of every font and image. Signal Blue carried Inter (876 KB)
**thirteen times** and two more fonts eight times: 16.9 MB of copies. The player fetched and decoded each copy at load.

_Fix:_ ship the first copy of identical bytes only; the module gets an alias table, so a later namespace's path resolves to that
copy. Compiled references, data defaults and text stay as they were.

_Measured (Signal Blue):_ package 10.1 → 1.4 MB, download 14.2 → 4.0 MB, `load()` **879 → 362 ms**, cold ready
**973 → 495 ms**, warm ready **359 → 115 ms**.

#### 6. The runtime shipped unminified — `266ac96`

Every `main.js` embeds the playback runtime with comments and indentation (1.6 MB of the 2.0–2.6 MB). The build now drops
whitespace and comments (runtime 1.6 → 1.3 MB). **Names are kept on purpose:** the worker and sandbox kernels ship as
Function source (`fn.toString()`), and mangling outer names broke three of the eleven packages (`ReferenceError: f is not
defined`). No load-time gain could be measured on this machine; it is a size change.

### Results, all six together (medians, original → with the fixes)

| Package                 | Cold ready    | Cold `load()` | Warm ready    | Play → first frame | Replay → first frame | Downloaded     |
| ----------------------- | ------------- | ------------- | ------------- | ------------------ | -------------------- | -------------- |
| 01 Matchup              | 268 → 258 ms  | 56 → 58       | 46 → 47       | 4 → 3              | 9 → 10               | 3.1 → 2.6 MB   |
| 02 Player Profile       | **534 → 334** | **206 → 68**  | **128 → 53**  | 14 → 3             | 6 → 7                | **15.6 → 8.1** |
| 03 QB Comparison        | 332 → 284     | 85 → 74       | 82 → 65       | 3 → 2              | 5 → 6                | 4.4 → 3.9      |
| 04 Team Comparison      | 483 → 387     | 169 → 141     | 169 → 127     | 16 → 17            | 15 → 4               | 3.3 → 2.9      |
| 05 Drive Analysis       | 584 → 547     | 206 → 201     | 242 → 193     | 17 → 16            | 16 → 1               | 3.2 → 2.8      |
| 06 Win Probability      | 415 → 340     | 133 → 124     | 161 → 129     | 12 → 11            | 9 → 10               | 3.2 → 2.8      |
| 07 Player Tracking      | 615 → 526     | 283 → 234     | 272 → 237     | 9 → 10             | 16 → 2               | 3.0 → 2.6      |
| 08 QB Impact            | 455 → 453     | 188 → 198     | 176 → 164     | 17 → 16            | 2 → 6                | 3.4 → 3.0      |
| 09 Video Windows        | 257 → 250     | 82 → 81       | 56 → 51       | 11 → 5             | 11 → 8               | 2.8 → 2.4      |
| **NFL lower-third set** | 640 → 538     | 517 → 428     | 207 → 176     | **545 → 92**       | **488 → 55**         | 4.4 → 3.5      |
| **Signal Blue set**     | **973 → 495** | **879 → 362** | **359 → 115** | 74 → 49            | 107 → 42             | **14.2 → 4.0** |

At 4× CPU: lower-third Play to first frame 5.8 s → 0.84 s; Signal Blue cold ready 5.7 s → 3.2 s, warm ready 3.5 s → 1.1 s;
02 cold ready 2.7 s → 1.7 s.

These numbers come from the packages with the six changes applied to their own `main.js` (so each change could be timed alone).
The same graphics exported again through this branch certify, and Signal Blue's export is 1.4 MB instead of 10.1 MB.

### For people making graphics with Studio

Each of these made the packages slower with **any** Studio version:

1. **No constant stroke tracks on text.** A `strokeWidth` track whose keys all hold one value does nothing but cost a refit.
   Delete it, or keyframe the stroke only where it changes.
2. **Auto-fit only where the text varies.** Every shrink-to-fit or fit-to-width text measures itself up to 18 times at load.
   Fixed copy (labels, headings) can use a fixed size.
3. **Images at the size they are drawn,** at most twice that. A 3400 × 2450 photo in a 552 × 495 box decodes 37 times the
   pixels it shows.
4. **Rules are not free.** Each data rule is evaluated at every take; 1 072 rules in a lower-third set is a lot. Prefer
   bindings and value maps for plain data-to-property mapping; keep rules for logic.
5. **One font file per family** across the templates of a set, and subset large fonts to the characters used.

---

## Part 2. The realtime data path (2026-10-28 to 2026-11-15)

Found with Tracking QA (60 Hz Track, Function, 97-parameter AR shader). Upstream at the time was `savasalkim/ograf-studio`
`dev` 0.23; the commits were rebased onto zerodensity 0.33 and now onto 0.34.

### Throughput before and after (Studio's `nodos.html`, recorded 60 Hz Track)

| Build                               | Updates done / sent per s | Update p50 | Backlog after 12 s |
| ----------------------------------- | ------------------------- | ---------- | ------------------ |
| Upstream, unchanged                 | 6.4 / 24.6                | 139 ms     | 218                |
| + realtime updates at the data rate | 24.8 / 43.8               | 42 ms      | 227                |
| + warm Function realms              | 51.3 / 52.9               | 17.5 ms    | 19                 |
| + re-sample only affected layers    | 62.3 / 62.4               | 6.2 ms     | 1                  |

### The commits

| Commit               | What was slow or broken                                                                                                                                                                                                                       | Change                                                                                                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `31d4f2c`            | Each bound shader parameter copied the paint's whole parameter object and resolved all of them: O(N²) per update (126 bound parameters on one shader).                                                                                        | Linear lookup; the cached definition is copied out, never shared.                                                                                                                               |
| `e818fd2`            | Several bindings on one layer each copied the shader paint.                                                                                                                                                                                   | One parameter copy per layer and update.                                                                                                                                                        |
| `f400383`            | `31d4f2c` had dropped validation (unknown sibling parameter, malformed sibling colour, invalid shader contract) and let the warmed cache be changed from outside.                                                                             | Validation restored, once per update in the batched path: 97 parameters 1.31 → 0.24 ms per update.                                                                                              |
| `71d9d05`            | A realtime `updateAction` waited on a GPU fence for every shader, so the update rate equalled the slowest shader's frame time; every data change re-resolved all layers in four passes; a fast feed overflowed the 64 pending Function calls. | Realtime updates return once content is mounted (seeks and captures still wait for exact pixels), resolve only layers that read the changed keys, and wait for the Function calls they trigger. |
| `cb5d771`            | Every Function call ran in a new Worker realm, so code never left the interpreter: a 0.7 ms Function took 14.5 ms per call.                                                                                                                   | Realtime reuses the Worker after a successful call and evaluates the source anew each time (no closure state); failures and timeouts still end it; non-realtime keeps a fresh realm.            |
| `c33d55e`            | After every data refresh the loop snapshot re-sampled, text-fitted and re-applied every layer.                                                                                                                                                | Only the layers the refresh can affect, when no layer depends on another and no transition runs.                                                                                                |
| `d6dab62`            | Every Function call UTF-8-encoded state, data and context to check byte limits.                                                                                                                                                               | Skip the encoding when the UTF-16 length is safely under the limit: 57 KiB state 0.33 → 0.05 ms per call.                                                                                       |
| `e071a35`            | The base paint of a layer was parsed from JSON on every redraw.                                                                                                                                                                               | Parsed once per change per host.                                                                                                                                                                |
| `2ae3654`, `da9c897` | Upstream 0.30 draws every shader layer on one shared WebGL context and copies each into its canvas with `drawImage` (268 full-frame copies a second); parameter updates drew at once (about 270 draws for 60 frames).                         | A realtime graphic gives each shader layer its own context (up to 8) and updates mark the layer dirty; one draw per frame, and a static shader still gets its updates.                          |
| `ac848a0`            | A shader fill drew twice per frame (the update and the animation tick each requested one).                                                                                                                                                    | One flush per frame: AR layer 2 draws per frame → 1, GPU 25% → 14% with every AR part on.                                                                                                       |
| `cf8f646`            | The Function sandbox token used `crypto.randomUUID`, which exists only on HTTPS: players serving packages over plain HTTP (Reality Hub) could not load a graphic with a Function.                                                             | 128 bits from `crypto.getRandomValues`.                                                                                                                                                         |
| `f9c69db`            | Reality Hub's renderer forbids inline scripts and blob workers in its CSP, so the isolated sandbox never started.                                                                                                                             | Where a CSP `<meta>` forbids them, Functions run in the page with the same contract (JSON only, size limits, fresh source per call).                                                            |
| `da4694c`, `240dd72` | Only Studio's own `nodos.html` passed ElectroNode data pins on, and pins were timed when the Function ran.                                                                                                                                    | The runtime subscribes once per page when the host does not, and stamps each pin value on arrival.                                                                                              |
| `086bb16`, `4120fb3` | `iTime` counts from playback start and `nowMs` from runtime start, so a jitter buffer could not place samples on the page clock.                                                                                                              | Realtime shaders get `iClock` (page clock), Functions get `clockOriginMs`.                                                                                                                      |

Other fork commits on this branch: `680f4fe`, `d3d310b`, `64c26bc` (tests and fixtures), `fe474d9` (text `fontVariantNumeric`,
tabular figures), `a16cecf` (`reorder_effects` rejects a repeated id).

### Status upstream

The 2026-10-29 contribution review (branch `docs/contribution-review-2026-10-29`) judged each data-path commit on its own:
ready as narrow patches are the plain-HTTP token, the UTF-8 size check, the validated shader lookup and three lifecycle fixes;
`clockOriginMs` as an API proposal. Held, because they change a contract or their gain did not repeat: warm realms (a
global counter reads `[1,2]` across two calls instead of `[1,1]`), the in-page CSP fallback (isolation and timeout differ),
`iClock` (realtime/deterministic boundary), the pin bridge (ownership), base-paint cache and binding batching (no stable gain
alone). Part 1's six commits are new and have not been reviewed upstream.

## Not carried from the older yd-zd `dev` line (0.23)

That line took features that zerodensity later implemented in its own way. Three are known missing here (the Toolkit's tests
fail on them): the box-shadow effect stage, effect bounds and text direction values.

## Check it

```sh
npm ci
npm run build --workspace @ograf-editor/ograf-runtime
npx vitest run            # 5 537 tests on this branch
npm run typecheck --workspaces --if-present
```
