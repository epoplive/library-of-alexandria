import { Playback } from '@/components/playback';
import { PROD, MANIFEST } from './productions/world-graph-models.generated';
import { INTERACTIVES_REGISTRY } from './interactives/registry';

export default function WorldGraphModelsLesson() {
  return (
    <Playback
      production={PROD}
      manifest={MANIFEST}
      interactives={INTERACTIVES_REGISTRY}
    />
  );
}
