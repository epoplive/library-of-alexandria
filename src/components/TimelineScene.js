import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useMemo, useRef, useState, } from 'react';
import { Stage } from './Stage';
import { TimelinePlayer } from './TimelinePlayer';
export function TimelineScene({ scene, interactiveSlots, interactiveRefs, resolveAsset, voiceMap, stageClassName = 'aspect-video', autoPlay = false, children, }) {
    const layers = scene.layers ?? [];
    const [layoutOverrides, setLayoutOverrides] = useState({});
    const [maskOverrides, setMaskOverrides] = useState({});
    const [visibilityOverrides, setVisibilityOverrides] = useState({});
    const transitionRef = useRef({});
    const onApplyOp = useCallback((op) => {
        if (op.kind === 'transform') {
            setLayoutOverrides((prev) => ({
                ...prev,
                [op.layer_id]: { ...(prev[op.layer_id] ?? {}), ...(op.layout ?? {}) },
            }));
            if (op.mask !== undefined) {
                setMaskOverrides((prev) => ({ ...prev, [op.layer_id]: op.mask ?? null }));
            }
        }
        else if (op.kind === 'visibility') {
            setVisibilityOverrides((prev) => ({ ...prev, [op.layer_id]: op.visible }));
        }
        // `action` ops are dispatched by TimelinePlayer onto interactiveRefs;
        // nothing for Stage to do here.
    }, []);
    const transitionOverrides = useMemo(() => {
        // The per-layer transition override map currently isn't being kept
        // separately — the Stage applies a sensible default ease curve.
        // This stub keeps the prop typed for future per-beat transition control.
        return {};
    }, [transitionRef]);
    // Default mode: Watch (timeline drives the scene). Could later add a
    // Play mode for interactive-heavy scenes.
    return (_jsxs("div", { className: "flex flex-col gap-4", children: [_jsx("div", { className: `${stageClassName} w-full`, children: _jsx(Stage, { layers: layers, interactiveSlots: interactiveSlots, resolveAsset: resolveAsset, layoutOverrides: layoutOverrides, maskOverrides: maskOverrides, visibilityOverrides: visibilityOverrides, transitionOverrides: transitionOverrides }) }), _jsx(TimelinePlayer, { scene: scene, interactiveRefs: interactiveRefs, onApplyOp: onApplyOp, voiceMap: voiceMap, autoPlay: autoPlay }), children] }));
}
