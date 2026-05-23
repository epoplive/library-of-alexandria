import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cloneElement, isValidElement, useMemo, useState, } from 'react';
import { motion } from 'framer-motion';
export function Stage({ layers, interactiveSlots, resolveAsset, layoutOverrides, maskOverrides, visibilityOverrides, transitionOverrides, className = '', }) {
    // Sort layers by z for back-to-front rendering. Within same z, source order wins.
    const ordered = useMemo(() => {
        return layers
            .map((l, i) => ({ layer: l, originalIndex: i }))
            .sort((a, b) => {
            const za = a.layer.initial_layout.z ?? 0;
            const zb = b.layer.initial_layout.z ?? 0;
            if (za !== zb)
                return za - zb;
            return a.originalIndex - b.originalIndex;
        })
            .map((e) => e.layer);
    }, [layers]);
    return (_jsx("div", { className: `relative w-full h-full overflow-hidden bg-paper-tint rounded-2xl ${className}`, children: ordered.map((layer) => {
            const layout = { ...layer.initial_layout, ...(layoutOverrides?.[layer.id] ?? {}) };
            const mask = maskOverrides && layer.id in maskOverrides
                ? maskOverrides[layer.id]
                : (layer.initial_mask ?? null);
            const visible = visibilityOverrides?.[layer.id] ?? layer.initial_visible ?? true;
            const transition = transitionOverrides?.[layer.id];
            return (_jsx(LayerView, { layer: layer, layout: layout, mask: mask, visible: visible, transition: transition, slot: interactiveSlots?.[layer.id], resolveAsset: resolveAsset }, layer.id));
        }) }));
}
function LayerView({ layer, layout, mask, visible, transition, slot, resolveAsset, }) {
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
    const motionTransition = tCurve === 'spring'
        ? { type: 'spring', stiffness: 220, damping: 30, delay: tDelay }
        : tCurve === 'snap'
            ? { duration: 0, delay: tDelay }
            : { duration: tDuration, ease: tCurve, delay: tDelay };
    return (_jsx(motion.div, { className: "absolute", style: {
            pointerEvents: visible && !layer.pass_through ? 'auto' : 'none',
            clipPath: maskToClipPath(mask),
        }, animate: animate, transition: motionTransition, children: _jsx(LayerContent, { layer: layer, slot: slot, resolveAsset: resolveAsset }) }));
}
function LayerContent({ layer, slot, resolveAsset, }) {
    const src = layer.source;
    if (src.kind === 'interactive') {
        if (!slot) {
            return (_jsx(Placeholder, { label: `interactive · ${src.component_id}`, sub: "no slot provided" }));
        }
        // Inject resolved sprite URLs as a sprites prop, if the slot's element accepts them.
        const resolvedSprites = src.sprites
            ? (() => {
                const out = {};
                for (const [name, sprite] of Object.entries(src.sprites)) {
                    if (sprite.kind === 'video-loop' || sprite.kind === 'image') {
                        const url = resolveAsset?.(sprite.asset_id);
                        if (url)
                            out[name] = { ...sprite, url };
                    }
                    else if (sprite.kind === 'sequence') {
                        const urls = sprite.asset_ids
                            .map((id) => resolveAsset?.(id))
                            .filter((u) => Boolean(u));
                        if (urls.length)
                            out[name] = { ...sprite, urls };
                    }
                }
                return out;
            })()
            : undefined;
        if (resolvedSprites && isValidElement(slot.element)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return cloneElement(slot.element, { sprites: resolvedSprites });
        }
        return slot.element;
    }
    if (src.kind === 'image') {
        const url = resolveAsset?.(src.asset_id);
        if (!url)
            return _jsx(Placeholder, { label: "image", sub: src.asset_id });
        return (_jsx("img", { src: url, alt: src.alt ?? '', className: "w-full h-full object-contain select-none", draggable: false }));
    }
    if (src.kind === 'video-clip') {
        const url = resolveAsset?.(src.asset_id);
        if (!url)
            return _jsx(Placeholder, { label: "video-clip", sub: src.asset_id });
        return (_jsx("video", { src: url, autoPlay: true, loop: src.loop ?? true, muted: src.muted ?? true, playsInline: true, className: "w-full h-full object-cover" }));
    }
    if (src.kind === 'character') {
        return (_jsx(Placeholder, { label: `character · ${src.character_id}`, sub: src.pose ?? 'default' }));
    }
    if (src.kind === 'math') {
        return _jsx(MathBlock, { latex: src.latex, display: src.display ?? false });
    }
    if (src.kind === 'text') {
        return _jsx(TextBlock, { text: src.text, style: src.style });
    }
    return _jsx(Placeholder, { label: "layer", sub: "unknown source" });
}
function Placeholder({ label, sub }) {
    return (_jsxs("div", { className: "w-full h-full rounded-xl border-2 border-dashed border-ink-subtle/30 bg-paper-tint/60 flex flex-col items-center justify-center text-center p-3", children: [_jsx("p", { className: "font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle", children: label }), _jsx("p", { className: "font-mono text-[10px] text-ink-subtle/70 mt-1 break-all", children: sub })] }));
}
function TextBlock({ text, style }) {
    const fontFamily = style?.font === 'display'
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
    };
    const sizeClass = sizeMap[style?.size ?? 'base'];
    const alignClass = style?.align === 'center'
        ? 'text-center'
        : style?.align === 'right'
            ? 'text-right'
            : 'text-left';
    return (_jsx("div", { className: `w-full h-full flex items-center ${fontFamily} ${sizeClass} ${alignClass}`, style: {
            color: style?.color,
            fontWeight: style?.weight,
            justifyContent: style?.align === 'center'
                ? 'center'
                : style?.align === 'right'
                    ? 'flex-end'
                    : 'flex-start',
        }, children: _jsx("div", { className: "w-full", children: text }) }));
}
function MathBlock({ latex, display }) {
    // Lazy import would be cleaner; using a dynamic require pattern works at build.
    // Falls back to a styled <code> if katex isn't available at render.
    const [html, setHtml] = useState(null);
    useMemo(() => {
        void (async () => {
            try {
                const k = await import('katex');
                setHtml(k.default.renderToString(latex, { displayMode: display, throwOnError: false }));
            }
            catch {
                setHtml(null);
            }
        })();
    }, [latex, display]);
    if (!html)
        return (_jsx("code", { className: "font-mono text-sm bg-paper-tint p-3 rounded", children: latex }));
    return (_jsx("div", { className: "w-full h-full flex items-center justify-center", dangerouslySetInnerHTML: { __html: html } }));
}
/* ---- Mask helpers ---- */
function maskToClipPath(mask) {
    if (!mask)
        return undefined;
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
function mapEase(curve) {
    if (!curve)
        return 'easeInOut';
    if (curve === 'ease-in')
        return 'easeIn';
    if (curve === 'ease-out')
        return 'easeOut';
    if (curve === 'ease-in-out')
        return 'easeInOut';
    if (curve === 'ease')
        return 'easeInOut';
    return curve;
}
/* ---- Unused import guards (referenced for type re-export only) ---- */
const _unused = undefined;
void _unused;
const _alsoUnused = null;
void _alsoUnused;
