# Realtime data path: the fork-only commits, why they are needed, and their risks

This branch is `zerodensity/ograf-studio` 0.40.0 plus this fork's commits. Upstream took the load-and-take fixes into 0.40 as
[`5257e7f`](https://github.com/zerodensity/ograf-studio/commit/5257e7f1e64b6fd5a1830095df29c2782fd377f4) (see
[PERFORMANCE.md](PERFORMANCE.md), Part 1). The commits below are not upstream. They make a graphic keep up with live data:
a Nodos Track pin at 60 Hz, a Function, a 97-parameter full-screen shader. Each section says what was slow or broken, what
the commit changes, what it was measured to do, which contract it touches, and what a reviewer should check.

Hashes are the commits on this branch (`perf/0.40-optimizations`). Measurements are from Tracking QA on Studio's own
`nodos.html` in headless Chromium (ANGLE D3D11, RTX A6000) fed a recorded 60 Hz Track, 2026-10-28 to 2026-11-15, on the
0.23 to 0.34 lines; the code was carried to 0.40 unchanged except where noted.

## Summary

| Commit                          | Change                                                                                          | Gain                                         | Contract touched                                               | Proposal                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------ |
| `839a0b3`                       | Realtime updates return when mounted, touch only affected layers, wait for their Function calls | 6.4 → 24.8 updates/s                         | realtime `updateAction` no longer waits for completed GPU work | take, it uses 0.40's `gpuWork:'submitted'` |
| `a9935cb`                       | Reuse the Function Worker during realtime playback                                              | 24.8 → 51.3 updates/s; 14.5 → ~1 ms per call | global state can survive between calls                         | discuss                                    |
| `9dfeae0`                       | Re-sample only the layers a data refresh can affect                                             | 51.3 → 62.3 updates/s; p50 17.5 → 6.2 ms     | none (falls back to full re-sample)                            | take                                       |
| `1b5de29`                       | Function sandbox token from `getRandomValues`                                                   | Functions load on plain HTTP                 | none                                                           | take                                       |
| `a3bdf00`                       | Functions run in the page when a CSP forbids the sandbox                                        | Functions load in Reality Hub                | isolation and timeout differ                                   | discuss                                    |
| `fdbbd60`                       | Runtime takes data pins from the hosting ElectroNode                                            | pins reach graphics in any host              | who owns the Nodos bridge                                      | discuss                                    |
| `b91a68e`                       | Pin values stamped on arrival                                                                   | jitter buffers can place samples             | adds a timestamp to pin data                                   | with `fdbbd60`                             |
| `a7af0dc`, `059d1bb`            | `iClock` for realtime shaders, `clockOriginMs` for Functions                                    | shader and Function share one clock          | new inputs; realtime vs deterministic                          | API proposal                               |
| `0a3c1fc`, `2993854`, `c2314df` | Realtime shader layers get their own context, draw once per frame                               | 268 full-frame copies/s gone; GPU 25 → 14%   | none outside realtime pages                                    | take                                       |

Throughput with the first three together (recorded 60 Hz Track, 12 s):

| Build       | Updates done / sent per s | Update p50 | Backlog after 12 s |
| ----------- | ------------------------- | ---------- | ------------------ |
| Upstream    | 6.4 / 24.6                | 139 ms     | 218                |
| + `839a0b3` | 24.8 / 43.8               | 42 ms      | 227                |
| + `a9935cb` | 51.3 / 52.9               | 17.5 ms    | 19                 |
| + `9dfeae0` | 62.3 / 62.4               | 6.2 ms     | 1                  |

Upstream drops five of every six samples and runs more than 100 ms behind its own data. With the three commits it keeps up.

## Data rate

### `839a0b3` Keep realtime updates at the data rate

**Problem.** A realtime `updateAction` waited for a GPU fence for every shader before it resolved, so the update rate
equalled the slowest shader's frame time. Every data change re-resolved every layer in four passes. A fast feed overflowed
the 64 pending Function calls, and the overflow failed updates.

