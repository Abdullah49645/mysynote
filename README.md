Mysynote

Agent-native Web Audio studio for the WebMCP Challenge 2026.

Sound design, with an agent in the room.

Mysynote is a browser-based modular synthesizer where humans and AI agents can work with the same live sound-design state. Agents can inspect the current patch, manipulate modules and connections, analyze the sound, and respect constraints placed by the user.

Live Demo

Production: https://mysynote.vercel.app

Mysynote is deployed as a standard Next.js application and exposes its agent capabilities through the WebMCP document.modelContext API.

Run Locally

npm install
npm run dev

Open http://localhost:3000, then press Play to hear the default patch:

Sequencer → Oscillator → Filter → Distortion → Delay → Master

What Mysynote Does

Mysynote combines a hands-on modular synthesizer with an agent-accessible control surface.

Real Web Audio engine

lib/webaudio-engine.ts implements the synthesizer using real Web Audio API nodes. The audio graph is reconciled from the application’s authoritative state whenever the graph changes.

One authoritative graph state

lib/synth-graph.ts provides the central GraphStore.

The UI, Web Audio engine, built-in agent, and WebMCP tools operate against the same underlying state rather than maintaining separate representations of the patch.

This allows an agent to inspect the same state the human is currently seeing and modifying.

Human-controlled modular synthesis

Everything exposed to the agent is also usable directly by the human.

The interface supports:

* Adding modules from the module palette
* Dragging connections between module ports
* Removing cables
* Removing modules
* Adjusting parameters
* Locking individual parameters
* Editing the 8-step sequencer
* Resetting to the deterministic demo patch

Real modulation routing

The default patch includes a genuine LFO-to-filter-cutoff modulation connection.

The LFO is connected to the filter’s cutoff AudioParam rather than being treated as an ordinary audio connection. This same modulation route is represented in the graph state exposed to agents.

Parameter locks

Parameter locking is a core part of the human-agent interaction.

Every parameter can be locked by the human. A WebMCP or built-in agent attempting to modify a locked parameter receives a structured PARAMETER_LOCKED rejection from the underlying graph store.

For example:

“Lock my oscillator pitch, then make the sound warmer without changing the oscillator pitch or waveform.”

The agent must work around the user’s constraint rather than simply being instructed to remember it.

Rejected writes are also surfaced visibly on the relevant control in the UI.

Spectrum analysis

Mysynote exposes real-time spectrum information through a real AnalyserNode, including:

* Peak frequency
* Peak amplitude
* Low-band energy
* Mid-band energy
* High-band energy
* Clipping information

This gives agents access to information about the resulting sound rather than only the synthesizer’s parameter values.

Built-in acceptance self-test

The SELF-TEST control runs checks against the live graph and audio engine, including:

* Parameter-lock enforcement
* Module spawn/patch/remove behavior
* Spectrum analysis output
* Invalid module/parameter handling
* Graph state consistency

Results are surfaced through the Agent Activity panel.

WebMCP

Mysynote exposes its synthesizer as a real WebMCP tool surface through:

document.modelContext.registerTool({
  name: "...",
  description: "...",
  inputSchema: { /* ... */ },
  execute: async (input) => { /* ... */ }
});

The current tool surface contains 12 tools:

clear_graph
get_audio_graph_state
get_sequencer_state
get_spectrum_analysis
lock_parameter
patch_cable
remove_cable
remove_module
set_module_param
set_sequencer_step
spawn_module
unlock_parameter

These tools allow an agent to reason about and manipulate the actual synthesizer rather than attempting to operate the interface through clicks and visual guessing.

Verified WebMCP integration

The production deployment has been tested in Chrome with WebMCP enabled.

The following has been verified against the live application:

* document.modelContext is available.
* The WebMCP API exposes getTools, registerTool, and executeTool.
* Mysynote registers all 12 tools.
* get_audio_graph_state can be discovered through getTools().
* get_audio_graph_state has been successfully executed through the browser’s WebMCP API.
* The returned result contains the live audio graph, including modules, parameters, connections, sequencer state, and transport state.

The WebMCP implementation is therefore not a simulated UI indicator; the deployed application exposes executable WebMCP tools.

Built-in Gemini Agent

Mysynote also includes an in-app Gemini-powered agent.

This provides a second way to experience the agent interaction without requiring the user to operate a WebMCP-enabled browser.

The agent can:

1. Inspect the current synth state.
2. Decide which tools to use.
3. Modify the graph.
4. Respect parameter locks.
5. Report its actions through the Agent Activity panel.

To use it:

