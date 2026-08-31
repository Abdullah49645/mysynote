import { ToolDef } from "./webmcp-tools";

/**
 * Gemini's function-calling schema only allows a single scalar `type` per
 * property (no unions), so this is a hand-authored mirror of buildToolDefs'
 * inputSchema — same tool names and semantics, flattened to what the Gemini
 * REST API accepts. The *execution* still goes through the exact same
 * `execute` functions from webmcp-tools.ts; only the declaration shape
 * differs here.
 */
export const GEMINI_TOOL_DECLARATIONS = [
  {
    name: "get_audio_graph_state",
    description:
      "Returns the complete current state of the Mysynote synth graph: every module, its type, position, parameter values, lock states, cable connections, sequencer pattern, and transport state. Always call this first and after any manual human change, so you never operate on stale information.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "spawn_module",
    description: "Creates a new synth module at a canvas position and wires up a real Web Audio node for it.",
    parameters: {
      type: "object",
      properties: {
        moduleType: {
          type: "string",
          enum: ["oscillator", "filter", "lfo", "distortion", "delay", "reverb", "gain"],
        },
        positionX: { type: "number" },
        positionY: { type: "number" },
      },
      required: ["moduleType", "positionX", "positionY"],
    },
  },
  {
    name: "remove_module",
    description: "Deletes a module and any cables connected to it.",
    parameters: {
      type: "object",
      properties: { moduleId: { type: "string" } },
      required: ["moduleId"],
    },
  },
  {
    name: "patch_cable",
    description:
      "Connects a module's output port to another module's input port. Some inputs are modulation targets (e.g. a filter's \"cutoff\") rather than audio inputs (\"in\") — check the module's `inputs` array from get_audio_graph_state.",
    parameters: {
      type: "object",
      properties: {
        sourceModuleId: { type: "string" },
        sourceOutput: { type: "string" },
        targetModuleId: { type: "string" },
        targetInput: { type: "string" },
      },
      required: ["sourceModuleId", "sourceOutput", "targetModuleId", "targetInput"],
    },
  },
  {
    name: "remove_cable",
    description: "Removes a single cable connection by its id.",
    parameters: {
      type: "object",
      properties: { connectionId: { type: "string" } },
      required: ["connectionId"],
    },
  },
  {
    name: "set_module_param",
    description:
      "Sets a parameter on a module. Fails with PARAMETER_LOCKED if the human locked it — never retry a locked parameter, find another route instead. Pass value as a string; numeric params (e.g. \"440\") are coerced automatically.",
    parameters: {
      type: "object",
      properties: {
        moduleId: { type: "string" },
        paramName: { type: "string" },
        value: { type: "string" },
      },
      required: ["moduleId", "paramName", "value"],
    },
  },
  {
    name: "lock_parameter",
    description: "Locks a parameter so it can no longer be changed until unlocked.",
    parameters: {
      type: "object",
      properties: { moduleId: { type: "string" }, paramName: { type: "string" } },
      required: ["moduleId", "paramName"],
    },
  },
  {
    name: "unlock_parameter",
    description: "Unlocks a previously locked parameter.",
    parameters: {
      type: "object",
      properties: { moduleId: { type: "string" }, paramName: { type: "string" } },
      required: ["moduleId", "paramName"],
    },
  },
  {
    name: "get_spectrum_analysis",
    description:
      "Returns a real-time snapshot from the actual audio analyser: peak frequency, low/mid/high band energy, peak amplitude, and clipping. Use this to verify a change actually affected the sound.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_sequencer_state",
    description: "Returns the current 8-step sequencer pattern, tempo, and transport state.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "set_sequencer_step",
    description: "Edits one step of the 8-step sequence.",
    parameters: {
      type: "object",
      properties: {
        index: { type: "number" },
        note: { type: "string" },
        octave: { type: "number" },
        velocity: { type: "number" },
        active: { type: "boolean" },
      },
      required: ["index"],
    },
  },
  {
    name: "clear_graph",
    description: "Removes all modules and cables. Only use on explicit human request.",
    parameters: { type: "object", properties: {} },
  },
];

const SYSTEM_INSTRUCTION = `You are the Mysynote sound design agent: an audio engineer working alongside a human on a live, shared synth graph in their browser.

Rules:
- Always call get_audio_graph_state first, even if you think you know the current state — the human may have changed something.
- Never attempt to change a parameter more than once if it comes back PARAMETER_LOCKED. Route around locked parameters using other modules/parameters instead.
- Prefer small, audible, reversible steps: inspect, act, then call get_spectrum_analysis to check the effect before deciding whether to continue.
- Keep going until the goal is met or you're confident no further tool calls will help — then stop calling tools and reply with a short (2-4 sentence) summary of what you changed and why, written for the human, not a log of every call.
- Do not narrate step-by-step reasoning in your final reply — just the outcome and the key decisions (e.g. what you preserved because it was locked).`;

export interface GeminiAgentOptions {
  apiKey: string;
  model: string;
  userGoal: string;
  toolDefs: ToolDef[];
  onToolCall?: (name: string, args: any, result: any) => void;
  onTurn?: (turn: number) => void;
  maxTurns?: number;
}

export class GeminiAgentError extends Error {}

export async function runGeminiAgent(opts: GeminiAgentOptions): Promise<string> {
  const executor: Record<string, (args: any) => any> = {};
  for (const def of opts.toolDefs) executor[def.name] = (args: any) => def.execute(args ?? {});

  const contents: any[] = [{ role: "user", parts: [{ text: opts.userGoal }] }];
  const maxTurns = opts.maxTurns ?? 8;

  for (let turn = 0; turn < maxTurns; turn++) {
    opts.onTurn?.(turn);

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent?key=${encodeURIComponent(
        opts.apiKey
      )}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents,
          tools: [{ functionDeclarations: GEMINI_TOOL_DECLARATIONS }],
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new GeminiAgentError(`Gemini API error ${res.status}: ${errText.slice(0, 400)}`);
    }

    const data = await res.json();
    const candidate = data?.candidates?.[0];
    const parts: any[] = candidate?.content?.parts ?? [];
    const functionCalls = parts.filter((p) => p.functionCall);

    if (functionCalls.length === 0) {
      const text = parts
        .map((p) => p.text ?? "")
        .join("")
        .trim();
      return text || "(The agent finished without any final message.)";
    }

    contents.push({ role: "model", parts });

    const responseParts: any[] = [];
    for (const fc of functionCalls) {
      const name: string = fc.functionCall.name;
      const args = fc.functionCall.args ?? {};
      let result: any;
      try {
        result = executor[name] ? executor[name](args) : { success: false, error: "UNKNOWN_TOOL", message: `No tool named ${name}` };
      } catch (err: any) {
        result = { success: false, error: "EXECUTION_ERROR", message: String(err?.message ?? err) };
      }
      opts.onToolCall?.(name, args, result);
      responseParts.push({ functionResponse: { name, response: result } });
    }
    contents.push({ role: "function", parts: responseParts });
  }

  return "(The agent stopped after reaching the turn limit without a final summary.)";
}
