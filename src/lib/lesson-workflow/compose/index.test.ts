import { describe, expect, it } from 'vitest';
import { runCompose } from './index';
import {
  fixtureCast,
  fixtureContentMap,
  fixtureInteractives,
  fixtureStoryboard,
} from './test-fixtures';

describe('runCompose', () => {
  it('composes a storyboard fixture into Production, AssetManifest, and generated TS', async () => {
    const result = await runCompose({
      slug: 'compose-fixture',
      storyboard: fixtureStoryboard(),
      contentMap: fixtureContentMap(),
      cast: fixtureCast(),
      interactives: fixtureInteractives(),
      productionId: 'compose-fixture',
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.production.scenes).toHaveLength(1);
    expect(result.production.scenes[0].shots).toHaveLength(2);
    expect(Object.keys(result.manifest.slots)).toHaveLength(1);
    expect(result.generatedTs.length).toBeGreaterThan(0);
    expect(result.generatedTs).toContain('export const PROD: Production =');
    expect(result.generatedTs).toContain('export const MANIFEST: AssetManifest =');
  });
});
