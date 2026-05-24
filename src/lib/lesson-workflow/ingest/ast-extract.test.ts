import { describe, expect, it } from 'vitest';
import { extractExistingLessonSections } from './ast-extract';

const source = `
import { LessonShell, Section } from '@/components';
import { BanachPlayableScene } from './games/BanachPlayableScene';

export default function Demo() {
  return (
    <LessonShell title="Demo">
      <Section
        eyebrow="01"
        title="Fixed point"
        narration={\`Run \${2} loops\`}
        discoveries={{
          'Banach theorem': {
            brief: 'Contractions converge.',
            deep: 'A complete metric space is enough.',
          },
        }}
      >
        <BanachPlayableScene level={2} label="demo" enabled />
      </Section>
      <Section eyebrow="02" title="Broken" discoveries={{}}>
        <>{'fragment'}</>
      </Section>
    </LessonShell>
  );
}
`;

describe('extractExistingLessonSections', () => {
  it('extracts top-level LessonShell Sections', () => {
    const result = extractExistingLessonSections({
      slug: 'demo',
      filePath: 'lessons/demo/index.tsx',
      sourceText: source,
    });

    expect(result.imported_game_refs).toEqual([
      {
        component_id: 'BanachPlayableScene',
        file_ref: 'games/BanachPlayableScene.tsx',
      },
    ]);
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].section).toMatchObject({
      index: 0,
      eyebrow: '01',
      title: 'Fixed point',
      narration: 'Run 2 loops',
      child_component_ref: 'BanachPlayableScene',
      child_props: {
        enabled: true,
        label: 'demo',
        level: 2,
      },
      discoveries: {
        'Banach theorem': {
          brief: 'Contractions converge.',
          deep: 'A complete metric space is enough.',
        },
      },
    });
    expect(result.sections[0].issues).toEqual([]);
  });

  it('records missing narration and unsupported child without throwing', () => {
    const result = extractExistingLessonSections({
      slug: 'demo',
      filePath: 'lessons/demo/index.tsx',
      sourceText: source,
    });

    expect(result.sections[1].section.narration).toBe('');
    expect(result.sections[1].issues.map((issue) => issue.code)).toEqual([
      'missing-prop',
      'unsupported-child',
    ]);
  });
});
