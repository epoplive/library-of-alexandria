import { useState } from 'react';
import {
  LessonShell,
  Section,
  Callout,
  Quiz,
  Diagram,
  Sandbox,
  StepThrough,
  MatchPairs,
  Reveal,
  KeyTerm,
} from '@/components';

type Phase = 'goal' | 'think' | 'act' | 'observe' | 'final';

const SCRIPT: { kind: Phase; text: string }[] = [
  { kind: 'goal', text: 'Find any file in /tmp over 100 MB and report its size.' },
  { kind: 'think', text: 'I should list /tmp first to see what is there.' },
  { kind: 'act', text: 'bash("ls -la /tmp")' },
  { kind: 'observe', text: '47 files. cache.log 312M, build.tar 89M, …' },
  { kind: 'think', text: 'cache.log looks like a candidate. Confirm with du.' },
  { kind: 'act', text: 'bash("du -h /tmp/cache.log")' },
  { kind: 'observe', text: '312M  /tmp/cache.log' },
  { kind: 'think', text: '312M is over 100M. I have the answer.' },
  { kind: 'final', text: '/tmp/cache.log — 312M.' },
];

const KIND: Record<Phase, { label: string; color: string; bg: string }> = {
  goal: { label: 'Goal', color: 'text-ink', bg: 'bg-paper-tint' },
  think: { label: 'Think', color: 'text-accent', bg: 'bg-accent-soft/60' },
  act: { label: 'Act', color: 'text-signal-info', bg: 'bg-signal-info/10' },
  observe: { label: 'Observe', color: 'text-signal-good', bg: 'bg-signal-good/10' },
  final: { label: 'Answer', color: 'text-accent', bg: 'bg-accent-soft' },
};

function LoopSim() {
  const [step, setStep] = useState(1);
  const visible = SCRIPT.slice(0, step);
  const done = step >= SCRIPT.length;
  const iterations = visible.filter((e) => e.kind === 'act').length;

  return (
    <Sandbox
      title={`Agent loop · ${iterations} iteration${iterations === 1 ? '' : 's'} so far${done ? ' · done' : ''}`}
      controls={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(SCRIPT.length, s + 1))}
            disabled={done}
            className="px-4 py-2 rounded-xl bg-accent text-paper font-mono text-xs uppercase tracking-[0.14em] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-accent-hover transition"
          >
            Step →
          </button>
          <button
            type="button"
            onClick={() => setStep(1)}
            className="px-4 py-2 rounded-xl border border-ink-subtle/30 font-mono text-xs uppercase tracking-[0.14em] text-ink-muted hover:text-ink hover:border-ink-subtle transition"
          >
            Reset
          </button>
        </div>
      }
    >
      <div className="space-y-2 max-h-[440px] overflow-y-auto pr-1">
        {visible.map((e, i) => {
          const k = KIND[e.kind];
          return (
            <div key={i} className={`rounded-xl p-3 ${k.bg}`}>
              <p
                className={`font-mono text-[10px] uppercase tracking-[0.22em] mb-1 ${k.color}`}
              >
                {k.label}
              </p>
              <p
                className={
                  e.kind === 'act'
                    ? 'font-mono text-sm text-ink break-all'
                    : 'text-ink text-[15px] leading-relaxed'
                }
              >
                {e.text}
              </p>
            </div>
          );
        })}
        {done && (
          <p className="text-center text-ink-muted text-sm pt-3 italic">
            Context grew from 1 entry to {SCRIPT.length}. Each step, the model saw
            everything above it as input.
          </p>
        )}
      </div>
    </Sandbox>
  );
}

