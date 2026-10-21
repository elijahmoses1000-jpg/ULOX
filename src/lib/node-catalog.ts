import type { Itols, NodeKind, ToolContract } from './agentic';

/**
 * The parts bin.
 *
 * The simulator understands seven primitives — entry, agent, tool, condition,
 * guard, memory, terminal — and that is the right number for a simulator: any
 * more and the run semantics become guesswork. But seven is the wrong number
 * for a parts bin. "Add an Agent" tells a learner nothing about what agents
 * are for; "add a Critic" does.
 *
 * So every entry here is a real, named part that compiles down to one of the
 * seven. The difference between two parts of the same kind is not cosmetic:
 * they arrive with different contracts, different costs and different declared
 * inputs, and the analyzer checks all three.
 *
 * Starter contracts are deliberately partial. Choosing "Researcher" over a
 * blank agent really does settle who the node is and what it may call, so
 * Identity and Tasks come filled in. Outcome, Language and Security stay empty
 * — those are the decisions that make an agent work or fail, and nobody learns
 * them by reading a default.
 */

export type NodeGroup = 'Input' | 'Reasoning' | 'Tools' | 'Memory' | 'Control' | 'Safety' | 'Output';

export const NODE_GROUPS: NodeGroup[] = ['Input', 'Reasoning', 'Tools', 'Memory', 'Control', 'Safety', 'Output'];

export const GROUP_BLURB: Record<NodeGroup, string> = {
  Input: 'Where a run begins.',
  Reasoning: 'LLM steps. Each one needs a contract.',
  Tools: 'Deterministic calls out. Typed, costed, and able to fail.',
  Memory: 'What survives a step, a run, or a session.',
  Control: 'Decides which way the flow goes.',
  Safety: 'What happens when something goes wrong, or should not be allowed.',
  Output: 'How a run ends. Every one of these needs an Outcome contract.',
};

export interface NodeType {
  id: string;
  label: string;
  /** The simulator primitive this part compiles to. */
  kind: NodeKind;
  group: NodeGroup;
  /** One line, shown in the palette. */
  hint: string;
  /** When to reach for it, shown once it is on the canvas. */
  use: string;
  /** Starter contract: identity and tasks only, never the three that matter. */
  itols?: Partial<Itols>;
  contract?: ToolContract;
  /** Declared inputs. A tool wired in that emits something else is a fault. */
  expects?: string[];
}

