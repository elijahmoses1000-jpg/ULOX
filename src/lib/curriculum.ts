// Curriculum. Structure mirrors roadmap.sh: a roadmap is an ordered set of
// sections, each holding topic nodes. Clicking a node loads its ITOLS theory and
// drops you into the Lab or a matching tactic.
//
// This is the hand-written UloX Core track: every node links to a tactic and a
// runnable graph. The live mirror of all 91 official roadmap.sh paths is a
// separate feature (see backend/roadmaps.ts and src/pages/Paths.tsx).

export interface TopicNode {
  id: string;
  title: string;
  blurb: string;
  /** Short theory body, rendered as paragraphs. */
  lesson: string[];
  /** Puzzle ids that practise this topic. */
  puzzles: string[];
  /** Optional starter graph preset id for the Lab. */
  preset?: string;
}

export interface Section {
  id: string;
  title: string;
  nodes: TopicNode[];
}

export interface Roadmap {
  /** roadmap.sh slug, used for the outbound link. */
  slug: string;
  title: string;
  tagline: string;
  accent: 'red' | 'ink';
  sections: Section[];
}

export const ROADMAP_SH = 'https://roadmap.sh';

export function roadmapUrl(slug: string): string {
  return `${ROADMAP_SH}/${slug}`;
}

const L = (...paras: string[]) => paras;

