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
} from '@/lib/lattice';
import { DEFAULT_LAYOUT } from '@/lib/lattice';

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
  for (const cue of [...cues].sort((a, b) => (a.at ?? 0) - (b.at ?? 0))) {
    if ((cue.at ?? 0) > t) break;
    applyCue(cue, baseState, spawned, despawned, pendingActions);
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
): void {
  switch (cue.kind) {
    case 'transform': {
      const s = state[cue.element_id];
      if (!s) return;
      s.layout = { ...s.layout, ...stripUndefined(cue.layout) };
      return;
    }
    case 'visibility': {
      const s = state[cue.element_id];
      if (!s) return;
      s.visible = cue.visible;
      return;
    }
    case 'mask': {
      const s = state[cue.element_id];
      if (!s) return;
      s.mask = cue.mask;
      return;
    }
    case 'material': {
      const s = state[cue.element_id];
      if (!s) return;
      Object.assign(s.material, cue.params);
      return;
    }
    case 'shader-uniform': {
      const s = state[cue.element_id];
      if (!s) return;
      Object.assign(s.uniforms, cue.uniforms);
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

function stripUndefined<T extends object>(o: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k in o) {
    if (o[k] !== undefined) out[k] = o[k];
  }
  return out;
}