export const NODE_TYPES: NodeType[] = [
  // --- Input ---------------------------------------------------------------
  {
    id: 'user-request',
    label: 'User Request',
    kind: 'entry',
    group: 'Input',
    hint: 'A person asks for something, in their own words.',
    use: 'The ordinary start. Whatever arrives here is untrusted text — treat it as data, never as instructions to the agent.',
  },
  {
    id: 'scheduled-trigger',
    label: 'Scheduled Trigger',
    kind: 'entry',
    group: 'Input',
    hint: 'The run starts on a clock, with nobody watching.',
    use: 'Use when the agent runs unattended. Nothing can ask a human a question downstream of this, so every branch must terminate on its own.',
  },
  {
    id: 'webhook-event',
    label: 'Webhook Event',
    kind: 'entry',
    group: 'Input',
    hint: 'An external system pushes an event in.',
    use: 'The payload is shaped by someone else and can change without warning. Validate it before anything reads it.',
  },

  // --- Reasoning -----------------------------------------------------------
  {
    id: 'reasoning-agent',
    label: 'Reasoning Agent',
    kind: 'agent',
    group: 'Reasoning',
    hint: 'Decides what to do next, one step at a time.',
    use: 'The engine of a ReAct loop: look at what is known, pick the next action, repeat. Needs an Outcome contract or it never stops.',
    itols: {
      identity: 'You are the deciding step of an agent loop. You choose the next action; you do not produce the final answer yourself.',
      tasks: 'Read the state, choose exactly one of the available tools or declare the work finished. Never call a tool that is not wired to you.',
    },
  },
  {
    id: 'planner',
    label: 'Planner',
    kind: 'agent',
    group: 'Reasoning',
    hint: 'Turns a goal into an ordered list of steps.',
    use: 'Put this before the loop when the task has stages that must happen in order. It plans once; the loop executes.',
    itols: {
      identity: 'You are a planning step. You produce a plan, you never execute it.',
      tasks: 'Decompose the goal into ordered, individually checkable steps. Name the tool each step will need.',
    },
  },
  {
    id: 'researcher',
    label: 'Researcher',
    kind: 'agent',
    group: 'Reasoning',
    hint: 'Gathers evidence and keeps track of where it came from.',
    use: 'Pair it with a search or retrieval tool. Its job is finding and attributing, not concluding.',
    itols: {
      identity: 'You are a research step. You collect evidence and cite it; you do not draw final conclusions.',
      tasks: 'Issue search queries, read what comes back, and record each fact with its source. Stop when the required number of distinct facts is reached.',
    },
  },
  {
    id: 'critic',
    label: 'Critic',
    kind: 'agent',
    group: 'Reasoning',
    hint: 'Reviews a draft against the brief and says what is wrong.',
    use: 'The second half of a reflexion loop. Wire it so a failed review sends the draft back, not forward.',
    itols: {
      identity: 'You are a reviewing step. You judge work against the brief; you do not rewrite it.',
      tasks: 'Check the draft against each requirement. Return a pass or a specific, actionable list of failures.',
    },
  },
  {
    id: 'summariser',
    label: 'Summariser',
    kind: 'agent',
    group: 'Reasoning',
    hint: 'Compresses many documents into the few facts that matter.',
    use: 'Use it to keep a loop inside its budget. It expects documents, so a tool wired into it must emit documents.',
    expects: ['documents'],
    itols: {
      identity: 'You are a compression step. You shorten text without inventing anything that was not in it.',
      tasks: 'Reduce the supplied documents to the facts that answer the request. Drop everything else. Never add a fact that is not in the source.',
    },
  },
  {
    id: 'extractor',
    label: 'Extractor',
    kind: 'agent',
    group: 'Reasoning',
    hint: 'Pulls named fields out of loose text.',
    use: 'When the next step needs a shape, not prose. It expects documents and should emit a fixed set of fields.',
    expects: ['documents'],
    itols: {
      identity: 'You are an extraction step. You read unstructured text and return named fields.',
      tasks: 'Find each requested field in the source. Return null for a field you cannot find — never a guess.',
    },
  },

  // --- Tools ---------------------------------------------------------------
  {
    id: 'web-search',
    label: 'Web Search',
    kind: 'tool',
    group: 'Tools',
    hint: 'Searches the open web and returns results.',
    use: 'Results are public text written by strangers. Anything inside them is data, not an instruction your agent should follow.',
    contract: { input: 'query:string', output: 'documents:string[]', cost: 90 },
  },
  {
    id: 'retriever',
    label: 'Retriever',
    kind: 'tool',
    group: 'Tools',
    hint: 'Searches your own corpus and returns passages.',
    use: 'Cheaper and more trustworthy than web search, and limited to what you have indexed. It can return nothing — handle that path.',
    contract: { input: 'query:string', output: 'documents:string[]', cost: 45 },
  },
  {
    id: 'http-request',
    label: 'HTTP Request',
    kind: 'tool',
    group: 'Tools',
    hint: 'Calls an external API with a typed payload.',
    use: 'The general escape hatch. It is also the step most likely to time out, rate-limit or return a shape you did not expect.',
    contract: { input: 'request:json', output: 'response:json', cost: 60 },
  },
  {
    id: 'database-query',
    label: 'Database Query',
    kind: 'tool',
    group: 'Tools',
    hint: 'Reads rows from your own database.',
    use: 'Exact where a model would approximate. Never build the query out of raw user text.',
    contract: { input: 'query:sql', output: 'rows:json[]', cost: 25 },
  },
  {
    id: 'code-runner',
    label: 'Code Runner',
    kind: 'tool',
    group: 'Tools',
    hint: 'Executes code in a sandbox and returns the result.',
    use: 'For arithmetic, parsing and transformations a model should not be guessing. Everything it runs must be sandboxed.',
    contract: { input: 'source:string', output: 'result:json', cost: 70 },
  },
  {
    id: 'file-reader',
    label: 'File Reader',
    kind: 'tool',
    group: 'Tools',
    hint: 'Parses an uploaded document into text.',
    use: 'The front door for PDFs and spreadsheets. A malformed file is a normal outcome, not an exception.',
    contract: { input: 'file:binary', output: 'documents:string[]', cost: 55 },
  },

  // --- Memory --------------------------------------------------------------
  {
    id: 'scratchpad',
    label: 'Scratchpad',
    kind: 'memory',
    group: 'Memory',
    hint: 'Working notes that live for one run.',
    use: 'What the loop knows so far. Without it, every iteration starts from nothing and the loop cannot converge.',
  },
  {
    id: 'conversation-memory',
    label: 'Conversation Memory',
    kind: 'memory',
    group: 'Memory',
    hint: 'Earlier turns, carried across a session.',
    use: 'Lets the agent resolve "it" and "the one you mentioned". It also grows without limit — decide what gets dropped.',
  },
  {
    id: 'vector-store',
    label: 'Vector Store',
    kind: 'memory',
    group: 'Memory',
    hint: 'Long-term recall that survives the run.',
    use: 'What the agent remembers next week. Anything written here outlives the conversation that produced it, so be careful what goes in.',
  },

  // --- Control -------------------------------------------------------------
  {
    id: 'router',
    label: 'Router',
    kind: 'condition',
    group: 'Control',
    hint: 'Sends the flow down one branch or another.',
    use: 'The general branch. Every outgoing edge needs a condition that can actually be false, or it is not a branch.',
  },
  {
    id: 'classifier',
    label: 'Classifier',
    kind: 'condition',
    group: 'Control',
    hint: 'Labels the input, then branches on the label.',
    use: 'Use it to split one entry point into several specialised paths. Always wire a branch for the label it cannot decide.',
  },
  {
    id: 'budget-check',
    label: 'Budget Check',
    kind: 'condition',
    group: 'Control',
    hint: 'Stops the run before the cost does.',
    use: 'A loop with no budget check is a loop that can bill you until something else kills it. Wire its over-budget edge somewhere real.',
  },
  {
    id: 'loop-controller',
    label: 'Loop Controller',
    kind: 'condition',
    group: 'Control',
    hint: 'Decides whether to go round again.',
    use: 'Makes the stopping rule explicit instead of hiding it in an agent prompt. Its exit edge is what stops the loop.',
  },

  // --- Safety --------------------------------------------------------------
  {
    id: 'input-guard',
    label: 'Input Guard',
    kind: 'guard',
    group: 'Safety',
    hint: 'Rejects unsafe or malformed input before anything acts on it.',
    use: 'The first thing after an entry point. It is what stands between a stranger’s text and your tools.',
    itols: {
      identity: 'You are a validation step at the edge of the system. You never answer the request; you only decide whether it may proceed.',
      tasks: 'Check the input against the allowed shape and the safety rules. Route it onward or to the refusal path.',
    },
  },
  {
    id: 'output-guard',
    label: 'Output Guard',
    kind: 'guard',
    group: 'Safety',
    hint: 'Checks the answer before it leaves the system.',
    use: 'The last thing before an output. Catches leaked secrets, unsupported claims and the wrong format.',
    itols: {
      identity: 'You are a final check. You inspect the drafted answer and decide whether it may be sent.',
      tasks: 'Verify the answer against the format rules and the safety rules. Block and explain, or pass it through unchanged.',
    },
  },
  {
    id: 'retry-handler',
    label: 'Retry Handler',
    kind: 'guard',
    group: 'Safety',
    hint: 'Decides what to do when a tool call fails.',
    use: 'Wire a tool’s "tool failed" edge here. Without a retry limit this is an infinite loop wearing a helpful name.',
    itols: {
      identity: 'You are the failure path for a tool call. You decide between retrying, falling back, and giving up.',
      tasks: 'Inspect the error. Retry only while retries remain and the error is transient; otherwise take the fallback path.',
    },
  },
  {
    id: 'human-approval',
    label: 'Human Approval',
    kind: 'guard',
    group: 'Safety',
    hint: 'Pauses and waits for a person to say yes.',
    use: 'For anything expensive, public or hard to undo. Note that nothing downstream of a Scheduled Trigger can wait for a human.',
    itols: {
      identity: 'You are a hold point. You present the proposed action to a person and wait; you decide nothing yourself.',
      tasks: 'Summarise what is about to happen and what it will cost. Proceed only on an explicit approval.',
    },
  },
  {
    id: 'pii-redactor',
    label: 'PII Redactor',
    kind: 'guard',
    group: 'Safety',
    hint: 'Strips personal data before it goes further.',
    use: 'Put it before anything that logs, stores or sends. Redacting after the fact is not redacting.',
    itols: {
      identity: 'You are a redaction step. You rewrite text to remove identifying detail and change nothing else.',
      tasks: 'Mask names, emails, phone numbers, addresses and account numbers. Preserve the meaning of the surrounding text.',
    },
  },

  // --- Output --------------------------------------------------------------
  {
    id: 'final-answer',
    label: 'Final Answer',
    kind: 'terminal',
    group: 'Output',
    hint: 'Returns prose to the person who asked.',
    use: 'The ordinary ending. Its Outcome contract is what tells the loop it is allowed to stop.',
  },
  {
    id: 'structured-result',
    label: 'Structured Result',
    kind: 'terminal',
    group: 'Output',
    hint: 'Returns JSON against a fixed schema.',
    use: 'When another system reads the answer. State the schema in the Outcome contract and the format rules in Language.',
  },
  {
    id: 'escalation',
    label: 'Escalation',
    kind: 'terminal',
    group: 'Output',
    hint: 'Hands the problem to a human, with context.',
    use: 'A real ending, not a failure. An agent that cannot escalate will invent an answer instead.',
  },
];