1. Obtain a Gemini API key.
2. Open Mysynote.
3. Paste the key into the Gemini API key field.
4. Enter a natural-language sound-design request.
5. Press Send.

For example:

“Make this warmer and wider, but don’t touch the oscillator pitch or waveform.”

The key is entered directly by the user and is intended to remain client-side rather than being stored as a server-side environment variable.

Why both Gemini and WebMCP?

The built-in Gemini agent demonstrates an agent operating inside the application, while WebMCP exposes the same underlying capabilities to compatible external agents.

The goal is not simply to add an AI chatbot to a synthesizer.

The goal is to make the synthesizer itself agent-accessible.

Agent Activity

The Agent Activity panel provides visible feedback about operations performed by the human and agent.

It intentionally shows concise action-level information rather than exposing chain-of-thought.

Examples include:

Read current audio graph
Set filter cutoff
Set distortion drive
Locked oscillator frequency
Rejected write: PARAMETER_LOCKED

This makes agent actions observable and gives the user a clear indication of what actually happened to the patch.

Architecture

                     ┌──────────────────────┐
                     │      Human UI        │
                     └──────────┬───────────┘
                                │
                                ▼
                     ┌──────────────────────┐
                     │     GraphStore       │
                     │  authoritative state │
                     └───────┬───────┬──────┘
                             │       │
                ┌────────────┘       └─────────────┐
                ▼                                  ▼
       ┌─────────────────┐                ┌─────────────────┐
       │  Web Audio      │                │  Agent Tools    │
       │  Engine         │                │                 │
       └─────────────────┘                └────────┬────────┘
                                                   │
                                  ┌────────────────┴──────────────┐
                                  ▼                               ▼
                         Built-in Gemini                  External WebMCP
                              Agent                           Agents

The important architectural property is that these paths converge on the same underlying graph operations.

There is no separate fake “agent state” used only for demonstrations.

Local Development Harness

For development environments where WebMCP is unavailable, Mysynote also exposes the underlying tool implementations through:

window.__mysynoteDevTools

Examples:

window.__mysynoteDevTools.get_audio_graph_state()
window.__mysynoteDevTools.set_module_param(
  "filter-1",
  "cutoff",
  800
)
window.__mysynoteDevTools.spawn_module(
  "delay",
  900,
  400
)

The application header reports whether the browser’s document.modelContext API is currently detected.

Acceptance Checks

The project includes validation for the core agent interaction:

* App boots into a ready state.
* Play starts the sequencer.
* Parameter locks prevent protected writes.
* Modules can be spawned and removed.
* Cables can be created and removed.
* Spectrum analysis is sourced from the Web Audio analyser.
* UI parameter changes are immediately reflected in graph state.
* WebMCP tools expose the same underlying operations.

The production WebMCP surface has additionally been manually exercised in a WebMCP-enabled Chrome environment.

Design

Mysynote uses a dark studio-style interface inspired by physical modular hardware.

The visual language separates different interaction types:

* Cyan — agent/output signal
* Magenta — human/lock actions
* Amber — the Mysynote note mark and selected signature elements

Modules are presented as rack-style panels with visible ports and animated cables. Cable activity responds to actual sequencer playback rather than relying on purely decorative animation.

The interface is intentionally information-dense enough to make the state of the synthesizer understandable to both the human and the agent.

Project Scope

Mysynote intentionally focuses on agent-assisted sound design rather than attempting to become a full DAW.

Out of scope:

* Full DAW timeline
* Multi-track recording
* MIDI import
* Piano roll
* User accounts
* Cloud project storage
* Payments
* Multi-user collaboration
* AI-generated songs or lyrics

The focus is the interaction between:

human intent → live synthesizer state → agent actions → audible result

Deployment

Mysynote is a standard Next.js application and can be deployed to Vercel, Netlify, Cloudflare, Render, or another compatible hosting provider.

For Vercel:

1. Import the repository.
2. Select the Next.js preset.
3. Use the default build settings.
4. Deploy.

The production deployment currently runs at:

https://mysynote.vercel.app

The Gemini API key is entered by the user at runtime, so no Gemini environment variable is required for the deployment.

Open Source

Mysynote is released under the MIT License.

See LICENSE.

Challenge

Built for the WebMCP Challenge 2026.

The project explores a simple question:

What changes when an AI agent isn’t just telling you how to use a creative tool, but can actually operate the live tool alongside you?

Mysynote’s answer is a synthesizer where the agent can inspect the current graph, make structured changes, analyze the resulting sound, and work within constraints established by the human.
