import { useState } from 'react';
import {
  LessonShell,
  Section,
  Callout,
  Quiz,
  Diagram,
  Math,
  Plot,
  Slider,
  Sandbox,
  StepThrough,
  MatchPairs,
  Reveal,
  KeyTerm,
  FreeResponse,
  AIVideo,
} from '@/components';

function OhmsLawSandbox() {
  const [voltage, setVoltage] = useState(12);
  const [resistance, setResistance] = useState(100);
  const current = voltage / resistance;
  return (
    <Sandbox
      title="Ohm's law sandbox"
      controls={
        <div className="grid grid-cols-2 gap-6">
          <Slider
            label="Voltage"
            min={0}
            max={24}
            step={0.5}
            value={voltage}
            onChange={setVoltage}
            unit="V"
          />
          <Slider
            label="Resistance"
            min={10}
            max={1000}
            step={10}
            value={resistance}
            onChange={setResistance}
            unit="Ω"
          />
        </div>
      }
    >
      <div className="text-center py-6">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-ink-muted mb-2">
          Current
        </p>
        <p className="font-display text-5xl font-semibold text-accent tabular-nums">
          {(current * 1000).toFixed(1)}
          <span className="text-2xl text-ink-muted ml-1">mA</span>
        </p>
        <div className="mt-4 text-ink-muted">
          <Math expr={`I = \\frac{V}{R} = \\frac{${voltage}}{${resistance}}`} />
        </div>
      </div>
    </Sandbox>
  );
}

