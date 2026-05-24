import type { AssetManifest, Production } from '@/lib/lattice';
import type { LessonCorpus } from '../ingest/types';
import type { ContentMap, LessonProject } from '../project-schema';
import type { SceneMapArtifact } from '../scene-map/types';
import type { Storyboard } from '../storyboard/types';
import type { InteractiveRegistrySummary } from './types';

const sourceHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const createdAt = '2026-05-24T00:00:00.000Z';

export function validateProjectFixture(): LessonProject {
  return {
    schema_version: 'loa.project.v1',
    slug: 'validate-fixture',
    identity: {
      lesson_id: 'validate-fixture',
      title: 'Validate Fixture',
      tags: [],
      current_tier: 'v0.1',
      authors: [],
    },
    source: {
      kind: 'existing-lesson',
      sections_ref: 'index.tsx',
    },
    cast_ref: 'characters.json',
    artifacts: {},
    validation: {
      tier_v0_1: 'fail',
      asset_coverage: 'missing',
      character_sprite_coverage: 'ok',
    },
    variations: [],
    funding: {
      production_cost_usd: 0,
      donations_received_usd: 0,
      donation_links: {},
      planned_improvements: [],
      ledger: [],
    },
    provenance: {
      authors: [],
      created_at: createdAt,
      license: 'CC-BY-4.0',
    },
  };
}

export function parityCorpusFixture(): LessonCorpus {
  return {
    schema_version: 'loa.lesson-corpus.v1',
    slug: 'validate-fixture',
    source_kind: 'existing-lesson',
    source_items: [],
    existing_sections: [
      {
        index: 0,
        source_section_id: 'section_one',
        eyebrow: '01',
        title: 'First Section',
        narration: 'Alpha. Beta. Gamma.',
        child_component_ref: 'WidgetGame',
        discoveries: {
          alpha: {
            brief: 'Alpha discovery.',
          },
        },
        source_offset: {
          start_line: 1,
          end_line: 5,
        },
      },
      {
        index: 1,
        source_section_id: 'section_two',
        title: 'Second Section',
        narration: 'Delta.',
        discoveries: {},
        source_offset: {
          start_line: 6,
          end_line: 8,
        },
      },
    ],
    cast_seed: [
      {
        id: 'narrator',
        name: 'Narrator',
        voice_id: 'voice-a',
      },
      {
        id: 'guest',
        name: 'Guest',
        voice_id: 'voice-b',
      },
    ],
    audio_index: {
      lesson_slug: 'validate-fixture',
      entries: [
        {
          hash: 'alpha',
          text: 'Alpha. Beta. Gamma.',
          voice_id: 'voice-a',
          file: 'alpha.mp3',
        },
      ],
    },
    interactive_inventory: [
      {
        component_id: 'WidgetGame',
      },
    ],
    discovery_inventory: [],
    provenance: {
      ingested_at: createdAt,
      extractor_version: 'test',
      source_hash: sourceHash,
    },
  };
}

export function nonExistingCorpusFixture(): LessonCorpus {
  return {
    ...parityCorpusFixture(),
    source_kind: 'topic',
    existing_sections: undefined,
  };
}

