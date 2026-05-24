import type { Diagnostic } from '@/lib/lesson-workflow/diagnostic-schema';
import type {
  Production,
  Shot,
  ShotAddress,
  Transition,
  TransitionEdge,
} from './lattice';

export type NormalizableProduction = Omit<Production, 'transitions'> & {
  transitions?: TransitionEdge[];
};

interface TimelineEntry {
  sceneIndex: number;
  shotIndex: number;
  address: ShotAddress;
  shot: Shot;
}

export class LatticeDiagnosticError extends Error {
  readonly diagnostics: Diagnostic[];

  constructor(message: string, diagnostics: Diagnostic[]) {
    super(message);
    this.name = 'LatticeDiagnosticError';
    this.diagnostics = diagnostics;
  }
}

export function normalizeProduction(production: NormalizableProduction): Production {
  const timeline = canonicalTimeline(production);
  const nextAddressByAddress = new Map<string, ShotAddress>();
  const pairOrder = new Map<string, number>();

  for (let i = 0; i < timeline.length - 1; i += 1) {
    const from = timeline[i].address;
    const to = timeline[i + 1].address;
    nextAddressByAddress.set(addressKey(from), to);
    pairOrder.set(pairKey(from, to), i);
  }

  const diagnostics: Diagnostic[] = [];
  const edgesByPair = new Map<string, TransitionEdge>();
  const explicitTransitions = production.transitions === undefined ? [] : production.transitions;

  for (let i = 0; i < explicitTransitions.length; i += 1) {
    addEdge({
      edge: explicitTransitions[i],
      path: ['transitions', i],
      diagnostics,
      edgesByPair,
      nextAddressByAddress,
    });
  }

  for (let i = 0; i < timeline.length - 1; i += 1) {
    const fromEntry = timeline[i];
    const toEntry = timeline[i + 1];
    const outgoing = fromEntry.shot.transition_out;
    const incoming = toEntry.shot.transition_in;

    if (outgoing === undefined && incoming === undefined) {
      continue;
    }

    const legacyEdge = legacyTransitionEdge({
      outgoing,
      incoming,
      from: fromEntry.address,
      to: toEntry.address,
      fromPath: ['scenes', fromEntry.sceneIndex, 'shots', fromEntry.shotIndex, 'transition_out'],
      toPath: ['scenes', toEntry.sceneIndex, 'shots', toEntry.shotIndex, 'transition_in'],
      diagnostics,
    });

    if (legacyEdge !== null) {
      addEdge({
        edge: legacyEdge,
        path: [
          'scenes',
          fromEntry.sceneIndex,
          'shots',
          fromEntry.shotIndex,
          'transition_out',
        ],
        diagnostics,
        edgesByPair,
        nextAddressByAddress,
      });
    }
  }

  if (diagnostics.length > 0) {
    throw new LatticeDiagnosticError('Production normalization failed', diagnostics);
  }

  const transitions = [...edgesByPair.values()].sort((a, b) => {
    const aOrder = pairOrder.get(pairKey(a.from, a.to));
    const bOrder = pairOrder.get(pairKey(b.from, b.to));
    if (aOrder === undefined || bOrder === undefined) {
      return 0;
    }
    return aOrder - bOrder;
  });

  return {
    ...production,
    scenes: production.scenes.map((scene) => ({
      ...scene,
      shots: scene.shots.map(stripDeprecatedTransitions),
    })),
    transitions,
  };
}

function canonicalTimeline(production: NormalizableProduction): TimelineEntry[] {
  const timeline: TimelineEntry[] = [];
  for (let sceneIndex = 0; sceneIndex < production.scenes.length; sceneIndex += 1) {
    const scene = production.scenes[sceneIndex];
    for (let shotIndex = 0; shotIndex < scene.shots.length; shotIndex += 1) {
      const shot = scene.shots[shotIndex];
      timeline.push({
        sceneIndex,
        shotIndex,
        address: { scene_id: scene.id, shot_id: shot.id },
        shot,
      });
    }
  }
  return timeline;
}

function stripDeprecatedTransitions(shot: Shot): Shot {
  const { transition_in: _transitionIn, transition_out: _transitionOut, ...rest } = shot;
  return rest;
}

function addEdge(args: {
  edge: TransitionEdge;
  path: Array<string | number>;
  diagnostics: Diagnostic[];
  edgesByPair: Map<string, TransitionEdge>;
  nextAddressByAddress: Map<string, ShotAddress>;
}): void {
  const expectedTo = args.nextAddressByAddress.get(addressKey(args.edge.from));
  if (expectedTo === undefined || !sameAddress(expectedTo, args.edge.to)) {
    args.diagnostics.push({
      code: 'transition.edge.non_adjacent',
      path: args.path,
      actual: {
        id: args.edge.id,
        from: args.edge.from,
        to: args.edge.to,
      },
      expected: 'an edge from a Shot to the next Shot in canonical timeline order',
      repair: 'connect this transition to adjacent shots or remove it',
      severity: 'error',
    });
    return;
  }

  if (args.edge.duration_ms < 0) {
    args.diagnostics.push({
      code: 'transition.edge.duration',
      path: [...args.path, 'duration_ms'],
      actual: args.edge.duration_ms,
      expected: 'a non-negative duration in milliseconds',
      repair: 'set duration_ms to 0 or a positive millisecond value',
      severity: 'error',
    });
    return;
  }

  if (args.edge.kind === 'cut' && args.edge.duration_ms !== 0) {
    args.diagnostics.push({
      code: 'transition.edge.cut_duration',
      path: [...args.path, 'duration_ms'],
      actual: args.edge.duration_ms,
      expected: 0,
      repair: 'set cut transitions to duration_ms: 0',
      severity: 'error',
    });
    return;
  }

  const key = pairKey(args.edge.from, args.edge.to);
  const existing = args.edgesByPair.get(key);
  if (existing !== undefined) {
    if (!sameEdgeSemantics(existing, args.edge)) {
      args.diagnostics.push({
        code: 'transition.edge.conflict',
        path: args.path,
        actual: [
          edgeDiagnosticPayload(existing),
          edgeDiagnosticPayload(args.edge),
        ],
        expected: 'one transition edge per adjacent Shot pair',
        repair: 'remove one transition or make the kind, duration_ms, direction, shader, and angle match',
        severity: 'error',
      });
    }
    return;
  }

  args.edgesByPair.set(key, args.edge);
}