export default function AgentLoops() {
  return (
    <LessonShell
      title="Inside an agent loop"
      subtitle="Think → Act → Observe — the cycle every coding agent runs, plus the four ways it falls apart."
      kicker="AGENTS"
      estimatedMinutes={9}
    >
      <Section eyebrow="Part 1" title="The one-shot ceiling">
        <p>
          A plain prompt-to-response call has a fixed budget: one turn of thinking, one
          answer. The model can be clever in that turn, but it can't look at a file, run
          a script, or check whether the thing it just said is actually true.
        </p>
        <p>
          For a question — "what's the capital of France?" — that ceiling doesn't matter.
          For a task — "find the largest file in <code>/tmp</code>" — it's the whole
          game. The one-shot model can <em>describe</em> how to do that. It can't do it.
        </p>
        <Callout kind="insight" title="The shift">
          <p>
            A looping LLM is the same model, called in a cycle. Each turn it can request
            an action; the loop runs the action and feeds the result back. The model
            never grows new abilities — the <em>loop</em> grows them.
          </p>
        </Callout>
      </Section>

      <Section eyebrow="Part 2" title="The cycle">
        <p>
          Strip away the jargon and an{' '}
          <KeyTerm
            term="agent loop"
            definition="A loop that calls an LLM repeatedly, where each iteration the model can request an action (a tool call) or declare it's done."
          />{' '}
          is four phases:
        </p>
        <Diagram
          chart={`flowchart LR
  A([Goal]) --> B[Think]
  B --> C[Act]
  C --> D[Observe]
  D --> B
  D --> E([Done])
  style A fill:#ede9fe,stroke:#5b21b6
  style E fill:#dcfce7,stroke:#10b981
  style B fill:#fafaf7,stroke:#94a3b8
  style C fill:#e0f2fe,stroke:#0ea5e9
  style D fill:#dcfce7,stroke:#10b981`}
          caption="Think → Act → Observe → repeat. The model itself decides when to break out."
        />
        <p>
          That's the whole shape. The name you'll see in papers is{' '}
          <KeyTerm
            term="ReAct"
            definition="Reasoning + Acting. From a 2022 paper showing that interleaving 'thoughts' with tool calls beats either alone."
          />
          , but the idea is just the diagram above.
        </p>
      </Section>

      <Section eyebrow="Part 3" title="Watch one run">
        <p>
          Goal:{' '}
          <strong>
            find any file in <code>/tmp</code> over 100 MB
          </strong>
          . Step through it — each click is the model emitting its next move.
        </p>
        <LoopSim />
        <p>
          Notice the rhythm. The model thinks, acts, sees a result, thinks again, and
          eventually decides it's done. No external supervisor told it to stop.
        </p>
      </Section>

      <Section eyebrow="Part 4" title="The catch: the model is stateless">
        <p>
          Here's the part most people miss. The LLM itself has no memory between calls.
          Every single iteration the loop sends the model{' '}
          <em>everything that has happened so far</em> as the input, and the model emits
          the next turn.
        </p>
        <StepThrough
          steps={[
            {
              title: 'Iteration 1',
              content: (
                <p>
                  Input: <strong>goal</strong>. Output: a think + act.
                </p>
              ),
            },
            {
              title: 'Iteration 2',
              content: (
                <p>
                  Input: <strong>goal + think + act + observation</strong>. Output: the
                  next think + act.
                </p>
              ),
            },
            {
              title: 'Iteration 3',
              content: (
                <p>
                  Input: <strong>everything from iterations 1–2</strong>, plus the
                  latest observation. Output: the final answer.
                </p>
              ),
            },
          ]}
        />
        <Callout kind="info" title="Why context windows matter so much">
          <p>
            Because every iteration appends, a long-running agent's history grows with
            each step. The single biggest practical limit on what an agent can accomplish
            is{' '}
            <KeyTerm
              term="context window"
              definition="The maximum number of tokens the model can attend to in one call. When the loop's history exceeds it, you either truncate, summarize, or lose."
            />{' '}
            size — not raw model intelligence.
          </p>
        </Callout>
      </Section>

      <Section eyebrow="Part 5" title="Tools are the hands">
        <p>
          The "Act" phase is the only place the model touches the world. Everything an
          agent can do is the union of the{' '}
          <KeyTerm
            term="tools"
            definition="Functions exposed to the model. Each has a name, a description, and a schema for its arguments. The model emits a structured call; the loop runs the function and returns the result as the observation."
          />{' '}
          you give it. No tools, no agent — just a chatbot that talks about doing things.
        </p>
        <MatchPairs
          pairs={[
            { left: 'read_file', right: 'Reads bytes off disk' },
            { left: 'bash', right: 'Runs a shell command in a sandbox' },
            { left: 'web_search', right: 'Queries a search index, returns hits' },
            { left: 'edit_file', right: 'Patches a file in place' },
            { left: 'finish', right: 'Signals "done" with a final answer' },
          ]}
        />
        <p>
          Most agent frameworks include a <code>finish</code> (or <code>respond</code>)
          tool just so the model has an unambiguous way to say "I'm done — here's the
          answer," instead of relying on it to stop emitting tool calls.
        </p>
      </Section>

      <Section eyebrow="Part 6" title="Where loops break">
        <p>There are four practical failure modes you'll see in real systems.</p>
        <Callout kind="warn" title="1. No-progress loops">
          <p>
            The model calls the same tool with the same args, gets the same result,
            doesn't update its plan. Mitigation: detect repetition, summarize, or
            hard-cap iterations.
          </p>
        </Callout>
        <Callout kind="warn" title="2. Hallucinated tools or args">
          <p>
            The model emits a call to a tool that doesn't exist, or passes arguments
            that don't match the schema. Strict validation in the loop catches this;
            useful error messages help the model self-correct on the next turn.
          </p>
        </Callout>
        <Callout kind="warn" title="3. Context bloat">
          <p>
            History grows linearly with iterations. A 30-step task that pastes big file
            contents into every observation can blow through 100k tokens fast.
            Summarization, lazy reads, and selective truncation are the usual responses.
          </p>
        </Callout>
        <Callout kind="warn" title="4. Goal drift">
          <p>
            On longer runs the model can lose track of what it was originally asked to
            do. Periodic re-statement of the goal — even just a system reminder — is
            surprisingly effective.
          </p>
        </Callout>
      </Section>

      <Section eyebrow="Part 7" title="Check yourself">
        <Quiz
          question="An agent is stuck calling read_file('config.yaml') three times in a row, getting the same content back each time. What's most likely wrong?"
          options={[
            'The tool is broken — it should return different results',
            'The file is too big and the model is timing out',
            "The model isn't using the observation to update its plan",
            'The context window is full',
          ]}
          correct={2}
          explanation="Classic no-progress loop. The model sees the same observation but doesn't change behavior. Usually a prompt-engineering problem — the system prompt isn't pushing the model hard enough to vary its approach — or a sign the model is genuinely confused about what to do next."
        />
        <p>One more — this one's a little harder:</p>
        <p>
          You build an agent that fixes typos across 50 files in a codebase. After ~20
          successful edits, it starts making nonsense changes and ignoring its original
          instructions. What's the most likely cause?
        </p>
        <Reveal label="Show the answer">
          <p>
            Goal drift. The original instructions are now buried 30 iterations back,
            surrounded by edit observations. Common fixes: (1) periodically re-inject
            the goal as a system reminder, (2) summarize old turns and replace them
            with the summary, (3) move long-lived intent into a "scratchpad" that's
            always included verbatim in every iteration's prompt.
          </p>
        </Reveal>
      </Section>

      <Section eyebrow="Wrap" title="What you now have">
        <p>
          Every coding agent you've used — Claude Code, Cursor, Codex, your own scripts
          — is some variation of the loop above. The differences are in the tools, the
          system prompt, and how aggressively they manage the growing context. The
          underlying machine is shockingly simple: a stateless model in a four-phase
          cycle, stopping itself when it decides it's done.
        </p>
        <p>
          Next time one of these agents goes off the rails, you'll have a clean
          vocabulary for what just happened: was it a no-progress loop, a hallucinated
          call, context bloat, or goal drift? That's the diagnostic toolkit.
        </p>
      </Section>
    </LessonShell>
  );
}