export function paritySceneMapFixture(): SceneMapArtifact {
  return {
    schema_version: 'loa.scene-map.v1',
    content_map: {
      schema_version: 'loa.content-map.v1',
      lesson_slug: 'validate-fixture',
      acts: [{
        id: 'act-1',
        title: 'Act 1',
        scenes: [
          {
            id: 'scene-one',
            source_section_id: 'section_one',
            eyebrow: '01',
            title: 'First Section',
            summary: 'First section summary.',
            learning_objective: 'Understand first section.',
            cast_in_scene: ['narrator'],
            interactive_ref: {
              component_id: 'WidgetGame',
            },
            discoveries: [],
            shots: [
              {
                id: 'shot-1',
                kind: 'narrative',
                speakers: ['narrator'],
                duration_estimate_s: 3,
                keyframes: [],
              },
            ],
          },
          {
            id: 'scene-two',
            source_section_id: 'section_two',
            title: 'Second Section',
            summary: 'Second section summary.',
            learning_objective: 'Understand second section.',
            cast_in_scene: ['narrator'],
            discoveries: [],
            shots: [
              {
                id: 'shot-2',
                kind: 'narrative',
                speakers: ['narrator'],
                duration_estimate_s: 2,
                keyframes: [],
              },
            ],
          },
        ],
      }],
    },
    detail: {
      scenes: [
        {
          scene_id: 'scene-one',
          source_section_id: 'section_one',
          eyebrow: '01',
          title: 'First Section',
          summary: 'First section summary.',
          learning_objective: 'Understand first section.',
          cast_in_scene: ['narrator'],
          interactive_ref: {
            component_id: 'WidgetGame',
          },
          discoveries: [
            {
              key: 'alpha',
              brief: 'Alpha discovery.',
              source_section_id: 'section_one',
            },
          ],
          beats: [],
          sentences: [
            sentence('s1', 'Alpha.', 0, 'section_one'),
            sentence('s2', 'Beta.', 1, 'section_one'),
            sentence('s3', 'Gamma.', 2, 'section_one'),
          ],
        },
        {
          scene_id: 'scene-two',
          source_section_id: 'section_two',
          title: 'Second Section',
          summary: 'Second section summary.',
          learning_objective: 'Understand second section.',
          cast_in_scene: ['narrator'],
          discoveries: [],
          beats: [],
          sentences: [
            sentence('s4', 'Delta.', 0, 'section_two'),
          ],
        },
      ],
    },
  };
}

export function parityStoryboardFixture(): Storyboard {
  return {
    schema_version: 'loa.storyboard.v1',
    plans: [
      plan('scene-one', 'shot-1', [
        line('line-1', 'narrator', 'Alpha.', 's1'),
        line('line-2', 'narrator', 'Beta.', 's2'),
        line('line-3', 'narrator', 'Gamma.', 's3'),
      ]),
      plan('scene-two', 'shot-2', [
        line('line-4', 'narrator', 'Delta.', 's4'),
      ]),
    ],
  };
}

export function emptyRegistryFixture(): InteractiveRegistrySummary {
  return {
    size: 0,
    complete: false,
    component_ids: [],
    contracts: [],
  };
}

export function registryFixture(): InteractiveRegistrySummary {
  return {
    size: 1,
    complete: true,
    component_ids: ['WidgetGame'],
    contracts: [
      {
        component_id: 'WidgetGame',
        methods: ['setLevel'],
      },
    ],
  };
}

export function cleanProductionFixture(): Production {
  return {
    id: 'validate-fixture',
    title: 'Validate Fixture',
    summary: 'A fixture production.',
    tags: [],
    tier: 'v0.1',
    characters: [{
      id: 'narrator',
      name: 'Narrator',
      description: 'Fixture narrator.',
      voice_profile: {
        service: 'kokoro',
        voice_id: 'voice-a',
      },
    }],
    scenes: [{
      id: 'scene-one',
      title: 'First Section',
      shots: [
        {
          id: 'title',
          elements: [],
        },
        {
          id: 'shot-1',
          duration: 3,
          elements: [{
            id: 'label',
            kind: 'text-overlay',
            text: 'Alpha',
          }],
          vo: {
            cast_id: 'narrator',
            line: {
              text: 'Alpha.',
            },
            audio: {
              slot_id: 'audio-alpha',
            },
          },
        },
      ],
    }],
    transitions: [{
      id: 't1',
      from: {
        scene_id: 'scene-one',
        shot_id: 'title',
      },
      to: {
        scene_id: 'scene-one',
        shot_id: 'shot-1',
      },
      kind: 'cut',
      duration_ms: 0,
    }],
    funding: {
      production_cost_usd: 0,
      donations_received_usd: 0,
      donation_links: {},
      planned_improvements: [],
      ledger: [],
    },
    provenance: {
      authors: ['Fixture'],
      created_at: createdAt,
      license: 'CC-BY-4.0',
    },
  };
}

export function cleanManifestFixture(): AssetManifest {
  return {
    production_id: 'validate-fixture',
    slots: {
      'audio-alpha': {
        id: 'audio-alpha',
        kind: 'audio-vo',
        description: 'Alpha VO.',
        takes: [],
      },
    },
    ledger: [],
  };
}

