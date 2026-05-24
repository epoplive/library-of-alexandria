/* ============================================================
   Cue accumulator — turn a Shot's initial state + list of Cues
   into the effective render-time state at a given playhead `t`.

   A Cue at `at: 2.5` mutates an Element's layout / visibility /
   mask / material / shader uniforms. At any playhead time the
   Stage needs to know the current effective value of each
   mutable property. This module computes that.
   ============================================================ */

import type {
  Cue,
  Element as LatticeElement,
  ElementId,
  Layout,
  Mask,
  Scale,
  Shot,
  Vec3,
} from '@/lib/lattice';
import { DEFAULT_LAYOUT } from '@/lib/lattice';
import type { Diagnostic } from '@/lib/lesson-workflow/diagnostic-schema';
import { easingFor } from '@/lib/easing';

/** Resolved render state for a single Element at a given t. */
export interface ResolvedElementState {
  layout: Required<Pick<Layout, 'position' | 'rotation' | 'scale' | 'opacity' | 'z_order'>> &
    Pick<Layout, 'size'>;
  mask: Mask | null;
  visible: boolean;
  /** Material parameter overrides keyed by param name. */
  material: Record<string, number | string | boolean | readonly [number, number, number]>;
  /** Shader uniform overrides. */
  uniforms: Record<string, number | readonly [number, number, number] | string>;
}

/** Resolved state for the whole Shot at time `t`. Keyed by Element id.
 *  Plus the list of `action` Cues that should have fired by now (the
 *  parent decides which ones are new vs already-fired). */
export interface ResolvedShotState {
  elements: Record<ElementId, ResolvedElementState>;
  /** Ordered list of `action` Cues with `at <= t`. The Stage caller
   *  diffs against the previous tick to determine which ones to
   *  dispatch onto interactive refs. */
  pendingActions: Array<Extract<Cue, { kind: 'action' }>>;
  /** Spawned Elements (from Cues) that didn't exist at Shot start. */
  spawned: LatticeElement[];
  /** Despawned Element ids (set to invisible). */
  despawned: Set<ElementId>;
}

interface CueFieldTarget {
  cueIndex: number;
  cueId: string;
  elementId: ElementId;
  field: string;
  start: number;
  end: number;
  additive: boolean;
}

type TransitionCue = Extract<Cue, {
  kind: 'transform' | 'visibility' | 'mask' | 'material' | 'shader-uniform';
}>;
type InterpolatableValue = number | string | boolean | Vec3;

let additiveRuntimeWarningEmitted = false;

/** Compute effective state at time `t` (seconds) within a Shot. */
export function resolveShotState(
  elements: LatticeElement[],
  cues: Cue[] | undefined,
  t: number,
): ResolvedShotState {
  const baseState: Record<ElementId, ResolvedElementState> = {};
  for (const el of elements) {
    baseState[el.id] = initialStateFor(el);
  }

  const spawned: LatticeElement[] = [];
  const despawned = new Set<ElementId>();
  const pendingActions: Array<Extract<Cue, { kind: 'action' }>> = [];

  if (!cues || cues.length === 0) {
    return { elements: baseState, pendingActions, spawned, despawned };
  }

  // Apply Cues in order. Cues at exactly t are considered fired.
  for (const cue of [...cues].sort((a, b) => cueAt(a) - cueAt(b))) {
    if (cueAt(cue) > t) break;
    applyCue(cue, baseState, spawned, despawned, pendingActions, t);
  }

  // Mark despawned elements invisible.
  for (const id of despawned) {
    if (baseState[id]) baseState[id].visible = false;
  }

  // Add spawned element states.
  for (const el of spawned) {
    if (!baseState[el.id]) baseState[el.id] = initialStateFor(el);
  }

  return { elements: baseState, pendingActions, spawned, despawned };
}

export function validateCues(shot: Shot): Diagnostic[] {
  const cues = shot.cues;
  if (cues === undefined || cues.length === 0) {
    return [];
  }

  const targets: CueFieldTarget[] = [];
  for (let i = 0; i < cues.length; i += 1) {
    targets.push(...fieldTargetsForCue(cues[i], i));
  }

  const diagnostics: Diagnostic[] = [];
  for (let i = 0; i < targets.length; i += 1) {
    for (let j = i + 1; j < targets.length; j += 1) {
      const left = targets[i];
      const right = targets[j];
      if (left.elementId !== right.elementId || left.field !== right.field) {
        continue;
      }
      if (!intervalsOverlap(left, right)) {
        continue;
      }
      if (left.additive && right.additive) {
        continue;
      }
      diagnostics.push({
        code: 'cue.field.overlap',
        path: ['cues', left.cueIndex],
        actual: [left.cueId, right.cueId],
        expected: 'none',
        repair: "either remove one of the overlapping cues or set `composition: 'additive'` on both.",
        severity: 'error',
      });
    }
  }
  return diagnostics;
}

