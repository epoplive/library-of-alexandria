import { describe, expect, it } from 'vitest';
import { buildAnalyticSceneMapArtifact } from './analytic';
import { validateSceneMapArtifact } from './scene-map-validators';
import { generatedCorpus, generatedSceneMapArtifact, sceneMapCorpus, sceneMapCurriculum } from './test-fixtures';

describe('validateSceneMapArtifact', () => {
  it('accepts the analytic fixture apart from empty-registry interactive warnings', () => {
    const corpus = sceneMapCorpus();
    const artifact = buildAnalyticSceneMapArtifact({
      corpus,
      curriculum: sceneMapCurriculum(),
    });

    expect(validateSceneMapArtifact(artifact, { corpus }).map((diag) => diag.code)).toEqual([
      'scene-map.interactive.unknown_component',
    ]);
  });

  it('reports existing lesson sections that do not map to exactly one content-map scene', () => {
    const corpus = sceneMapCorpus();
    const artifact = buildAnalyticSceneMapArtifact({
      corpus,
      curriculum: sceneMapCurriculum(),
    });
    artifact.content_map.acts[0].scenes = artifact.content_map.acts[0].scenes.slice(0, 2);

    expect(validateSceneMapArtifact(artifact, { corpus }).map((diag) => diag.code)).toContain('scene-map.section.missing');
  });

  it('reports empty beats and beats without source sentences', () => {
    const corpus = generatedCorpus();
    const emptyBeatArtifact = generatedSceneMapArtifact();
    emptyBeatArtifact.detail.scenes[0].beats = [];
    const emptySourceArtifact = generatedSceneMapArtifact();
    emptySourceArtifact.detail.scenes[0].beats[0].source_sentence_ids = [];

    expect(validateSceneMapArtifact(emptyBeatArtifact, { corpus }).map((diag) => diag.code)).toEqual([
      'scene-map.scene.empty_beats',
    ]);
    expect(validateSceneMapArtifact(emptySourceArtifact, { corpus }).map((diag) => diag.code)).toEqual([
      'scene-map.beat.no_source_sentences',
    ]);
  });

  it('reports unknown scene cast and beat speakers', () => {
    const corpus = generatedCorpus();
    const artifact = generatedSceneMapArtifact();
    artifact.detail.scenes[0].cast_in_scene = ['unknown-cast'];
    artifact.detail.scenes[0].beats[0].speaker_ids = ['unknown-speaker'];

    expect(validateSceneMapArtifact(artifact, { corpus }).map((diag) => diag.code)).toEqual([
      'scene-map.cast.unknown',
      'scene-map.cast.unknown',
    ]);
  });

  it('warns for interactive refs when the per-lesson registry is empty', () => {
    const corpus = generatedCorpus();
    const artifact = generatedSceneMapArtifact();
    artifact.detail.scenes[0].interactive_ref = { component_id: 'GradientSurgeon' };

    const diagnostics = validateSceneMapArtifact(artifact, { corpus });
    expect(diagnostics.map((diag) => diag.code)).toEqual([
      'scene-map.interactive.unknown_component',
    ]);
    expect(diagnostics[0].severity).toBe('warning');
  });
});