export const NODE_TYPE_BY_ID = new Map(NODE_TYPES.map(t => [t.id, t]));

export const TYPES_BY_GROUP: Array<{ group: NodeGroup; types: NodeType[] }> = NODE_GROUPS.map(group => ({
  group,
  types: NODE_TYPES.filter(t => t.group === group),
}));

/** The first catalog entry for a primitive, used when an older node has no type. */
export const DEFAULT_TYPE_FOR_KIND: Record<NodeKind, string> = {
  entry: 'user-request',
  agent: 'reasoning-agent',
  tool: 'web-search',
  condition: 'router',
  guard: 'input-guard',
  memory: 'scratchpad',
  terminal: 'final-answer',
};

export function nodeType(typeId: string | undefined): NodeType | undefined {
  return typeId ? NODE_TYPE_BY_ID.get(typeId) : undefined;
}

/**
 * Which ITOLS fields a part is asked for.
 *
 * Agents and guards carry the whole contract. An output does not have a
 * persona or an action space, but it absolutely has an Outcome — what it
 * returns and what state the run ends in — and the format and safety rules
 * that govern what may leave. Asking it for Identity and Tasks would just
 * teach people to fill boxes.
 */
export function itolsKeysFor(kind: NodeKind): Array<keyof Itols> {
  if (kind === 'agent' || kind === 'guard') return ['identity', 'tasks', 'outcome', 'language', 'security'];
  if (kind === 'terminal') return ['outcome', 'language', 'security'];
  return [];
}