function legacyTransitionEdge(args: {
  outgoing: Transition | undefined;
  incoming: Transition | undefined;
  from: ShotAddress;
  to: ShotAddress;
  fromPath: Array<string | number>;
  toPath: Array<string | number>;
  diagnostics: Diagnostic[];
}): TransitionEdge | null {
  const outgoingEdge = args.outgoing === undefined
    ? null
    : edgeFromLegacy(args.outgoing, args.from, args.to, args.fromPath, args.diagnostics);
  const incomingEdge = args.incoming === undefined
    ? null
    : edgeFromLegacy(args.incoming, args.from, args.to, args.toPath, args.diagnostics);

  if (outgoingEdge !== null && incomingEdge !== null && !sameEdgeSemantics(outgoingEdge, incomingEdge)) {
    args.diagnostics.push({
      code: 'transition.edge.conflict',
      path: args.toPath,
      actual: [
        edgeDiagnosticPayload(outgoingEdge),
        edgeDiagnosticPayload(incomingEdge),
      ],
      expected: 'matching deprecated transition_out and transition_in declarations',
      repair: 'keep one deprecated transition declaration or make both kind and duration match',
      severity: 'error',
    });
    return null;
  }

  if (outgoingEdge !== null) {
    return outgoingEdge;
  }
  return incomingEdge;
}

function edgeFromLegacy(
  transition: Transition,
  from: ShotAddress,
  to: ShotAddress,
  path: Array<string | number>,
  diagnostics: Diagnostic[],
): TransitionEdge | null {
  const kind = legacyKind(transition.kind);
  const duration = legacyDurationMs(transition, path, diagnostics);
  if (duration === null) {
    return null;
  }
  const edge: TransitionEdge = {
    id: legacyEdgeId(from, to),
    from,
    to,
    kind,
    duration_ms: duration,
  };
  if (transition.shader !== undefined) {
    edge.shader = transition.shader;
  }
  if (transition.angle !== undefined) {
    edge.angle = transition.angle;
  }
  return edge;
}

function legacyKind(kind: Transition['kind']): TransitionEdge['kind'] {
  switch (kind) {
    case 'cut':
      return 'cut';
    case 'dissolve':
      return 'cross-dissolve';
    case 'fade':
      return 'fade';
    case 'wipe':
      return 'wipe';
    case 'iris':
      return 'iris';
    case 'shader':
      return 'shader';
  }
  const exhaustive: never = kind;
  return exhaustive;
}

function legacyDurationMs(
  transition: Transition,
  path: Array<string | number>,
  diagnostics: Diagnostic[],
): number | null {
  if (transition.duration === undefined) {
    if (transition.kind === 'cut') {
      return 0;
    }
    diagnostics.push({
      code: 'transition.deprecated.duration.required',
      path: [...path, 'duration'],
      actual: null,
      expected: 'duration in seconds for deprecated non-cut transition declarations',
      repair: 'set duration on the deprecated transition or move it to Production.transitions[]',
      severity: 'error',
    });
    return null;
  }
  if (transition.duration < 0) {
    diagnostics.push({
      code: 'transition.deprecated.duration',
      path: [...path, 'duration'],
      actual: transition.duration,
      expected: 'a non-negative duration in seconds',
      repair: 'set duration to 0 or a positive value',
      severity: 'error',
    });
    return null;
  }
  return Math.round(transition.duration * 1000);
}

function legacyEdgeId(from: ShotAddress, to: ShotAddress): string {
  return `transition.${from.scene_id}.${from.shot_id}.to.${to.scene_id}.${to.shot_id}`;
}

function edgeDiagnosticPayload(edge: TransitionEdge): {
  id: string;
  kind: TransitionEdge['kind'];
  duration_ms: number;
  direction: 'left' | 'right' | 'up' | 'down' | null;
  shader: string | null;
  angle: number | null;
} {
  const direction = edge.direction === undefined ? null : edge.direction;
  const shader = edge.shader === undefined ? null : edge.shader;
  const angle = edge.angle === undefined ? null : edge.angle;
  return {
    id: edge.id,
    kind: edge.kind,
    duration_ms: edge.duration_ms,
    direction,
    shader,
    angle,
  };
}

function sameEdgeSemantics(a: TransitionEdge, b: TransitionEdge): boolean {
  return (
    a.kind === b.kind &&
    a.duration_ms === b.duration_ms &&
    a.direction === b.direction &&
    a.shader === b.shader &&
    a.angle === b.angle
  );
}

function sameAddress(a: ShotAddress, b: ShotAddress): boolean {
  return a.scene_id === b.scene_id && a.shot_id === b.shot_id;
}

function pairKey(from: ShotAddress, to: ShotAddress): string {
  return `${addressKey(from)}>${addressKey(to)}`;
}

function addressKey(address: ShotAddress): string {
  return `${address.scene_id}:${address.shot_id}`;
}