function initialStateFor(el: LatticeElement): ResolvedElementState {
  return {
    layout: {
      position: el.initial_layout?.position ?? DEFAULT_LAYOUT.position,
      rotation: el.initial_layout?.rotation ?? DEFAULT_LAYOUT.rotation,
      scale: el.initial_layout?.scale ?? DEFAULT_LAYOUT.scale,
      opacity: el.initial_layout?.opacity ?? DEFAULT_LAYOUT.opacity,
      z_order: el.initial_layout?.z_order ?? DEFAULT_LAYOUT.z_order,
      size: el.initial_layout?.size,
    },
    mask: el.initial_mask ?? null,
    visible: el.initial_visible ?? true,
    material: {},
    uniforms: {},
  };
}

function applyCue(
  cue: Cue,
  state: Record<ElementId, ResolvedElementState>,
  spawned: LatticeElement[],
  despawned: Set<ElementId>,
  pendingActions: Array<Extract<Cue, { kind: 'action' }>>,
  t: number,
): void {
  warnForAdditiveRuntime(cue);
  switch (cue.kind) {
    case 'transform': {
      const s = state[cue.element_id];
      if (!s) return;
      const progress = transitionProgress(cue, t);
      s.layout = progress === null
        ? { ...s.layout, ...stripUndefined(cue.layout) }
        : interpolateLayout(s.layout, cue.layout, progress);
      return;
    }
    case 'visibility': {
      const s = state[cue.element_id];
      if (!s) return;
      const progress = transitionProgress(cue, t);
      if (progress === null) {
        s.visible = cue.visible;
        return;
      }
      if (cue.visible) {
        s.visible = true;
        s.layout = {
          ...s.layout,
          opacity: lerpNumber(0, s.layout.opacity, progress),
        };
        return;
      }
      s.layout = {
        ...s.layout,
        opacity: lerpNumber(s.layout.opacity, 0, progress),
      };
      return;
    }
    case 'mask': {
      const s = state[cue.element_id];
      if (!s) return;
      if (transitionProgress(cue, t) === null) {
        s.mask = cue.mask;
      }
      return;
    }
    case 'material': {
      const s = state[cue.element_id];
      if (!s) return;
      const progress = transitionProgress(cue, t);
      if (progress === null) {
        Object.assign(s.material, cue.params);
        return;
      }
      Object.assign(s.material, interpolateValueMap(s.material, cue.params, progress));
      return;
    }
    case 'shader-uniform': {
      const s = state[cue.element_id];
      if (!s) return;
      const progress = transitionProgress(cue, t);
      if (progress === null) {
        Object.assign(s.uniforms, cue.uniforms);
        return;
      }
      Object.assign(s.uniforms, interpolateValueMap(s.uniforms, cue.uniforms, progress));
      return;
    }
    case 'action':
      pendingActions.push(cue);
      return;
    case 'spawn':
      spawned.push(cue.element);
      return;
    case 'despawn':
      despawned.add(cue.element_id);
      return;
  }
}

function transitionProgress(cue: TransitionCue, t: number): number | null {
  const transition = cue.transition;
  if (transition === undefined) {
    return null;
  }
  if (transition.duration_ms === undefined || transition.duration_ms <= 0) {
    return null;
  }
  if (transition.ease === undefined) {
    return null;
  }

  const at = cueAt(cue);
  const durationSeconds = transition.duration_ms / 1000;
  const raw = (t - at) / durationSeconds;
  if (raw >= 1) {
    return null;
  }
  return easingFor(transition.ease)(raw);
}

function interpolateLayout(
  current: ResolvedElementState['layout'],
  target: Layout,
  progress: number,
): ResolvedElementState['layout'] {
  const next: ResolvedElementState['layout'] = { ...current };
  if (target.position !== undefined) {
    next.position = lerpVec3(current.position, target.position, progress);
  }
  if (target.rotation !== undefined) {
    next.rotation = lerpVec3(current.rotation, target.rotation, progress);
  }
  if (target.scale !== undefined) {
    next.scale = lerpScale(current.scale, target.scale, progress);
  }
  if (target.opacity !== undefined) {
    next.opacity = lerpNumber(current.opacity, target.opacity, progress);
  }
  if (target.z_order !== undefined) {
    next.z_order = lerpNumber(current.z_order, target.z_order, progress);
  }
  if (target.size !== undefined) {
    if (current.size !== undefined) {
      next.size = {
        width: lerpNumber(current.size.width, target.size.width, progress),
        height: lerpNumber(current.size.height, target.size.height, progress),
      };
    } else if (progress >= 1) {
      next.size = target.size;
    }
  }
  return next;
}

