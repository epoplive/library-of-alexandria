import type { PromptTemplateMeta } from './types';
import { curriculumV1Meta } from './curriculum.v1.meta';
import { ingestScriptV1Meta } from './ingest-script.v1.meta';
import { ingestSourcesV1Meta } from './ingest-sources.v1.meta';
import { sceneMapV1Meta } from './scene-map.v1.meta';
import { storyboardV1Meta } from './storyboard.v1.meta';

export const PROMPT_TEMPLATES: PromptTemplateMeta[] = [
  ingestSourcesV1Meta,
  ingestScriptV1Meta,
  curriculumV1Meta,
  sceneMapV1Meta,
  storyboardV1Meta,
];
