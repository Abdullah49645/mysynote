import { ToolDef } from "./webmcp-tools";

export type AgentProvider = "gemini" | "anthropic";

/**
 * A provider-neutral mirror of buildToolDefs' inputSchema — JSON-schema-ish,
 * flattened to a single scalar `type` per property (Gemini's function-calling
 * schema doesn't support type unions; Anthropic's does but there's no reason
 * to maintain two shapes). Execution always goes through the exact same
 * `execute` functions from webmcp-tools.ts — only this declaration shape
 * differs from what document.modelContext sees.
 */
export const AGENT_TOOL_SPECS: { name: string; description: string; schema: Record<string, unknown> }[] = [
  {
    name: "get_audio_graph_state",
    description:
      "Returns the complete current state of the Mysynote synth graph: every module, its type, position, parameter values, lock states, cable connections, sequencer pattern, and transport state. Always call this first and after any manual human change, so you never operate on stale information.",
    schema: { type: "object", properties: {} },
  },
  {
    name: "spawn_module",
    description: "Creates a new synth module at a canvas position and wires up a real Web Audio node for it.",
    schema: {
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
    schema: {
      type: "object",
      properties: { moduleId: { type: "string" } },
      required: ["moduleId"],
    },
  },
  {
    name: "patch_cable",
    description:
      "Connects a module's output port to another module's input port. Some inputs are modulation targets (e.g. a filter's \"cutoff\") rather than audio inputs (\"in\") — check the module's `inputs` array from get_audio_graph_state.",
    schema: {
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
    schema: {
      type: "object",
      properties: { connectionId: { type: "string" } },
      required: ["connectionId"],
    },
  },
  {
    name: "set_module_param",
    description:
      "Sets a parameter on a module. Fails with PARAMETER_LOCKED if the human locked it — never retry a locked parameter, find another route instead. Pass value as a string; numeric params (e.g. \"440\") are coerced automatically.",
    schema: {
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
    schema: {
      type: "object",
      properties: { moduleId: { type: "string" }, paramName: { type: "string" } },
      required: ["moduleId", "paramName"],
    },
  },
  {
    name: "unlock_parameter",
    description:
      "Unlocks a previously locked parameter. Fails with LOCK_OWNED_BY_HUMAN if a human locked it \u2014 that lock can only be cleared from the UI, never by you. Do not retry.",
    schema: {
      type: "object",
      properties: { moduleId: { type: "string" }, paramName: { type: "string" } },
      required: ["moduleId", "paramName"],
    },
  },
  {
    name: "get_spectrum_analysis",
    description:
      "Returns a real-time snapshot from the actual audio analyser: peak frequency, low/mid/high band energy, peak amplitude, and clipping. Use this to verify a change actually affected the sound.",
    schema: { type: "object", properties: {} },
  },
  {
    name: "get_sequencer_state",
    description: "Returns the current 8-step sequencer pattern, tempo, and transport state.",
    schema: { type: "object", properties: {} },
  },
  {
    name: "set_sequencer_step",
    description: "Edits one step of the 8-step sequence.",
    schema: {
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
    schema: { type: "object", properties: {} },
  },
];

const SYSTEM_INSTRUCTION = `You are the Mysynote sound design agent: an audio engineer working alongside a human on a live, shared synth graph in their browser.

Rules:
- Always call get_audio_graph_state first, even if you think you know the current state — the human may have changed something.
- Never attempt to change a parameter more than once if it comes back PARAMETER_LOCKED. Route around locked parameters using other modules/parameters instead.
- Prefer small, audible, reversible steps: inspect, act, then call get_spectrum_analysis to check the effect before deciding whether to continue.
- Keep going until the goal is met or you're confident no further tool calls will help — then stop calling tools and reply with a short (2-4 sentence) summary of what you changed and why, written for the human, not a log of every call.
- Do not narrate step-by-step reasoning in your final reply — just the outcome and the key decisions (e.g. what you preserved because it was locked).`;

export interface AgentRunOptions {
  provider: AgentProvider;
  apiKey: string;
  model: string;
  userGoal: string;
  toolDefs: ToolDef[];
  onToolCall?: (name: string, args: any, result: any) => void;
  onTurn?: (turn: number) => void;
  maxTurns?: number;
}

export class AgentRunError extends Error {}

function buildExecutor(toolDefs: ToolDef[]): Record<string, (args: any) => any> {
  const executor: Record<string, (args: any) => any> = {};
  for (const def of toolDefs) executor[def.name] = (args: any) => def.execute(args ?? {});
  return executor;
}

function runTool(executor: Record<string, (args: any) => any>, name: string, args: any): any {
  try {
    return executor[name] ? executor[name](args ?? {}) : { success: false, error: "UNKNOWN_TOOL", message: `No tool named ${name}` };
  } catch (err: any) {
    return { success: false, error: "EXECUTION_ERROR", message: String(err?.message ?? err) };
  }
}

// ---- Gemini (generateContent function calling) ----

async function runGeminiAgent(opts: AgentRunOptions): Promise<string> {
  const executor = buildExecutor(opts.toolDefs);
  const functionDeclarations = AGENT_TOOL_SPECS.map((t) => ({ name: t.name, description: t.description, parameters: t.schema }));
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
          tools: [{ functionDeclarations }],
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new AgentRunError(`Gemini API error ${res.status}: ${errText.slice(0, 400)}`);
    }

    const data = await res.json();
    const candidate = data?.candidates?.[0];
    const parts: any[] = candidate?.content?.parts ?? [];
    const functionCalls = parts.filter((p) => p.functionCall);

    if (functionCalls.length === 0) {
      const text = parts.map((p) => p.text ?? "").join("").trim();
      return text || "(The agent finished without any final message.)";
    }

    contents.push({ role: "model", parts });

    const responseParts: any[] = [];
    for (const fc of functionCalls) {
      const name: string = fc.functionCall.name;
      const args = fc.functionCall.args ?? {};
      const result = runTool(executor, name, args);
      opts.onToolCall?.(name, args, result);
      responseParts.push({ functionResponse: { name, response: result } });
    }
    contents.push({ role: "user", parts: responseParts });
  }

  return "(The agent stopped after reaching the turn limit without a final summary.)";
}

// ---- Anthropic (Messages API tool use) ----
//
// Anthropic's API is one of the few that explicitly supports being called
// directly from a browser: it requires the opt-in
// `anthropic-dangerous-direct-browser-access` header, which exists
// specifically for BYO-key client-side tools like this one. (OpenAI's API
// has no equivalent opt-in and consistently rejects browser-origin requests
// with a missing-CORS-header error — that's why there's no OpenAI option
// here rather than a broken one.)

async function runAnthropicAgent(opts: AgentRunOptions): Promise<string> {
  const executor = buildExecutor(opts.toolDefs);
  const tools = AGENT_TOOL_SPECS.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema }));
  const messages: any[] = [{ role: "user", content: opts.userGoal }];
  const maxTurns = opts.maxTurns ?? 8;

  for (let turn = 0; turn < maxTurns; turn++) {
    opts.onTurn?.(turn);

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": opts.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: 1024,
        system: SYSTEM_INSTRUCTION,
        messages,
        tools,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new AgentRunError(`Anthropic API error ${res.status}: ${errText.slice(0, 400)}`);
    }

    const data = await res.json();
    const content: any[] = data?.content ?? [];
    const toolUses = content.filter((c) => c.type === "tool_use");

    if (toolUses.length === 0) {
      const text = content
        .filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("")
        .trim();
      return text || "(The agent finished without any final message.)";
    }

    messages.push({ role: "assistant", content });

    const toolResults: any[] = [];
    for (const tu of toolUses) {
      const result = runTool(executor, tu.name, tu.input);
      opts.onToolCall?.(tu.name, tu.input, result);
      toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(result) });
    }
    messages.push({ role: "user", content: toolResults });
  }

  return "(The agent stopped after reaching the turn limit without a final summary.)";
}

// ---- Dispatcher ----

export async function runAgent(opts: AgentRunOptions): Promise<string> {
  switch (opts.provider) {
    case "gemini":
      return runGeminiAgent(opts);
    case "anthropic":
      return runAnthropicAgent(opts);
    default:
      throw new AgentRunError(`Unknown agent provider: ${opts.provider}`);
  }
}
