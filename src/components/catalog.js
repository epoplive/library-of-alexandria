export const COMPONENTS = [
    {
        name: 'LessonShell',
        category: 'shell',
        whenToUse: 'ALWAYS the outermost component of a lesson. Provides the page frame, back link, title block, and consistent typography.',
        props: [
            { name: 'title', type: 'string', required: true, description: 'Main lesson title.' },
            { name: 'subtitle', type: 'string', required: false, description: 'One-line hook beneath the title.' },
            { name: 'kicker', type: 'string', required: false, description: 'Short label above the title (e.g. "BIOLOGY · 12 min read").' },
            { name: 'estimatedMinutes', type: 'number', required: false, description: 'Reading time estimate shown top-right.' },
            { name: 'children', type: 'ReactNode', required: true, description: 'The lesson body — typically a sequence of <Section>s.' },
        ],
        example: `<LessonShell
  title="How a transistor works"
  subtitle="The switch that made modern computing possible."
  kicker="ELECTRONICS"
  estimatedMinutes={8}
>
  <Section eyebrow="Part 1" title="The simplest switch">
    <p>Every computer is built from billions of tiny switches…</p>
  </Section>
</LessonShell>`,
    },
    {
        name: 'Section',
        category: 'shell',
        whenToUse: 'Top-level chapter of a lesson. Each Section becomes its own PAGE in the paginated lesson shell — design it to stand alone on a single screen. Use 3–7 Sections per lesson.',
        props: [
            { name: 'title', type: 'string', required: false, description: 'Section title.' },
            { name: 'eyebrow', type: 'string', required: false, description: 'Small label above title (e.g. "Part 2", "01").' },
            { name: 'layout', type: '"prose" | "slide"', required: false, description: '"prose" (default) is reading-width with typographic body styling. "slide" is presentation mode — fills the viewport vertically with the title centered at top and content centered in the remaining space, no max-width on body. Use "slide" for image/animation-heavy lessons; use "prose" for text-heavy ones.' },
            { name: 'children', type: 'ReactNode', required: true, description: 'Section body.' },
        ],
        example: `<Section layout="slide" eyebrow="01" title="The illusion">
  <BigAnimatedThing />
</Section>`,
    },
    {
        name: 'Callout',
        category: 'prose',
        whenToUse: 'Highlight a key insight, an aside, a warning, or a quick info box. Use sparingly — at most 1–2 per section.',
        props: [
            { name: 'kind', type: '"insight" | "info" | "warn" | "aside"', required: false, description: 'Visual style. Default "insight".' },
            { name: 'title', type: 'string', required: false, description: 'Optional bold header.' },
            { name: 'children', type: 'ReactNode', required: true, description: 'The body content.' },
        ],
        example: `<Callout kind="insight" title="The key idea">
  <p>A transistor is just a valve where one current controls another.</p>
</Callout>`,
    },
    {
        name: 'Quiz',
        category: 'interactive',
        whenToUse: 'Multiple-choice check-in. Use at section boundaries to reinforce a concept just taught. Aim for 1 per major section.',
        whenNotToUse: 'Avoid for trivia. Quiz questions should test understanding, not recall of a specific number/word.',
        props: [
            { name: 'question', type: 'string', required: true, description: 'The question being asked.' },
            { name: 'options', type: 'string[]', required: true, description: 'Answer choices — 2 to 5 items.' },
            { name: 'correct', type: 'number', required: true, description: 'Zero-based index of the correct option.' },
            { name: 'explanation', type: 'string', required: false, description: 'Shown after answering — explain WHY, not just whether they were right.' },
        ],
        example: `<Quiz
  question="If you double the base current, what happens to the collector current?"
  options={[
    "It doubles",
    "It stays the same",
    "It increases by a factor much larger than 2",
    "It drops to zero",
  ]}
  correct={2}
  explanation="The transistor's gain (β) means a small change in base current causes a much larger change in collector current. That's why it can amplify."
/>`,
    },
    {
        name: 'FreeResponse',
        category: 'interactive',
        whenToUse: 'Get the learner to articulate an answer in their own words before revealing a sample. Use for "explain why" or "predict what happens" prompts.',
        props: [
            { name: 'prompt', type: 'string', required: true, description: 'The question to think through.' },
            { name: 'sampleAnswer', type: 'string', required: false, description: 'Revealed after the user has typed something.' },
            { name: 'placeholder', type: 'string', required: false, description: 'Textarea placeholder hint.' },
        ],
        example: `<FreeResponse
  prompt="Why does adding a resistor in series with the base prevent the transistor from burning out?"
  sampleAnswer="Without a resistor, the base-emitter junction acts like a forward-biased diode — once it conducts, current is limited only by the supply. A series resistor caps that current to a safe value."
/>`,
    },
    {
        name: 'Reveal',
        category: 'interactive',
        whenToUse: 'Hide an answer, hint, or extra detail until the learner clicks. Great after posing a question inline in prose.',
        props: [
            { name: 'label', type: 'string', required: false, description: 'Button label. Default "Show answer".' },
            { name: 'children', type: 'ReactNode', required: true, description: 'The hidden content.' },
        ],
        example: `<p>What happens to the LED if you flip the battery?</p>
<Reveal label="Show answer">
  <p>It stops glowing — LEDs only conduct in one direction.</p>
</Reveal>`,
    },
    {
        name: 'Slider',
        category: 'interactive',
        whenToUse: 'Let the learner manipulate a parameter and see the effect. Pair with a Plot, Math, or Sandbox to drive a simulation.',
        props: [
            { name: 'label', type: 'string', required: true, description: 'Label shown above the slider.' },
            { name: 'min', type: 'number', required: false, description: 'Default 0.' },
            { name: 'max', type: 'number', required: false, description: 'Default 100.' },
            { name: 'step', type: 'number', required: false, description: 'Default 1.' },
            { name: 'defaultValue', type: 'number', required: false, description: 'Starting value (uncontrolled).' },
            { name: 'value', type: 'number', required: false, description: 'Controlled value — pass with onChange.' },
            { name: 'unit', type: 'string', required: false, description: 'Suffix shown next to value (e.g. "°C", "mV").' },
            { name: 'onChange', type: '(v: number) => void', required: false, description: 'Called on change.' },
        ],
        example: `const [r, setR] = useState(100);
return (
  <Sandbox
    title="Ohm's law"
    controls={<Slider label="Resistance" min={10} max={1000} value={r} onChange={setR} unit="Ω" />}
  >
    <p>Current: <Math expr={\`I = \${(12/r).toFixed(3)}\\\\,\\\\text{A}\`} /></p>
  </Sandbox>
);`,
    },
    {
        name: 'KeyTerm',
        category: 'prose',
        whenToUse: 'Inline definition for a technical term — hover/tap reveals the definition. Use the FIRST time a term appears.',
        props: [
            { name: 'term', type: 'ReactNode', required: true, description: 'The term as it appears in the sentence.' },
            { name: 'definition', type: 'ReactNode', required: true, description: 'Tooltip text — keep to 1–2 sentences.' },
        ],
        example: `<p>
  The <KeyTerm term="emitter" definition="The transistor terminal that 'emits' charge carriers into the base region." /> sits at the bottom of the symbol.
</p>`,
    },
    {
        name: 'Diagram',
        category: 'visual',
        whenToUse: 'Render a Mermaid diagram — flowcharts, sequence diagrams, state machines, simple graphs.',
        whenNotToUse: 'Not for charts of numerical data — use <Plot>. Not for math equations — use <Math>.',
        props: [
            { name: 'chart', type: 'string', required: true, description: 'Mermaid source. Must start with a valid diagram type (graph, flowchart, sequenceDiagram, stateDiagram-v2, etc).' },
            { name: 'caption', type: 'string', required: false, description: 'Caption below the diagram.' },
        ],
        example: `<Diagram
  chart={\`flowchart LR
    A[Base] -->|small current| B((Transistor))
    C[Collector] -->|amplified| B
    B --> D[Emitter]\`}
  caption="Small base current controls a large collector current."
/>`,
        notes: 'Mermaid is finicky about syntax — keep diagrams simple. Always test with a single arrow before adding complexity.',
    },
    {
        name: 'Math',
        category: 'visual',
        whenToUse: 'Render LaTeX math. Use inline (default) for in-sentence formulas; use display=true for centered, larger equations.',
        props: [
            { name: 'expr', type: 'string', required: true, description: 'LaTeX expression. In TSX strings, escape backslashes (\\\\frac).' },
            { name: 'display', type: 'boolean', required: false, description: 'true for block/display mode. Default false (inline).' },
        ],
        example: `<p>Ohm's law: <Math expr="V = IR" /></p>
<Math display expr="\\\\frac{d}{dt}\\\\left[ \\\\sum_i m_i v_i \\\\right] = F_{ext}" />`,
    },
    {
        name: 'Plot',
        category: 'visual',
        whenToUse: 'Line or bar chart of numerical data. Use when the relationship between numbers is itself the lesson.',
        props: [
            { name: 'data', type: 'Array<Record<string, number | string>>', required: true, description: 'Array of objects. Each object is one data point.' },
            { name: 'x', type: 'string', required: true, description: 'Key in each datum used for the x-axis.' },
            { name: 'y', type: 'string | string[]', required: true, description: 'Key(s) plotted on the y-axis. Pass an array for multiple series.' },
            { name: 'kind', type: '"line" | "bar"', required: false, description: 'Default "line".' },
            { name: 'caption', type: 'string', required: false, description: 'Caption below the chart.' },
            { name: 'height', type: 'number', required: false, description: 'Pixel height. Default 280.' },
            { name: 'legend', type: 'boolean', required: false, description: 'Show legend (useful for multi-series).' },
        ],
        example: `<Plot
  data={[
    { v: 0, i: 0 },
    { v: 2, i: 0.02 },
    { v: 4, i: 0.04 },
    { v: 6, i: 0.06 },
  ]}
  x="v"
  y="i"
  caption="Current rises linearly with voltage — that's Ohm's law in one picture."
/>`,
    },
    {
        name: 'Sandbox',
        category: 'interactive',
        whenToUse: 'Container for a custom interactive simulation. Put a visual/output in children, and put input widgets (Slider, buttons) in the controls slot.',
        props: [
            { name: 'title', type: 'string', required: false, description: 'Header label.' },
            { name: 'controls', type: 'ReactNode', required: false, description: 'Input widgets rendered in a footer.' },
            { name: 'children', type: 'ReactNode', required: true, description: 'The visual/output area.' },
        ],
        example: `function PendulumSim() {
  const [length, setLength] = useState(1);
  const period = 2 * Math.PI * Math.sqrt(length / 9.81);
  return (
    <Sandbox
      title="Pendulum period"
      controls={<Slider label="Length" min={0.1} max={5} step={0.1} value={length} onChange={setLength} unit="m" />}
    >
      <p>Period: <Math expr={\`T = \${period.toFixed(2)}\\\\,\\\\text{s}\`} /></p>
    </Sandbox>
  );
}`,
        notes: 'A Sandbox is a function-component pattern: define a small inner component that owns useState, render the Sandbox from it. The lesson default export wires these together.',
    },
    {
        name: 'StepThrough',
        category: 'interactive',
        whenToUse: 'Walk the learner through a sequence of states one at a time (e.g., steps of a derivation, frames of an animation, stages of a process).',
        props: [
            { name: 'steps', type: 'Array<{ title?: string; content: ReactNode }>', required: true, description: '3–8 steps work best.' },
        ],
        example: `<StepThrough steps={[
  { title: "1. Voltage applied", content: <p>A small voltage pushes electrons at the base…</p> },
  { title: "2. Junction forward-biased", content: <p>The base-emitter junction starts conducting…</p> },
  { title: "3. Amplification", content: <p>A much larger current now flows collector→emitter.</p> },
]} />`,
    },
    {
        name: 'MatchPairs',
        category: 'interactive',
        whenToUse: 'Drill on a set of term↔definition pairings. Best for vocabulary or concept-association practice.',
        props: [
            { name: 'pairs', type: 'Array<{ left: string; right: string }>', required: true, description: '3–6 pairs work best. Right column is auto-shuffled.' },
        ],
        example: `<MatchPairs pairs={[
  { left: "Voltage", right: "Electrical pressure" },
  { left: "Current", right: "Flow of charge" },
  { left: "Resistance", right: "Opposition to flow" },
]} />`,
    },
    {
        name: 'AIVideo',
        category: 'media',
        whenToUse: 'Drop a video placeholder where a generated clip belongs. For v1 it renders a styled placeholder; once video generation is wired up, pass src to render the actual video.',
        props: [
            { name: 'prompt', type: 'string', required: true, description: 'The prompt that will be used to generate the video.' },
            { name: 'caption', type: 'string', required: false, description: 'Caption below the video.' },
            { name: 'duration', type: 'number', required: false, description: 'Target seconds.' },
            { name: 'src', type: 'string', required: false, description: 'URL of the generated video. When set, renders <video> instead of placeholder.' },
        ],
        example: `<AIVideo
  prompt="A close-up animation of an electron crossing the base-emitter junction, slow motion, isometric view"
  duration={6}
  caption="Electrons crossing the junction."
/>`,
    },
];
export function catalogIndexText() {
    const lines = [];
    lines.push('# Component Index');
    lines.push('');
    lines.push('All from `@/components`. Names only here — call `describe_components(["Name", ...])` for full props + examples on the components you actually use.');
    lines.push('');
    const byCategory = new Map();
    for (const c of COMPONENTS) {
        if (!byCategory.has(c.category))
            byCategory.set(c.category, []);
        byCategory.get(c.category).push(c);
    }
    for (const [cat, items] of byCategory) {
        lines.push(`**${cat}**`);
        for (const c of items) {
            const oneLine = c.whenToUse.split('. ')[0];
            lines.push(`- \`${c.name}\` — ${oneLine}`);
        }
        lines.push('');
    }
    return lines.join('\n').trim();
}
function describeOne(c) {
    const lines = [];
    lines.push(`## <${c.name}>  · ${c.category}`);
    lines.push('');
    lines.push(`**Use for:** ${c.whenToUse}`);
    if (c.whenNotToUse)
        lines.push(`**Avoid for:** ${c.whenNotToUse}`);
    lines.push('');
    lines.push('**Props:**');
    for (const p of c.props) {
        lines.push(`- \`${p.name}\` *(${p.type}${p.required ? ', required' : ''})* — ${p.description}`);
    }
    lines.push('');
    lines.push('**Example:**');
    lines.push('```tsx');
    lines.push(c.example);
    lines.push('```');
    if (c.notes) {
        lines.push('');
        lines.push(`**Notes:** ${c.notes}`);
    }
    return lines.join('\n');
}
export function describeComponentsText(names) {
    if (names.length === 0)
        return 'No component names provided.';
    const known = new Map(COMPONENTS.map((c) => [c.name, c]));
    const sections = [];
    const unknown = [];
    for (const n of names) {
        const c = known.get(n);
        if (c)
            sections.push(describeOne(c));
        else
            unknown.push(n);
    }
    let out = sections.join('\n\n');
    if (unknown.length) {
        out +=
            (out ? '\n\n' : '') +
                `_Unknown: ${unknown.join(', ')}. Valid names: ${COMPONENTS.map((c) => c.name).join(', ')}._`;
    }
    return out;
}
export const COMPONENT_NAMES = COMPONENTS.map((c) => c.name);