**Change.** A realtime update resolves once content is mounted (`gpuWork:'submitted'`, the 0.40 option); seeks and captures
still wait for completed GPU work, so pixels that are compared or saved are exact. A refresh resolves only layers that read
the changed keys; Rules, collections and rule targets are always included. An update waits for the Function calls it
triggers, so a fast feed is paced instead of overflowing.

**Why needed.** Without it no realtime graphic with a shader can follow a 60 Hz source.

**Risk.** A host that relied on `updateAction` resolving only after the new pixels were on the GPU now gets the promise
earlier. Nothing in the OGraf spec promises that, and non-realtime rendering is unchanged. Check: a capture right after a
realtime update still waits (it goes through the capture path, not the update promise).

### `a9935cb` Keep Function realms warm during realtime playback

**Problem.** Every Function call ran in a new Worker realm. The engine never got past its interpreter: a Function that costs
0.7 ms warm took 14.5 ms per call.

**Change.** In realtime playback the Worker is reused after a successful call. The source is evaluated anew each call, so a
closure from the previous call is not reused. A failure or timeout still terminates the Worker. Non-realtime renders keep a
fresh realm per call.

**Why needed.** It halves the remaining update cost and is what moves the feed from 25 to 51 updates per second.

**Risk, and why the review held it.** A Function that writes a global (`globalThis.n = (globalThis.n ?? 0) + 1`) reads `[1,2]`
over two calls instead of `[1,1]`. Authors could start to depend on that, and the same Function would behave differently in
non-realtime. Options for upstream: freeze or reset `globalThis` between calls, or document state as undefined and make the
author keep it in the Function's `state` argument (the supported way).

### `9dfeae0` Re-sample only the layers a data refresh can affect

**Problem.** After every refresh the loop snapshot re-sampled, text-fitted and re-applied every layer.

**Change.** When no layer depends on another (no auto layout, motion path, modifier, clip parent or mask) and no transition
runs, only layers that read the changed keys are re-sampled; collection visibility follows. Otherwise the full pass runs.

**Why needed.** The last step to 62 updates per second; it also cuts main-thread time for every data-driven graphic.

**Risk.** Low: the narrow path is taken only when the dependency check says it is safe. A missed dependency would show as a
layer that does not update; the test to add is one graphic per dependency kind.

## Reality Hub and other hosts

### `1b5de29` Run Functions on plain HTTP pages

**Problem.** The sandbox token used `crypto.randomUUID`, which exists only in secure contexts. Players that serve packages
over plain HTTP (Reality Hub) could not load any graphic with a Function.

**Change.** 128 bits from `crypto.getRandomValues`, available everywhere.

**Risk.** None found; same entropy.

### `a3bdf00` Run Functions in the page where the CSP forbids the sandbox

**Problem.** Reality Hub's renderer sets `script-src 'self' 'unsafe-eval'` and `worker-src 'none'`. The isolated sandbox (an
inline-bootstrapped `srcdoc` frame with `blob:` Workers) never starts, and every graphic with a Function fails with
"Isolated frame did not start".

**Change.** When a CSP `<meta>` forbids inline scripts or `blob:` workers, Functions run in the page with the same contract:
JSON-only context and result, size limits, fresh source per call, and the execution budget checked after the call.

**Why needed.** Without it, Functions do not work in Reality Hub at all.

**Risk, and why the review held it.** The isolation is weaker: a Function runs with the page's globals, and a runaway loop
cannot be stopped mid-call (the budget is checked after it returns, where a Worker would be terminated). Acceptable only
because a Function is part of the authored graphic, not third-party input. Better long-term fix: the host allows the
sandbox (`worker-src blob:`), or the runtime ships its Worker as a file instead of a `blob:`.

### `fdbbd60` Take data pins from the hosting ElectroNode in any host page