export const ROADMAPS: Roadmap[] = [
  {
    slug: 'ai-agents',
    title: 'AI Agents',
    tagline: 'From a single prompt to a graph that runs itself.',
    accent: 'red',
    sections: [
      {
        id: 'agents-foundations',
        title: 'Agent Foundations',
        nodes: [
          {
            id: 'ai-agents',
            title: 'What is an AI Agent',
            blurb: 'A model plus a loop plus tools plus a stopping rule.',
            lesson: L(
              'An agent is not a smarter prompt. It is a control loop: the model proposes an action, something executes it, the result comes back, and the model decides again. Remove the loop and you have a chatbot. Remove the stopping rule and you have a bill.',
              'Every agent you will build in UloX is a directed graph. Nodes do work. Edges carry conditions. The interesting engineering is almost never inside a node — it is in which edge fires and when.',
              'Start by reading a broken one. Open the Lab, run the trace, and watch where the loop refuses to leave.'
            ),
            puzzles: ['pzl_no_entry', 'pzl_infinite_researcher'],
            preset: 'react',
          },
          {
            id: 'itols',
            title: 'The ITOLS Contract',
            blurb: 'Identity, Tasks, Outcome, Language, Security.',
            lesson: L(
              'Most agent failures are contract failures. ITOLS gives every reasoning node five fields that must be filled before it is allowed near production.',
              'Identity fixes the persona, the system context and what the node can reach. Tasks defines the action space — which tools, in what order, and what is out of bounds. Outcome states the terminal condition and the exact shape of the final payload. Language pins the syntax the next node will parse. Security declares the guardrails, the limits, and what a safe failure looks like.',
              'The eval bar scores each field independently. An empty Outcome is worth roughly the same penalty as an unguarded loop, because in practice it causes one.'
            ),
            puzzles: ['pzl_identity_drift', 'pzl_format_brittle'],
          },
          {
            id: 'agentic-loops',
            title: 'Loop Engineering',
            blurb: 'Iteration, convergence, and the exit condition.',
            lesson: L(
              'A loop is bounded when at least one edge leaving the cycle carries a condition that can become true. "Always" is not a condition — it is a guarantee that you will never leave.',
              'Convergence needs three parts: state that accumulates, a predicate over that state, and a route that fires when the predicate flips. Miss any one and the eval bar drops five points, because the run is now unbounded.',
              'Nested loops each need their own exit. Sharing a terminal does not make an inner loop safe.'
            ),
            puzzles: ['pzl_infinite_researcher', 'pzl_no_exit', 'pzl_double_loop', 'pzl_stuck_router'],
            preset: 'react',
          },
          {
            id: 'memory',
            title: 'State and Memory',
            blurb: 'What survives between iterations.',
            lesson: L(
              'Without persisted state, iteration 2 is a re-run of iteration 1. You pay twice and learn once.',
              'Decide explicitly what carries forward: retrieved facts, attempted tool calls, rejected hypotheses, and the running cost. The predicate that ends your loop reads from exactly this state, so if it is not persisted, the loop cannot end.'
            ),
            puzzles: ['pzl_amnesiac', 'pzl_identity_drift'],
          },
        ],
      },
      {
        id: 'agents-architecture',
        title: 'Architecture Patterns',
        nodes: [
          {
            id: 'routing',
            title: 'Routing and Branching',
            blurb: 'Deterministic control flow over a stochastic model.',
            lesson: L(
              'A router turns a probabilistic classification into a deterministic branch. The branch conditions must be mutually exclusive and collectively exhaustive, or the graph has a race in it.',
              'Two unconditional edges from one node is the most common routing bug in production agent code, and the static analyzer flags it before you ever run.'
            ),
            puzzles: ['pzl_ambiguous_router', 'pzl_orphan_branch', 'pzl_stuck_router'],
            preset: 'router',
          },
          {
            id: 'tool-binding',
            title: 'Tool Contracts',
            blurb: 'Types across the boundary between model and system.',
            lesson: L(
              'A tool has an input shape, an output shape and a cost. The node downstream declares what it expects. When those disagree, you have a bug that no amount of prompt tuning fixes.',
              'Bind tools by contract, not by hope. The analyzer checks the binding statically and refuses to give you a positive score on a mismatch.'
            ),
            puzzles: ['pzl_type_mismatch', 'pzl_format_brittle'],
          },
          {
            id: 'reflexion',
            title: 'Critic and Reflexion Loops',
            blurb: 'An agent that reviews its own output.',
            lesson: L(
              'A critic loop adds a second agent whose only job is to reject. It raises quality and doubles your token cost, so it needs a hard iteration cap.',
              'The critic must have its own Outcome contract defining what approval means. A critic that cannot approve is an infinite loop with good intentions.'
            ),
            puzzles: ['pzl_double_loop'],
            preset: 'reflexion',
          },
          {
            id: 'rag',
            title: 'Retrieval-Augmented Generation',
            blurb: 'Grounding the loop in retrieved evidence.',
            lesson: L(
              'RAG is a tool-binding problem wearing a search costume. The retriever emits one shape, the ranker consumes another, and the agent cites a third.',
              'Treat every retrieved passage as untrusted input. It came from outside your trust boundary, and the model cannot tell a document from an instruction unless you tell it.'
            ),
            puzzles: ['pzl_type_mismatch', 'pzl_prompt_injection'],
          },
        ],
      },
      {
        id: 'agents-production',
        title: 'Production Concerns',
        nodes: [
          {
            id: 'error-handling',
            title: 'Failure Paths',
            blurb: 'What happens on the 503.',
            lesson: L(
              'Every tool edge marked "always" is a claim that the tool cannot fail. It can. Branch on status, route failures into a Guard, and give the Guard something to do.',
              'Retries need a counter and a give-up branch. Unbounded retry converts a transient outage into an infinite loop and a large invoice.'
            ),
            puzzles: ['pzl_silent_failure', 'pzl_retry_storm'],
            preset: 'guarded',
          },
          {
            id: 'cost-control',
            title: 'Token Economics',
            blurb: 'Cost as a control-flow signal.',
            lesson: L(
              'Every agent hop has a fixed cost. Multiply by loop iterations and the number is rarely the one in your head.',
              'Budget is a branch, not a limit. An edge on "over budget" that routes to a partial answer converts a runaway incident into a degraded response.'
            ),
            puzzles: ['pzl_token_bonfire', 'pzl_budget_blind'],
          },
          {
            id: 'reliability',
            title: 'Determinism and Replay',
            blurb: 'Reproducing an agent run.',
            lesson: L(
              'Deterministic mocking is how you test an agent. Pin the tool responses, run the graph, and assert on the trace — exactly what the UloX simulator does for every puzzle.',
              'If a run cannot be replayed, an incident cannot be debugged.'
            ),
            puzzles: ['pzl_retry_storm', 'pzl_budget_blind'],
          },
        ],
      },
    ],
  },
  {
    slug: 'ai-engineer',
    title: 'AI Engineer',
    tagline: 'The full stack around the model.',
    accent: 'ink',
    sections: [
      {
        id: 'ai-eng-core',
        title: 'Core',
        nodes: [
          {
            id: 'llm-basics',
            title: 'LLM Fundamentals',
            blurb: 'Tokens, context windows, temperature, latency.',
            lesson: L(
              'Everything downstream is shaped by three numbers: how many tokens you send, how many you get back, and how long the round trip takes. Agent architecture is largely the practice of minimising all three without losing the answer.',
              'Context is a budget, not a bucket. Filling it degrades attention on what actually mattered.'
            ),
            puzzles: ['pzl_token_bonfire'],
          },
          {
            id: 'prompt-engineering',
            title: 'Prompt Engineering',
            blurb: 'Instructions that survive contact with a model.',
            lesson: L(
              'A prompt that works once is a demo. A prompt that works ten thousand times is a contract, and contracts have named fields — which is what ITOLS gives you.',
              'Format brittleness is the most common production regression: the model drifts a bracket and the parser downstream falls over. Pin format in the Language field and validate it as a schema.'
            ),
            puzzles: ['pzl_format_brittle', 'pzl_identity_drift'],
          },
          {
            id: 'embeddings',
            title: 'Embeddings and Vector Search',
            blurb: 'Similarity as a retrieval primitive.',
            lesson: L(
              'An embedding turns text into a point. Retrieval returns neighbours. Neither step understands your question, which is why the ranking layer and the citation contract carry most of the quality.',
              'Watch the shapes: a vector store returns vectors, not documents. Bind accordingly.'
            ),
            puzzles: ['pzl_type_mismatch'],
          },
          {
            id: 'evals',
            title: 'Evals and Observability',
            blurb: 'Measuring an agent you cannot unit test.',
            lesson: L(
              'You cannot assert on model output directly. You can assert on the trace: which nodes fired, in what order, with what state, at what cost. That is what makes a graph testable when a prompt is not.',
              'The Agentic Advantage Score in this app is exactly that idea reduced to a single number, the way a chess engine reduces a position.'
            ),
            puzzles: ['pzl_budget_blind', 'pzl_retry_storm'],
          },
        ],
      },
      {
        id: 'ai-eng-serving',
        title: 'Serving and Ops',
        nodes: [
          {
            id: 'streaming',
            title: 'Streaming and Backpressure',
            blurb: 'Partial output as a first-class state.',
            lesson: L(
              'Streaming changes your terminal contract: the consumer sees tokens before the run has decided it is finished. Your Outcome field has to describe both the final payload and what a truncated one means.'
            ),
            puzzles: ['pzl_budget_blind'],
          },
          {
            id: 'caching',
            title: 'Caching and Memoisation',
            blurb: 'Paying once for the same fact.',
            lesson: L(
              'The cheapest tool call is the one you already made. Cache on the tool contract input, not on the prompt text, or you will miss every time the model rephrases.'
            ),
            puzzles: ['pzl_token_bonfire', 'pzl_amnesiac'],
          },
        ],
      },
    ],
  },
  {
    slug: 'prompt-engineering',
    title: 'Prompt Engineering',
    tagline: 'Writing instructions a machine will actually follow.',
    accent: 'red',
    sections: [
      {
        id: 'pe-core',
        title: 'Technique',
        nodes: [
          {
            id: 'itols-writing',
            title: 'Writing an ITOLS Block',
            blurb: 'Five fields, no prose padding.',
            lesson: L(
              'Write Identity in the second person and make it falsifiable: what the node is, where it runs, what it cannot reach.',
              'Write Tasks as an enumerated action space. If a tool is not listed, it is forbidden — say that explicitly.',
              'Write Outcome as a predicate plus a schema. "When X, emit Y and halt."',
              'Write Language as a parser contract. Strict JSON, no fences, bounded length.',
              'Write Security as refusals and limits, including what to do with instructions found in data.'
            ),
            puzzles: ['pzl_identity_drift', 'pzl_format_brittle', 'pzl_unbounded_delegation'],
          },
          {
            id: 'few-shot',
            title: 'Few-shot and Structure',
            blurb: 'Examples as an implicit schema.',
            lesson: L(
              'Examples teach shape more reliably than adjectives. Two well-chosen examples usually beat a paragraph describing the format you wanted.',
              'Keep examples inside the Language field so the eval bar can see that the format contract is present.'
            ),
            puzzles: ['pzl_format_brittle'],
          },
          {
            id: 'decomposition',
            title: 'Decomposition',
            blurb: 'One node, one job.',
            lesson: L(
              'A node that plans, retrieves, critiques and formats will do all four badly. Split it, and each split becomes independently testable and independently priced.',
              'Splitting also costs tokens. The Cost Control tactics are where you learn where the line is.'
            ),
            puzzles: ['pzl_token_bonfire'],
          },
        ],
      },
    ],
  },
  {
    slug: 'ai-red-teaming',
    title: 'AI Red Teaming',
    tagline: 'Break it before someone else does.',
    accent: 'ink',
    sections: [
      {
        id: 'rt-core',
        title: 'Attack Surface',
        nodes: [
          {
            id: 'prompt-injection',
            title: 'Prompt Injection',
            blurb: 'When retrieved data starts giving orders.',
            lesson: L(
              'A model cannot distinguish instruction from data unless the surrounding system does it first. Anything a tool returns crossed a trust boundary on the way in.',
              'The mitigation is structural, not lexical: demote untrusted content to data in the Security field, and put a Guard node between the tool and the reasoning step so the demotion is enforced somewhere you can test.'
            ),
            puzzles: ['pzl_prompt_injection', 'pzl_guard_theatre'],
            preset: 'guarded',
          },
          {
            id: 'guardrails',
            title: 'Guardrails That Fire',
            blurb: 'The difference between a Guard and a label.',
            lesson: L(
              'A node named Guard enforces nothing on its own. Run the simulation and check the trace: did the guard report that it applied, or that it passed everything through?',
              'Every guardrail needs an observable effect. If you cannot see it in the trace, it is not there.'
            ),
            puzzles: ['pzl_guard_theatre', 'pzl_silent_failure'],
          },
          {
            id: 'excessive-agency',
            title: 'Excessive Agency',
            blurb: 'Tools the agent should never have been able to reach.',
            lesson: L(
              'If a write tool is reachable from a read-only supervisor, the model will eventually reach it. Topology is the control, not instruction.',
              'Cut the edge first, then narrow the Tasks field. Doing only the second is guard theatre.'
            ),
            puzzles: ['pzl_unbounded_delegation'],
          },
        ],
      },
    ],
  },
  {
    slug: 'backend',
    title: 'Backend',
    tagline: 'The system your agent actually runs inside.',
    accent: 'ink',
    sections: [
      {
        id: 'be-core',
        title: 'Fundamentals',
        nodes: [
          { id: 'apis', title: 'APIs and Contracts', blurb: 'REST, RPC and the shape of a boundary.', lesson: L('Every tool your agent calls is somebody\'s API contract. Versioning, idempotency and error semantics decide what your failure paths must look like.'), puzzles: ['pzl_silent_failure'] },
          { id: 'idempotency', title: 'Idempotency and Retries', blurb: 'Safe to call twice.', lesson: L('An agent will retry. If the operation is not idempotent, a retry is a second order, a second charge, a second email. Design the tool so the retry branch is safe to take.'), puzzles: ['pzl_retry_storm'] },
          { id: 'rate-limits', title: 'Rate Limits and Backoff', blurb: 'The 429 you will definitely see.', lesson: L('Rate limits are the most common tool failure in agentic systems, and the one most often routed on "always". Branch on it, back off, and cap the attempts.'), puzzles: ['pzl_retry_storm', 'pzl_silent_failure'] },
          { id: 'observability', title: 'Logging and Tracing', blurb: 'The trace is the product.', lesson: L('An agent run without a trace cannot be debugged, reviewed or improved. Log the node, the condition taken, the state snapshot and the running cost — the four columns the UloX console shows you.'), puzzles: ['pzl_budget_blind'] },
        ],
      },
    ],
  },
  {
    slug: 'system-design',
    title: 'System Design',
    tagline: 'Scaling a loop from one user to a million.',
    accent: 'red',
    sections: [
      {
        id: 'sd-core',
        title: 'Design',
        nodes: [
          { id: 'queues', title: 'Queues and Async Work', blurb: 'Long-running agents do not belong in a request.', lesson: L('An agent loop can run for minutes. Put it behind a queue, give each run an id, and stream state changes back rather than holding a socket open on hope.'), puzzles: ['pzl_budget_blind'] },
          { id: 'concurrency', title: 'Concurrency and Fan-out', blurb: 'Map-reduce over sub-agents.', lesson: L('Parallel sub-agents multiply both throughput and cost. Fan out only when the branches are genuinely independent, and always fan back into a single reducer node with its own Outcome contract.'), puzzles: ['pzl_token_bonfire'] },
          { id: 'failure-domains', title: 'Failure Domains', blurb: 'What is still true when a dependency dies.', lesson: L('Draw the graph, then delete a tool node and ask what the run does. If the answer is "stalls", you are missing a guard.'), puzzles: ['pzl_silent_failure', 'pzl_orphan_branch'] },
        ],
      },
    ],
  },
  {
    slug: 'frontend',
    title: 'Frontend',
    tagline: 'Surfacing an agent to a human.',
    accent: 'ink',
    sections: [
      {
        id: 'fe-core',
        title: 'Interfaces',
        nodes: [
          { id: 'streaming-ui', title: 'Streaming Interfaces', blurb: 'Rendering a run in progress.', lesson: L('Show the trace, not a spinner. Users forgive latency they can watch and distrust latency they cannot.'), puzzles: [] },
          { id: 'state-machines', title: 'Client State Machines', blurb: 'The UI mirrors the graph.', lesson: L('An agent UI has the same states as the agent: idle, running, needs-input, failed, done. Model them explicitly and every edge case gets a screen.'), puzzles: [] },
          { id: 'pwa', title: 'Progressive Web Apps', blurb: 'Installable, offline-capable, one codebase.', lesson: L('A service worker caches your shell so the app opens instantly and keeps working on a bad connection. UloX itself is a PWA — install it and the puzzle set stays available offline.'), puzzles: [] },
        ],
      },
    ],
  },
  {
    slug: 'devops',
    title: 'DevOps',
    tagline: 'Shipping and running the thing.',
    accent: 'ink',
    sections: [
      {
        id: 'do-core',
        title: 'Operate',
        nodes: [
          { id: 'ci-cd', title: 'CI/CD for Prompts', blurb: 'Prompts are code and need review.', lesson: L('Version the ITOLS block with the code that runs it. A prompt change is a behaviour change and deserves the same review and rollback path.'), puzzles: [] },
          { id: 'secrets', title: 'Secrets and Least Privilege', blurb: 'The credentials your agent holds.', lesson: L('Give the agent the narrowest credential that completes the task. Excessive agency is usually an IAM problem before it is a prompt problem.'), puzzles: ['pzl_unbounded_delegation'] },
          { id: 'slo', title: 'SLOs for Non-determinism', blurb: 'What "working" means for a model.', lesson: L('Define success on the trace: terminated, inside budget, guard fired, schema valid. Those are measurable even when the prose is not.'), puzzles: ['pzl_budget_blind'] },
        ],
      },
    ],
  },
  {
    slug: 'python',
    title: 'Python',
    tagline: 'The language most of this gets written in.',
    accent: 'red',
    sections: [
      {
        id: 'py-core',
        title: 'Essentials',
        nodes: [
          { id: 'typing', title: 'Typing and Pydantic', blurb: 'Schemas at the boundary.', lesson: L('Declare the tool contract as a typed model and validate on both sides. Half the tool-binding tactics in this app are bugs a schema would have caught.'), puzzles: ['pzl_type_mismatch'] },
          { id: 'asyncio', title: 'Async and Concurrency', blurb: 'Awaiting many tools at once.', lesson: L('Fan-out in an agent is an async gather with a cost ceiling attached. Bound the concurrency or you will discover your rate limit the expensive way.'), puzzles: ['pzl_token_bonfire'] },
          { id: 'testing', title: 'Testing with Mocks', blurb: 'Deterministic runs from non-deterministic parts.', lesson: L('Pin every tool response, then assert on the sequence of nodes visited. That is exactly the harness behind every puzzle here.'), puzzles: ['pzl_retry_storm'] },
        ],
      },
    ],
  },
];

export const ROADMAP_BY_SLUG = new Map(ROADMAPS.map(r => [r.slug, r]));

export const ALL_TOPICS: TopicNode[] = ROADMAPS.flatMap(r => r.sections.flatMap(s => s.nodes));
export const TOPIC_BY_ID = new Map(ALL_TOPICS.map(t => [t.id, t]));

export function topicRoadmap(topicId: string): Roadmap | undefined {
  return ROADMAPS.find(r => r.sections.some(s => s.nodes.some(n => n.id === topicId)));
}

export function countNodes(roadmap: Roadmap): number {
  return roadmap.sections.reduce((sum, s) => sum + s.nodes.length, 0);
}
