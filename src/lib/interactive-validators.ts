import type { Diagnostic } from './lesson-workflow/diagnostic-schema';
import type {
  Cue,
  InteractiveGroupElement,
  Production,
  Shot,
} from './lattice';
import type { InteractivesRegistry } from './interactives';
import { getInteractive } from './interactives';

export function validateInteractiveActions(
  production: Production,
  registry: InteractivesRegistry,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (let sceneIndex = 0; sceneIndex < production.scenes.length; sceneIndex += 1) {
    const scene = production.scenes[sceneIndex];
    for (let shotIndex = 0; shotIndex < scene.shots.length; shotIndex += 1) {
      const shot = scene.shots[shotIndex];
      const cues = shot.cues;
      if (cues === undefined) {
        continue;
      }
      const interactiveElements = interactiveElementsForShot(shot);
      for (let cueIndex = 0; cueIndex < cues.length; cueIndex += 1) {
        const cue = cues[cueIndex];
        if (cue.kind !== 'action') {
          continue;
        }
        const element = interactiveElements[cue.element_id];
        if (element === undefined) {
          continue;
        }
        const entry = getInteractive(registry, element.component_id);
        if (entry === undefined) {
          continue;
        }
        const validMethods = Object.keys(entry.contract.methods);
        if (entry.contract.methods[cue.method] !== undefined) {
          continue;
        }
        diagnostics.push({
          code: 'interactive.action.unknown_method',
          path: ['scenes', sceneIndex, 'shots', shotIndex, 'cues', cueIndex, 'method'],
          actual: {
            component_id: element.component_id,
            method: cue.method,
          },
          expected: validMethods,
          repair: `use one of ${validMethods.join(', ')} on "${element.component_id}".`,
          severity: 'error',
        });
      }
    }
  }
  return diagnostics;
}

export function validateRegistryCoverage(
  production: Production,
  registry: InteractivesRegistry,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (let sceneIndex = 0; sceneIndex < production.scenes.length; sceneIndex += 1) {
    const scene = production.scenes[sceneIndex];
    for (let shotIndex = 0; shotIndex < scene.shots.length; shotIndex += 1) {
      const shot = scene.shots[shotIndex];
      for (let elementIndex = 0; elementIndex < shot.elements.length; elementIndex += 1) {
        const element = shot.elements[elementIndex];
        if (element.kind !== 'interactive-group') {
          continue;
        }
        if (getInteractive(registry, element.component_id) !== undefined) {
          continue;
        }
        diagnostics.push({
          code: 'interactive.component.unregistered',
          path: ['scenes', sceneIndex, 'shots', shotIndex, 'elements', elementIndex, 'component_id'],
          actual: element.component_id,
          expected: 'component_id registered in InteractivesRegistry',
          repair: `register interactive component "${element.component_id}".`,
          severity: 'error',
        });
      }
    }
  }
  return diagnostics;
}

function interactiveElementsForShot(shot: Shot): { [element_id: string]: InteractiveGroupElement } {
  const elements: { [element_id: string]: InteractiveGroupElement } = {};
  for (const element of shot.elements) {
    if (element.kind === 'interactive-group') {
      elements[element.id] = element;
    }
  }
  const cues = shot.cues;
  if (cues === undefined) {
    return elements;
  }
  for (const cue of cues) {
    const spawned = spawnedInteractive(cue);
    if (spawned !== null) {
      elements[spawned.id] = spawned;
    }
  }
  return elements;
}

function spawnedInteractive(cue: Cue): InteractiveGroupElement | null {
  if (cue.kind !== 'spawn') {
    return null;
  }
  if (cue.element.kind !== 'interactive-group') {
    return null;
  }
  return cue.element;
}
