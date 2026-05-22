import {
  cloneElement,
  isValidElement,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { motion } from 'framer-motion';
import type {
  EaseCurve,
  Layer,
  Layout,
  LayoutTransition,
  Mask,
  TextStyle,
} from '@/lib/scene-timeline';
import { DEFAULT_LAYOUT } from '@/lib/scene-timeline';

/* ============================================================
   Stage — composites a scene's layers into one moving picture.

   The Stage owns layout + visibility state for every layer. Beats
   (dispatched by the TimelinePlayer) call `applyOp()` to animate
   transforms, toggle visibility, or fire imperative actions on
   interactive layers.

   Interactive layers are provided by the caller via `interactiveSlots`
   so the parent owns the actual React element + its ref. The Stage
   just positions them inside a motion.div.

   Masks are applied via SVG clip-path / CSS `clip-path` on each layer.
   ============================================================ */

/**
 * Where the caller provides actual React elements for interactive
 * layers (because they own the ref). Key by layer.id. The Stage
 * passes through the layer's resolved sprite URLs when present.
 */
export interface InteractiveSlot {
  /** The React element to render. Will be wrapped in the Stage's positioning div. */
  element: ReactElement;
}

interface StageProps {
  layers: Layer[];
  /** layer_id → slot. Only required for `kind: 'interactive'` layers. */
  interactiveSlots?: Record<string, InteractiveSlot>;
  /** Resolve an asset_id to a URL (image / video). */
  resolveAsset?: (asset_id: string) => string | undefined;
  /** Current layout overrides, layer_id → Layout. */
  layoutOverrides?: Record<string, Layout>;
  /** Current mask overrides, layer_id → Mask|null. */
  maskOverrides?: Record<string, Mask | null>;
  /** Current visibility overrides, layer_id → boolean. */
  visibilityOverrides?: Record<string, boolean>;
  /** Per-layer transition settings (set when a beat fires a transform). */
  transitionOverrides?: Record<string, LayoutTransition>;
  /** Width/height of the stage in CSS pixels. Layouts are 0..1 relative to this. */
  className?: string;
}

export function Stage({
  layers,
  interactiveSlots,
  resolveAsset,
  layoutOverrides,
  maskOverrides,
  visibilityOverrides,
  transitionOverrides,
  className = '',
}: StageProps) {
  // Sort layers by z for back-to-front rendering. Within same z, source order wins.
  const ordered = useMemo(() => {
    return layers
      .map((l, i) => ({ layer: l, originalIndex: i }))
      .sort((a, b) => {
        const za = a.layer.initial_layout.z ?? 0;
        const zb = b.layer.initial_layout.z ?? 0;
        if (za !== zb) return za - zb;
        return a.originalIndex - b.originalIndex;
      })
      .map((e) => e.layer);
  }, [layers]);

  return (
    <div
      className={`relative w-full h-full overflow-hidden bg-paper-tint rounded-2xl ${className}`}
    >
      {ordered.map((layer) => {
        const layout = { ...layer.initial_layout, ...(layoutOverrides?.[layer.id] ?? {}) };
        const mask =
          maskOverrides && layer.id in maskOverrides
            ? maskOverrides[layer.id]
            : (layer.initial_mask ?? null);
        const visible =
          visibilityOverrides?.[layer.id] ?? layer.initial_visible ?? true;
        const transition = transitionOverrides?.[layer.id];
        return (
          <LayerView
            key={layer.id}
            layer={layer}
            layout={layout}
            mask={mask}
            visible={visible}
            transition={transition}
            slot={interactiveSlots?.[layer.id]}
            resolveAsset={resolveAsset}
          />
        );
      })}
    </div>
  );
}

interface LayerViewProps {
  layer: Layer;
  layout: Layout;
  mask: Mask | null;
  visible: boolean;
  transition?: LayoutTransition;
  slot?: InteractiveSlot;
  resolveAsset?: (asset_id: string) => string | undefined;
}

function LayerView({
  layer,
  layout,
  mask,
  visible,
  transition,
  slot,
  resolveAsset,
}: LayerViewProps) {
  const tCurve = mapEase(transition?.ease);
  const tDuration = transition?.duration ?? 0.5;
  const tDelay = transition?.delay ?? 0;

  const animate = {
    left: `${layout.x * 100}%`,
    top: `${layout.y * 100}%`,
    width: `${layout.width * 100}%`,
    height: `${layout.height * 100}%`,
    rotate: layout.rotate ?? 0,
    opacity: visible ? (layout.opacity ?? 1) : 0,
    scale: layout.scale ?? 1,
    zIndex: layout.z ?? 0,
  };

  const motionTransition =
    tCurve === 'spring'
      ? { type: 'spring' as const, stiffness: 220, damping: 30, delay: tDelay }
      : tCurve === 'snap'
        ? { duration: 0, delay: tDelay }
        : { duration: tDuration, ease: tCurve, delay: tDelay };

  return (
    <motion.div
      className="absolute"
      style={{
        pointerEvents: visible && !layer.pass_through ? 'auto' : 'none',
        clipPath: maskToClipPath(mask),
      }}
      animate={animate}
      transition={motionTransition}
    >
      <LayerContent layer={layer} slot={slot} resolveAsset={resolveAsset} />
    </motion.div>
  );
}

function LayerContent({
  layer,
  slot,
  resolveAsset,
}: {
  layer: Layer;
  slot?: InteractiveSlot;
  resolveAsset?: (asset_id: string) => string | undefined;
}) {
  const src = layer.source;

  if (src.kind === 'interactive') {
    if (!slot) {
      return (
        <Placeholder label={`interactive · ${src.component_id}`} sub="no slot provided" />
      );
    }
    // Inject resolved sprite URLs as a sprites prop, if the slot's element accepts them.
    const resolvedSprites: Record<string, unknown> | undefined = src.sprites
      ? (() => {
          const out: Record<string, unknown> = {};
          for (const [name, sprite] of Object.entries(src.sprites)) {
            if (sprite.kind === 'video-loop' || sprite.kind === 'image') {
              const url = resolveAsset?.(sprite.asset_id);
              if (url) out[name] = { ...sprite, url };
            } else if (sprite.kind === 'sequence') {
              const urls = sprite.asset_ids
                .map((id) => resolveAsset?.(id))
                .filter((u): u is string => Boolean(u));
              if (urls.length) out[name] = { ...sprite, urls };
            }
          }
          return out;
        })()
      : undefined;
    if (resolvedSprites && isValidElement(slot.element)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return cloneElement(slot.element as ReactElement<any>, { sprites: resolvedSprites });
    }
    return slot.element;
  }

  if (src.kind === 'image') {
    const url = resolveAsset?.(src.asset_id);
    if (!url) return <Placeholder label="image" sub={src.asset_id} />;
    return (
      <img
        src={url}
        alt={src.alt ?? ''}
        className="w-full h-full object-contain select-none"
        draggable={false}
      />
    );
  }

  if (src.kind === 'video-clip') {
    const url = resolveAsset?.(src.asset_id);
    if (!url) return <Placeholder label="video-clip" sub={src.asset_id} />;
    return (
      <video
        src={url}
        autoPlay
        loop={src.loop ?? true}
        muted={src.muted ?? true}
        playsInline
        className="w-full h-full object-cover"
      />
    );
  }

  if (src.kind === 'character') {
    return (
      <Placeholder
        label={`character · ${src.character_id}`}
        sub={src.pose ?? 'default'}
      />
    );
  }

  if (src.kind === 'math') {
    return <MathBlock latex={src.latex} display={src.display ?? false} />;
  }

  if (src.kind === 'text') {
    return <TextBlock text={src.text} style={src.style} />;
  }

  return <Placeholder label="layer" sub="unknown source" />;
}

function Placeholder({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="w-full h-full rounded-xl border-2 border-dashed border-ink-subtle/30 bg-paper-tint/60 flex flex-col items-center justify-center text-center p-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle">
        {label}
      </p>
      <p className="font-mono text-[10px] text-ink-subtle/70 mt-1 break-all">{sub}</p>
    </div>
  );
}

function TextBlock({ text, style }: { text: string; style?: TextStyle }) {
  const fontFamily =
    style?.font === 'display'
      ? 'font-display'
      : style?.font === 'mono'
        ? 'font-mono'
        : 'font-sans';
  const sizeMap = {
    xs: 'text-xs',
    sm: 'text-sm',
    base: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl',
    '2xl': 'text-2xl',
    '3xl': 'text-3xl',
    '4xl': 'text-4xl',
    '5xl': 'text-5xl',
  } as const;
  const sizeClass = sizeMap[style?.size ?? 'base'];
  const alignClass =
    style?.align === 'center'
      ? 'text-center'
      : style?.align === 'right'
        ? 'text-right'
        : 'text-left';
  return (
    <div
      className={`w-full h-full flex items-center ${fontFamily} ${sizeClass} ${alignClass}`}
      style={{
        color: style?.color,
        fontWeight: style?.weight,
        justifyContent:
          style?.align === 'center'
            ? 'center'
            : style?.align === 'right'
              ? 'flex-end'
              : 'flex-start',
      }}
    >
      <div className="w-full">{text}</div>
    </div>
  );
}

function MathBlock({ latex, display }: { latex: string; display: boolean }) {
  // Lazy import would be cleaner; using a dynamic require pattern works at build.
  // Falls back to a styled <code> if katex isn't available at render.
  const [html, setHtml] = useState<string | null>(null);
  useMemo(() => {
    void (async () => {
      try {
        const k = await import('katex');
        setHtml(
          k.default.renderToString(latex, { displayMode: display, throwOnError: false }),
        );
      } catch {
        setHtml(null);
      }
    })();
  }, [latex, display]);
  if (!html)
    return (
      <code className="font-mono text-sm bg-paper-tint p-3 rounded">{latex}</code>
    );
  return (
    <div
      className="w-full h-full flex items-center justify-center"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/* ---- Mask helpers ---- */

function maskToClipPath(mask: Mask | null): string | undefined {
  if (!mask) return undefined;
  switch (mask.kind) {
    case 'rect': {
      const r = mask.rounded ?? 0;
      return `inset(0% round ${r}px)`;
    }
    case 'circle':
      return 'circle(50% at 50% 50%)';
    case 'ellipse':
      return 'ellipse(50% 50% at 50% 50%)';
    case 'path':
      return `path("${mask.svg_path}")`;
    default:
      return undefined;
  }
}

function mapEase(curve?: EaseCurve): EaseCurve | string {
  if (!curve) return 'easeInOut';
  if (curve === 'ease-in') return 'easeIn';
  if (curve === 'ease-out') return 'easeOut';
  if (curve === 'ease-in-out') return 'easeInOut';
  if (curve === 'ease') return 'easeInOut';
  return curve;
}

/* ---- Helper: pass-through types ---- */

export type { Layer, Layout, Mask, LayoutTransition };

/* ---- Unused import guards (referenced for type re-export only) ---- */
const _unused: Ref<unknown> | undefined = undefined;
void _unused;
type _Unused = ReactNode;
const _alsoUnused: _Unused = null;
void _alsoUnused;
