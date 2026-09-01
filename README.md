# Mysynote

**Sound design, with an agent in the room.**

Mysynote is a browser-native sound-design studio where a human and an AI agent
operate the *same live* Web Audio graph — not a chat window next to a
synthesizer, one shared instrument both can act on, in real time, through
[WebMCP](https://github.com/webmachinelearning/webmcp).

Built for the [OpenAI WebMCP Challenge](https://webmcp.devpost.com).

---

## Why WebMCP fits this problem

Before WebMCP, an AI could only *describe* how to modify a synthesizer —
"lower the cutoff, add some drive" — and a person had to translate that back
into clicks. There was no shared, structured state an agent could inspect or
safely act on, so "AI-assisted" creative tools were really just AI-narrated
tools.

WebMCP changes what's possible in a specific way: the browser can expose the
*actual* structured state of an app — not a scraped DOM, not a guessed UI
affordance — as tools an agent calls directly, with real inputs, real
outputs, and enforceable constraints. Mysynote is built to make that
difference undeniable in under a minute of use:

- **The agent inspects real state**, not a screenshot or a text description —
  `get_audio_graph_state` returns the actual module graph, parameter values,
  lock states, cable routing, and sequencer pattern.
- **The agent acts on the real instrument**, not a simulation of it —
  `set_module_param`, `patch_cable`, and `spawn_module` mutate the same
  `AudioNode` graph that's actually making sound, live.
- **The human's constraints are enforced by the tool, not by the agent's good
  behavior.** Lock a parameter and `set_module_param` rejects the write with
  a structured `PARAMETER_LOCKED` error — the agent cannot talk its way past
  it, because the constraint lives in the tool implementation, not in a
  system prompt it could ignore or misread.

That last point is the crux of the pitch: **WebMCP doesn't just let an agent
do things a human could do faster — it lets a human define hard boundaries an
agent is structurally unable to cross, while still collaborating in real
time.** That's a new capability, not an accelerated old one.

## What people and agents can now do together

- A person builds and tweaks a patch by hand — dragging modules, patching
  cables, turning knobs — exactly as before.
- They lock the parameters they've deliberately chosen (say, the oscillator's
  pitch and waveform) and hand the rest to an agent: *"make this darker and
  wider, don't touch what I locked."*
- The agent reads the live graph, works around the locked parameters,
  changes what's actually allowed, and checks its own work against a real
  spectrum analysis — not a description of one.
- The person can interrupt at any point — drag a slider mid-agent-turn — and
  the agent's next `get_audio_graph_state` call sees that change immediately,
  because there's only one graph, not two that need reconciling.

This pattern — shared live state, human-authored hard constraints, agent
acting within them — generalizes well beyond audio: any creative or
productivity tool where "let the AI help, but not with *that*" is a real
need is a candidate for the same approach.

## How WebMCP is implemented

Every tool is registered with the real browser API:

```js
document.modelContext.registerTool({
  name: "set_module_param",
  description: "Sets a parameter on a module...",
  inputSchema: { type: "object", properties: { /* ... */ }, required: [/* ... */] },
  execute: async (input) => { /* ... */ }
});
```

See [`lib/webmcp-tools.ts`](./lib/webmcp-tools.ts) for the full set. Mysynote
registers 12 tools covering graph inspection, module/cable creation and
removal, parameter get/set with lock enforcement, spectrum analysis, and
sequencer control:

`get_audio_graph_state` · `spawn_module` · `remove_module` · `patch_cable` ·
`remove_cable` · `set_module_param` · `lock_parameter` · `unlock_parameter` ·
`get_spectrum_analysis` · `get_sequencer_state` · `set_sequencer_step` ·
`clear_graph`

A few implementation details worth knowing:

- **One implementation, every consumer.** `buildToolDefs()` in
  `lib/webmcp-tools.ts` is the single source of truth. `document.modelContext`,
  a local dev harness (`window.__mysynoteDevTools`), and the in-app Gemini
  agent (below) all call the exact same functions — there's no second,
  simplified implementation anywhere that could drift from what a real agent
  gets.
- **Spec-correct return shape.** Results returned to `document.modelContext`
  are wrapped as MCP content blocks (`{ content: [{ type: "text", text }] }`),
  matching the reference implementations rather than returning bare objects.
- **Registers on both current API surfaces.** Checks `document.modelContext`
  first, falls back to `navigator.modelContext` (the older, still-shipped
  alias), and passes an `AbortController` signal per the current per-tool
  registration lifecycle.
- **Locks are enforced in the tool, not the prompt.** `GraphStore.setParam`
  rejects a write to a locked parameter before it ever reaches the audio
  engine — see [`lib/synth-graph.ts`](./lib/synth-graph.ts).

**Verified working**: tested directly against Chrome 149+ with
`chrome://flags/#enable-webmcp-testing` enabled — `document.modelContext`
returns a real `ModelContext` object, `getTools()` lists all 12 registered
tools, and `executeTool()` successfully returns the live audio graph state.

## A live agent, without requiring a paid API

Since judges test through ChatGPT's in-app browser or WebMCP-enabled Chrome,
the WebMCP tools above don't depend on any specific AI provider — that's the
point of the standard. For anyone testing locally or wanting a live demo
without a WebMCP-enabled browser on hand, Mysynote also ships an in-app agent
console (bottom right) that runs a real function-calling loop against the
*same* tool implementations, with a choice of provider: **Gemini** or
**Claude** (Anthropic). Paste your own API key, type a goal, and watch it
inspect the graph, respect your locks, and change the sound — no server, no
stored key (kept in that browser tab's `sessionStorage` only, per provider).

**Why not OpenAI too?** We looked into it. OpenAI's Chat Completions/Responses
API doesn't support direct browser-to-API requests — there's no CORS opt-in
the way Gemini and Anthropic both provide (Anthropic explicitly ships an
`anthropic-dangerous-direct-browser-access` header for exactly this use case).
Adding an OpenAI option without a server-side proxy holding the key would mean
shipping a button that fails for every user with a cryptic CORS error, so we
left it out rather than ship something broken. A proxy is a reasonable follow
-up if it's ever worth the added backend dependency.

## Running locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`, press **Play**, and you'll hear the default
patch: `Sequencer → Oscillator → Filter (LFO-modulated cutoff) → Distortion →
Delay → Master`.

No environment variables or backend are required — the audio engine is
100% client-side Web Audio, and the optional Gemini key is entered in the UI.

## What's in the box

- **Real Web Audio engine** (`lib/webaudio-engine.ts`) — every module is a
  real `AudioNode`; the graph is reconciled from state on every change.
- **Single authoritative state** (`lib/synth-graph.ts`) — the UI, the audio
  engine, and every tool path read/write through one `GraphStore`.
- **Full manual control for the human**, matching what the agent can do —
  spawn any module, drag-patch cables between ports, delete modules/cables,
  lock/unlock any parameter.
- **Real modulation routing** — an LFO modulates the filter's cutoff via a
  genuine `AudioParam` connection, not another audio-signal input.
- **Built-in acceptance self-test** — the header's **Self-test** button runs
  a condensed version of a full acceptance checklist against the live
  store/engine and reports pass/fail, so correctness isn't just asserted.
- **8-step sequencer**, draggable graph with animated signal-flow cables, and
  an Agent Activity log showing concise, human-readable actions — never raw
  chain-of-thought.

## Explicitly out of scope

Full DAW timeline, MIDI import, multi-track recording, piano roll, user
accounts, payments, cloud project storage, multi-human collaboration, AI
music/lyrics generation. None of it serves the core thesis — a human and an
agent sharing one live, constrained instrument — so none of it is here.

## License

[MIT](./LICENSE)
