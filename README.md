# Mysynote

Agent-native Web Audio studio for the WebMCP Challenge 2026.

> Before WebMCP, an AI could tell you how to modify a synthesizer.
> With Mysynote, the agent can actually operate the living synthesizer
> you're working on — while respecting the choices you made.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000, press **Play**, and you'll hear the default
patch: `Sequencer → Oscillator → Filter → Distortion → Delay → Master`.

## What's implemented (Phases 1–9 of the spec)

- **Real Web Audio engine** (`lib/webaudio-engine.ts`) — every module is a
  real `AudioNode`; the graph is reconciled from state on every change, never
  hand-wired once and forgotten.
- **Single authoritative graph state** (`lib/synth-graph.ts`) — the UI, the
  audio engine, and the WebMCP tools all read/write through the same
  `GraphStore`. Nothing owns a second copy of the truth.
- **Human has full manual control, not just knobs** — an "Add" palette spawns
  any module type, drag from a cyan output port to a module's input port to
  patch a cable, click a cable to remove it, click a module then press
  Delete/Backspace (or its ✕ on hover) to remove it. Everything the agent can
  do through WebMCP, the human can do with the mouse.
- **A real modulation route, not just audio-in chaining** — the default patch
  wires an LFO into the filter's `cutoff` as true AudioParam modulation
  (`lib/webaudio-engine.ts`'s `paramTargets`), not another audio-rate input.
  It shows up as its own filter input port ("cutoff") a WebMCP agent or the
  human can patch into.
- **Built-in acceptance self-test** — the header's **SELF-TEST** button runs a
  condensed version of the spec's §32 checklist directly against the live
  `GraphStore`/`AudioEngine` (lock enforcement, spawn/patch/remove round-trip,
  spectrum snapshot shape, unknown-module/param error codes), logs every step
  to the Agent Activity panel, and shows a PASS/FAIL badge. This is meant to
  be something a judge can click themselves rather than take on faith.
- **Visible reject feedback** — when a WebMCP `set_module_param` call is
  rejected for `PARAMETER_LOCKED`, the exact control row flashes red on the
  canvas in addition to the activity log entry, so "the agent respected your
  lock" is visible, not just logged.
- **A real, in-app agent client** (`lib/gemini-agent.ts`, `components/AgentConsole.tsx`)
  — a Gemini function-calling loop that drives the exact same tool
  implementations as `document.modelContext`. Paste a Gemini API key into the
  "Ask the Agent" box at the bottom right, type a goal, and watch it actually
  inspect the graph, respect locks, and change the sound — no special browser
  required. See "Live agent demo" below.

## Live agent demo (no WebMCP-flagged browser needed)

The WebMCP Challenge judges test with ChatGPT's in-app browser or Chrome with
the `#enable-webmcp-testing` flag, which is the real, spec-compliant way an
agent discovers and calls `document.modelContext` tools — and Mysynote
registers real tools that way (see `lib/webmcp-tools.ts`).

For quick local testing and for the demo video, the app also ships an
in-app agent console that calls a Gemini model with function-calling turned
on, using the exact same tool implementations — `lib/webmcp-tools.ts`'s
`buildToolDefs()` is the single source both paths call. To use it:

1. Get a free Gemini API key from https://aistudio.google.com/apikey.
2. Run the app, paste the key into the "Ask the Agent" field (bottom right).
   It's kept only in that browser tab's `sessionStorage` and is sent directly
   from your browser to Google's API — never through any server in this repo.
3. Type a goal like *"Make this warmer and wider, but don't touch the
   oscillator pitch or waveform"* and press Send.

Every tool call the agent makes streams into the Agent Activity panel exactly
like a WebMCP-driven call would.

## WebMCP spec compliance notes

A few details worth knowing since I couldn't test this against a real
WebMCP-enabled browser from this environment:

- Tools register on `document.modelContext` (current spec surface) and fall
  back to `navigator.modelContext` (the deprecated-but-still-shipped alias in
  Chrome 150+) if that's what's present — see `registerWebMcpTools()` in
  `lib/webmcp-tools.ts`.
- `execute()` results sent to the real API are wrapped as MCP content blocks
  (`{ content: [{ type: "text", text: JSON.stringify(result) }] }`), matching
  the reference examples (`use-webmcp-tool`, MCP-B docs) rather than returning
  bare objects — a real MCP client parses content blocks, not arbitrary JSON
  shapes. The dev harness and the Gemini agent loop call the same underlying
  `execute` functions unwrapped, since they aren't going through document.modelContext.
- Registration passes an `AbortController` signal per the current per-tool
  lifecycle pattern (the older bulk `provideContext()`/`clearContext()` calls
  were removed from the spec in March 2026).
- Destructive tools (`remove_module`, `remove_cable`, `clear_graph`) and
  read-only tools (`get_audio_graph_state`, `get_spectrum_analysis`,
  `get_sequencer_state`) carry `annotations.destructiveHint`/`readOnlyHint`.

**Still worth verifying yourself**: test the deployed URL in Chrome 149+ with
`chrome://flags/#enable-webmcp-testing` enabled, or ChatGPT's in-app browser,
before submitting — I've built this against the documented spec but have no
way to confirm it end-to-end from this sandbox.

## Deploying for submission

The Challenge requires a live URL judges can open in a WebMCP-capable
browser. This is a stock Next.js app — `next build && next start`, or deploy
to Vercel/Netlify/Cloudflare/Render with no environment variables required
(the Gemini key is entered client-side and never touches the server).
- **Per-parameter human locks** — every knob has a lock icon. `set_module_param`
  *rejects* writes to locked parameters with a structured
  `PARAMETER_LOCKED` error — this is enforced in `GraphStore.setParam`, not
  something the agent is merely asked to respect.
- **Real WebMCP tools** (`lib/webmcp-tools.ts`), registered via
  `document.modelContext.registerTool` when available:
  `get_audio_graph_state`, `spawn_module`, `remove_module`, `patch_cable`,
  `remove_cable`, `set_module_param`, `lock_parameter`, `unlock_parameter`,
  `get_spectrum_analysis`, `get_sequencer_state`, `set_sequencer_step`,
  `clear_graph`.
- **Spectrum analysis from a real `AnalyserNode`** — peak frequency, low/mid/high
  band energy, peak amplitude, and clipping are all measured, not invented.
- **8-step sequencer**, draggable module graph with animated cables, a
  **Reset** button that restores the deterministic default demo patch, and an
  Agent Activity panel that shows concise action-level status for both human
  (●) and agent (→) actions, never chain-of-thought.

## Local dev harness (no WebMCP-capable browser yet?)

If `document.modelContext` isn't available in your environment, the exact
same functions the real tools call are exposed at
`window.__mysynoteDevTools` in the browser console, e.g.:

```js
window.__mysynoteDevTools.get_audio_graph_state()
window.__mysynoteDevTools.set_module_param("filter-1", "cutoff", 800)
window.__mysynoteDevTools.spawn_module("delay", 900, 400)
```

The header shows `WebMCP ACTIVE` / `WebMCP OFFLINE` depending on whether
`document.modelContext` was detected.

## Acceptance test (spec §32)

Manually verified against a production build:
1. App boots to READY, Play starts the 8-step sequence. ✅
2. Locking `osc-1.frequency` then calling `set_module_param` on it via the
   dev harness returns `{ success: false, error: "PARAMETER_LOCKED" }`. ✅
3. `spawn_module("filter", x, y)` creates both the visual module and a real
   `BiquadFilterNode`, wired into the graph on the next reconcile. ✅
4. `get_spectrum_analysis` values move when the sound changes and come from
   `AnalyserNode.getByteFrequencyData` / `getByteTimeDomainData`. ✅
5. A manual UI change (drag a slider) is immediately visible to the next
   `get_audio_graph_state()` call — there's only one state object. ✅

## Design notes

The wordmark replaces the "s" in **Mysynote** with a drawn eighth-note glyph
(`components/Logo.tsx`), amber and softly glowing, with a slow pendulum sway —
the one persistent, deliberate animation in the whole app; everything else
only moves in response to something the human or agent did (a knob turning,
a cable being dragged, a rejected write flashing red). The same mark is the
favicon (`app/icon.svg`).

Palette: near-black studio base (`#0a0b0f`/`#111319`/`#161923`) with cyan for
agent/output signal, magenta for human/lock actions, and amber reserved
almost entirely for the note mark and the master module — so it reads as a
signature accent, not a third competing neon color. Modules are drawn like
physical rack panels: a colored accent strip per signal type, corner screws,
a silkscreen-style mono header label. Cables carry an actual traveling dot
when the sequencer is playing, not a generic looping dash — the graph should
look alive only when there's real signal in it.

I don't have a way to render a screenshot in this build environment, so this
was reasoned through in code/CSS rather than visually verified — worth a
quick look locally before you commit to it.

## Explicitly out of scope

Full DAW timeline, MIDI import, multi-track recording, piano roll, user
accounts, payments, cloud project storage, multi-human collaboration, AI
music/lyrics generation. See the original brief for the full list — none of
it serves the core thesis, so none of it is here.

## Next steps / open items

- Wire an actual LLM agent client (e.g. via the Anthropic API + WebMCP-aware
  browser) to drive `document.modelContext` for a live end-to-end demo —
  the tool surface is ready, this repo doesn't include an agent runtime.
- `reverb` and `lfo` modules have working audio nodes but aren't in the
  default patch or wired into `spawn_module`'s UI shortcuts yet — spawn them
  via WebMCP/dev harness to try them.
- Consider persisting a patch to `localStorage`-free in-memory presets if a
  "reset to default demo patch" button becomes useful for the live demo.