export function cleanContentMapFixture(): ContentMap {
  return {
    schema_version: 'loa.content-map.v1',
    lesson_slug: 'validate-fixture',
    acts: [{
      id: 'act-1',
      title: 'Act 1',
      scenes: [{
        id: 'scene-one',
        title: 'First Section',
        cast_in_scene: ['narrator'],
        discoveries: [],
        shots: [
          {
            id: 'title',
            kind: 'title-card',
            speakers: [],
            duration_estimate_s: 1,
            keyframes: [],
          },
          {
            id: 'shot-1',
            kind: 'narrative',
            speakers: ['narrator'],
            duration_estimate_s: 3,
            keyframes: [],
          },
        ],
      }],
    }],
  };
}

export function problemProductionFixture(): Production {
  return {
    ...cleanProductionFixture(),
    scenes: [{
      id: 'scene-one',
      title: 'First Section',
      shots: [
        {
          id: 'title',
          elements: [],
        },
        {
          id: 'shot-1',
          duration: 3,
          elements: [
            {
              id: 'box',
              kind: 'text-overlay',
              text: 'Box',
            },
            {
              id: 'game',
              kind: 'interactive-group',
              component_id: 'WidgetGame',
            },
            {
              id: 'missing-game',
              kind: 'interactive-group',
              component_id: 'MissingGame',
            },
          ],
          vo: {
            cast_id: 'ghost',
            line: {
              text: 'Unknown speaker.',
            },
            audio: {
              slot_id: 'missing-audio',
            },
          },
          cues: [
            {
              kind: 'action',
              element_id: 'game',
              method: 'missingMethod',
            },
            {
              kind: 'transform',
              element_id: 'box',
              at: 0,
              layout: {
                opacity: 0.5,
              },
              transition: {
                duration_ms: 1000,
              },
            },
            {
              kind: 'transform',
              element_id: 'box',
              at: 0.5,
              layout: {
                opacity: 1,
              },
              transition: {
                duration_ms: 1000,
              },
            },
          ],
        },
        {
          id: 'shot-2',
          duration: 1,
          elements: [],
        },
      ],
    }],
    transitions: [{
      id: 'bad-transition',
      from: {
        scene_id: 'scene-one',
        shot_id: 'title',
      },
      to: {
        scene_id: 'scene-one',
        shot_id: 'shot-2',
      },
      kind: 'cut',
      duration_ms: 0,
    }],
  };
}

export function problemContentMapFixture(): ContentMap {
  return {
    ...cleanContentMapFixture(),
    acts: [{
      id: 'act-1',
      title: 'Act 1',
      scenes: [
        {
          id: 'scene-one',
          title: 'First Section',
          cast_in_scene: ['narrator'],
          discoveries: [],
          shots: [
            {
              id: 'title',
              kind: 'title-card',
              speakers: [],
              duration_estimate_s: 1,
              keyframes: [],
            },
            {
              id: 'shot-1',
              kind: 'narrative',
              speakers: ['narrator'],
              duration_estimate_s: 3,
              keyframes: [],
            },
            {
              id: 'shot-2',
              kind: 'narrative',
              speakers: [],
              duration_estimate_s: 1,
              keyframes: [],
            },
          ],
        },
        {
          id: 'empty-scene',
          title: 'Empty Scene',
          cast_in_scene: [],
          discoveries: [],
          shots: [],
        },
      ],
    }],
  };
}

function sentence(id: string, text: string, sourceOffset: number, sourceSectionId: string) {
  return {
    id,
    canonical_text: text,
    normalized_text: text.toLowerCase(),
    source_section_id: sourceSectionId,
    source_offset: sourceOffset,
  };
}

function line(id: string, castId: string, text: string, sourceSentenceId: string) {
  return {
    id,
    cast_id: castId,
    text,
    source_sentence_ids: [sourceSentenceId],
    audio_slot_id: `${id}.audio`,
  };
}

function plan(sceneId: string, shotId: string, lines: ReturnType<typeof line>[]) {
  return {
    kind: 'narrative' as const,
    shot_address: {
      scene_id: sceneId,
      shot_id: shotId,
    },
    speakers: ['narrator'],
    spoken_lines: lines,
    duration_estimate_s: lines.length,
  };
}