function interpolateValueMap(
  current: Record<string, InterpolatableValue>,
  target: Record<string, InterpolatableValue>,
  progress: number,
): Record<string, InterpolatableValue> {
  const next: Record<string, InterpolatableValue> = {};
  for (const key of Object.keys(target)) {
    const targetValue = target[key];
    const currentValue = current[key];
    if (typeof currentValue === 'number' && typeof targetValue === 'number') {
      next[key] = lerpNumber(currentValue, targetValue, progress);
    } else if (isVec3(currentValue) && isVec3(targetValue)) {
      next[key] = lerpVec3(currentValue, targetValue, progress);
    } else if (progress >= 1) {
      next[key] = targetValue;
    }
  }
  return next;
}

function lerpNumber(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function lerpVec3(from: Vec3, to: Vec3, progress: number): Vec3 {
  return [
    lerpNumber(from[0], to[0], progress),
    lerpNumber(from[1], to[1], progress),
    lerpNumber(from[2], to[2], progress),
  ];
}

function lerpScale(from: Scale, to: Scale, progress: number): Scale {
  if (typeof from === 'number' && typeof to === 'number') {
    return lerpNumber(from, to, progress);
  }
  const fromVec = scaleToVec3(from);
  const toVec = scaleToVec3(to);
  return lerpVec3(fromVec, toVec, progress);
}

function scaleToVec3(scale: Scale): Vec3 {
  if (typeof scale === 'number') {
    return [scale, scale, scale];
  }
  return scale;
}

function isVec3(value: number | string | boolean | Vec3 | undefined): value is Vec3 {
  return Array.isArray(value) && value.length === 3;
}

function warnForAdditiveRuntime(cue: Cue): void {
  if (cue.composition !== 'additive' || additiveRuntimeWarningEmitted) {
    return;
  }
  additiveRuntimeWarningEmitted = true;
  console.warn(
    "additive Cue composition is accepted by validation, but runtime interpolation is TODO; using last-write-wins for now.",
  );
}

function fieldTargetsForCue(cue: Cue, cueIndex: number): CueFieldTarget[] {
  const interval = intervalForCue(cue);
  const cueId = cue.id === undefined ? `cue@${cueIndex}` : cue.id;
  const additive = cue.composition === 'additive';
  switch (cue.kind) {
    case 'transform':
      return layoutFieldTargets(cue.layout).map((field) => ({
        cueIndex,
        cueId,
        elementId: cue.element_id,
        field,
        start: interval.start,
        end: interval.end,
        additive,
      }));
    case 'visibility':
      return [{
        cueIndex,
        cueId,
        elementId: cue.element_id,
        field: 'visible',
        start: interval.start,
        end: interval.end,
        additive,
      }];
    case 'mask':
      return [{
        cueIndex,
        cueId,
        elementId: cue.element_id,
        field: 'mask',
        start: interval.start,
        end: interval.end,
        additive,
      }];
    case 'material':
      return Object.keys(cue.params).map((param) => ({
        cueIndex,
        cueId,
        elementId: cue.element_id,
        field: `material.${param}`,
        start: interval.start,
        end: interval.end,
        additive,
      }));
    case 'shader-uniform':
      return Object.keys(cue.uniforms).map((uniform) => ({
        cueIndex,
        cueId,
        elementId: cue.element_id,
        field: `uniform.${uniform}`,
        start: interval.start,
        end: interval.end,
        additive,
      }));
    case 'action':
    case 'spawn':
    case 'despawn':
      return [];
  }
  const exhaustive: never = cue;
  return exhaustive;
}

function layoutFieldTargets(layout: Layout): string[] {
  const fields: string[] = [];
  if (layout.position !== undefined) {
    fields.push('layout.position');
  }
  if (layout.rotation !== undefined) {
    fields.push('layout.rotation');
  }
  if (layout.scale !== undefined) {
    fields.push('layout.scale');
  }
  if (layout.opacity !== undefined) {
    fields.push('layout.opacity');
  }
  if (layout.z_order !== undefined) {
    fields.push('layout.z_order');
  }
  if (layout.size !== undefined) {
    fields.push('layout.size');
  }
  return fields;
}

function intervalForCue(cue: Cue): { start: number; end: number } {
  const start = cueAt(cue);
  if (!('transition' in cue) || cue.transition === undefined) {
    return { start, end: start };
  }
  const durationMs = cue.transition.duration_ms;
  if (durationMs === undefined || durationMs <= 0) {
    return { start, end: start };
  }
  return { start, end: start + durationMs / 1000 };
}

function intervalsOverlap(left: CueFieldTarget, right: CueFieldTarget): boolean {
  if (left.start === left.end && right.start === right.end) {
    return left.start === right.start;
  }
  if (left.start === left.end) {
    return right.start <= left.start && left.start < right.end;
  }
  if (right.start === right.end) {
    return left.start <= right.start && right.start < left.end;
  }
  return left.start < right.end && right.start < left.end;
}

function cueAt(cue: Cue): number {
  if (cue.at === undefined) {
    return 0;
  }
  return cue.at;
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k in o) {
    if (o[k] !== undefined) out[k] = o[k];
  }
  return out;
}