**Problem.** Only Studio's own `nodos.html` forwarded `window.nodos.onData` to the graphic. In Reality Hub's channel the
graphic runs in an ElectroNode, but typed data pins never reached it.

**Change.** When the host does not forward pins, the runtime subscribes once per page and hands each loaded realtime graphic
the pins that match its data fields: one update at a time, latest value wins, and a host update does not overwrite a field a
pin has set. Studio's Nodos page keeps doing it itself.

**Risk, and why the review held it.** It decides an ownership question: should the runtime or the host own the Nodos
bridge? Two subscribers would double updates; the commit detects Studio's page, but another host that forwards pins
differently could still conflict. Upstream needs to pick the owner; a flag on the manifest or the host is one way.

### `b91a68e` Stamp Nodos pin values as the page receives them

**Problem.** Pins were timed when the Function ran, up to a frame after they arrived, so a jitter buffer could not tell
samples apart.

**Change.** Each pin value carries its arrival time on the page clock. Goes with `fdbbd60`.

**Risk.** Adds a field to pin data a Function receives; additive.

## Clocks

### `a7af0dc` `iClock` for realtime shaders, `059d1bb` `clockOriginMs` for Functions

**Problem.** `iTime` counts from playback start and Functions' `nowMs` from runtime start, so a shader cannot place samples a
Function timed (or pins stamped) on its own timeline.

**Change.** Realtime shaders get `iClock`, the page's epoch clock in seconds modulo 4096, set every frame. Functions get
`clockOriginMs`, where their clock starts on that page clock. A shader can then draw a jitter buffer a fixed delay behind now.

**Risk, and why the review held it.** `iClock` is wall time, so a deterministic (non-realtime) render cannot reproduce it.
Upstream should define it as realtime-only, or as playback time plus a fixed origin in non-realtime. `clockOriginMs` alone
is a small API proposal.

## Shader drawing

### `0a3c1fc`, `2993854`, `c2314df` Realtime shader layers on their own contexts, once per frame

**Problem.** 0.30 draws every shader layer on one shared WebGL context and copies each into its canvas with `drawImage`: 268
full-frame copies a second on Tracking QA. Parameter updates drew at once, so data and Function ticks caused about 270 draws
per second for 60 frames, and a shader fill drew twice a frame (update and animation tick).

**Change.** A realtime page renders one graphic, so `GraphicElement` marks it and its shader layers (up to eight) get their
own contexts. Updates mark a layer dirty and draw once per frame, skipped when the animation loop drew within 20 ms; a static
shader still gets its updates (`c2314df`). Editor stages keep the shared context.

**Measured.** AR layer 2 draws per frame → 1; GPU 25 → 14% with every AR part on.

**Risk.** More WebGL contexts per page (browsers cap them around 16); the cap of eight leaves room. A page with several
realtime graphics would need the shared path again.

## What a reviewer can run

```sh
npm ci
npm run build --workspace @ograf-editor/ograf-runtime
npx vitest run packages/ograf-runtime
```

The tests that fail without each commit are in `logicFunctionSandbox.test.ts`, `logicFunctionInline.test.ts`,
`GraphicElement.logicFunctions.test.ts`, `nodosPins.test.ts`, `shaderRendering.test.ts` and `shaderPaintRendering.test.ts`.
`839a0b3` and `9dfeae0` have no dedicated test yet; the throughput numbers above are their evidence.

## Suggested order for upstream

1. `1b5de29` and the three shader commits: no contract change.
2. `9dfeae0` and `839a0b3`: realtime-only, use 0.40's own `gpuWork` option.
3. `059d1bb` `clockOriginMs` as an API proposal, then `iClock` once its non-realtime meaning is agreed.
4. Discuss with owners: warm realms (`a9935cb`), the in-page CSP fallback (`a3bdf00`), the pin bridge (`fdbbd60`, `b91a68e`).