export default function Welcome() {
  return (
    <LessonShell
      title="Welcome to the Learning Tool"
      subtitle="A quick tour of every component, using one running example: electricity."
      kicker="GETTING STARTED"
      estimatedMinutes={6}
    >
      <Section eyebrow="Part 1" title="The hook">
        <p>
          When you flip a light switch, something invisible races down a wire at nearly the speed of
          light, hits a bulb, and turns into a photon you can see. That whole journey is governed by
          just three quantities — and the relationship between them is so simple you can fit it on
          a postage stamp.
        </p>
        <p>
          By the end of this 6-minute tour you'll understand <KeyTerm term="Ohm's law" definition="V = IR — voltage equals current times resistance. The single most-used equation in electronics." />,
          and you'll have seen every component this tool gives an AI to build lessons.
        </p>
        <Callout kind="insight" title="What you're looking at">
          <p>
            This page is a single <code>.tsx</code> file. An AI wrote it by calling a small set of
            tools. Everything you see — the math, the chart, the interactive sandbox — is composed
            from a curated library so lessons stay consistent.
          </p>
        </Callout>
      </Section>

      <Section eyebrow="Part 2" title="The three quantities">
        <p>
          Three things tell the whole story:
        </p>
        <Diagram
          chart={`flowchart LR
  V[Voltage<br/>'pressure'] --> R[Resistance<br/>'narrow pipe']
  R --> I[Current<br/>'flow']
  style V fill:#ede9fe,stroke:#5b21b6
  style R fill:#fef3c7,stroke:#f59e0b
  style I fill:#dcfce7,stroke:#10b981`}
          caption="A useful (if imperfect) analogy: voltage pushes, resistance squeezes, current flows."
        />
        <MatchPairs
          pairs={[
            { left: 'Voltage (V)', right: 'Electrical pressure — what pushes charge' },
            { left: 'Current (I)', right: 'Rate of charge flow, measured in amps' },
            { left: 'Resistance (R)', right: 'How much the wire resists the flow' },
          ]}
        />
      </Section>

      <Section eyebrow="Part 3" title="One equation to rule them all">
        <p>The relationship between the three is shockingly simple:</p>
        <Math display expr="V = I \cdot R" />
        <p>
          Read it like a sentence: <em>voltage equals current times resistance</em>. Which means
          if you know any two, you can solve for the third.
        </p>
        <StepThrough
          steps={[
            {
              title: '1. You have a 9 V battery and a 470 Ω resistor.',
              content: (
                <p>
                  You want to know how much current will flow. You have V and R, you need I. Rearrange:{' '}
                  <Math expr="I = V / R" />.
                </p>
              ),
            },
            {
              title: '2. Plug in.',
              content: (
                <p>
                  <Math expr="I = 9 / 470 \approx 0.019\,\text{A} = 19\,\text{mA}" />. That's a
                  comfortable current for a typical LED.
                </p>
              ),
            },
            {
              title: '3. Sanity check.',
              content: (
                <p>
                  Doubling the voltage to 18 V would double the current to ~38 mA. Halving the
                  resistance would also double it. Linear in both. That's the entire law.
                </p>
              ),
            },
          ]}
        />
      </Section>

      <Section eyebrow="Part 4" title="Play with it">
        <p>
          Reading about a linear relationship is one thing. Feeling it is another. Drag the sliders.
          Notice how doubling voltage doubles current — and how a small change in resistance moves
          current a lot.
        </p>
        <OhmsLawSandbox />
        <FreeResponse
          prompt="If you keep the voltage constant at 12 V and you want to halve the current, what do you do to the resistance?"
          sampleAnswer="Double it. Since I = V/R and V is fixed, current is inversely proportional to resistance. Doubling R halves I."
        />
      </Section>

      <Section eyebrow="Part 5" title="A picture of the law">
        <p>
          When you hold resistance fixed and sweep voltage, you get a straight line through the
          origin. The slope is <Math expr="1/R" />. Steeper line = less resistance.
        </p>
        <Plot
          data={[
            { v: 0, '100Ω': 0, '500Ω': 0 },
            { v: 2, '100Ω': 0.02, '500Ω': 0.004 },
            { v: 4, '100Ω': 0.04, '500Ω': 0.008 },
            { v: 6, '100Ω': 0.06, '500Ω': 0.012 },
            { v: 8, '100Ω': 0.08, '500Ω': 0.016 },
            { v: 10, '100Ω': 0.1, '500Ω': 0.02 },
            { v: 12, '100Ω': 0.12, '500Ω': 0.024 },
          ]}
          x="v"
          y={['100Ω', '500Ω']}
          legend
          caption="Two resistors, same law. The 100 Ω resistor passes 5× as much current at any given voltage."
        />
      </Section>

      <Section eyebrow="Part 6" title="Check yourself">
        <Quiz
          question="A circuit has a 5 V source and a 1 kΩ resistor. What is the current?"
          options={['5 A', '5 mA', '0.5 A', '5 µA']}
          correct={1}
          explanation="I = V/R = 5 V / 1000 Ω = 0.005 A = 5 mA. The trick is unit-tracking — voltage in volts, resistance in ohms, current comes out in amps. 5 mA is small but very normal for hobby electronics."
        />
        <p>
          Here's a question that needs a moment of thought:
        </p>
        <p className="my-3">
          You connect a wire directly across a battery (no resistor — just a wire). What does Ohm's
          law predict?
        </p>
        <Reveal label="Show the answer">
          <p>
            With R near zero, the predicted current goes to infinity. In reality the wire heats up,
            its resistance climbs, and either the battery dies very fast or something melts. That's
            what a <strong>short circuit</strong> is — a stark reminder that the law assumes a
            non-zero resistance.
          </p>
        </Reveal>
      </Section>

      <Section eyebrow="Coming soon" title="Video, when we get there">
        <p>
          Eventually, lessons will be able to drop in short generated clips wherever a video would
          help the explanation. For now, the placeholder marks the spot:
        </p>
        <AIVideo
          prompt="A slow-motion close-up of electrons drifting through a copper wire, isometric view, soft purple lighting"
          duration={5}
          caption="An animated electron drift — useful where prose alone doesn't move."
        />
      </Section>

      <Section eyebrow="Wrap" title="That's the tour">
        <p>
          You just experienced every component this tool exposes: <code>LessonShell</code>,{' '}
          <code>Section</code>, <code>Callout</code>, <code>Math</code>, <code>Diagram</code>,{' '}
          <code>MatchPairs</code>, <code>StepThrough</code>, <code>Sandbox</code> +{' '}
          <code>Slider</code>, <code>FreeResponse</code>, <code>Plot</code>, <code>Quiz</code>,{' '}
          <code>Reveal</code>, <code>KeyTerm</code>, and <code>AIVideo</code>.
        </p>
        <p>
          Now ask an AI to make you a lesson on something you actually want to learn. The AI will
          read the catalog, follow the same conventions, and write its own <code>.tsx</code> file —
          and a few seconds later you'll have a new entry on the index page.
        </p>
      </Section>
    </LessonShell>
  );
}
