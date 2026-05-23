import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, } from 'react';
import { motion } from 'framer-motion';
import { synthesize } from '@/lib/tts';
export function TimelinePlayer({ scene, interactiveRef, interactiveRefs, onApplyOp, children, userMode = false, autoPlay = false, voiceMap, }) {
    const [beatIdx, setBeatIdx] = useState(-1);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isPreparing, setIsPreparing] = useState(false);
    const audioRef = useRef(null);
    // Stable ref so the play() closure always sees the right beat
    const currentIdxRef = useRef(beatIdx);
    currentIdxRef.current = beatIdx;
    const beats = scene.beats;
    const isFinished = beatIdx >= 0 && beatIdx >= beats.length;
    // Fire an action onto the legacy single-interactive ref
    const dispatch = useCallback((action) => {
        const r = interactiveRef?.current;
        if (!r)
            return;
        const method = r[action.method];
        if (typeof method !== 'function') {
            console.warn(`TimelinePlayer: ${action.method} not on ref`);
            return;
        }
        try {
            method.apply(r, action.args ?? []);
        }
        catch (e) {
            console.error(`TimelinePlayer: ${action.method} threw`, e);
        }
    }, [interactiveRef]);
    // Apply a beat op — action ops dispatch onto the matching layer ref;
    // transform/visibility ops are forwarded to the Stage via onApplyOp.
    const applyOp = useCallback((op) => {
        if (op.kind === 'action') {
            const r = interactiveRefs?.[op.layer_id]?.current;
            if (!r) {
                console.warn(`TimelinePlayer: no ref for layer ${op.layer_id}`);
                return;
            }
            const method = r[op.method];
            if (typeof method !== 'function') {
                console.warn(`TimelinePlayer: ${op.method} not on layer ${op.layer_id}`);
                return;
            }
            try {
                method.apply(r, op.args ?? []);
            }
            catch (e) {
                console.error(`TimelinePlayer: ${op.method} threw`, e);
            }
            return;
        }
        onApplyOp?.(op);
    }, [interactiveRefs, onApplyOp]);
    const stopAudio = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.src = '';
            audioRef.current = null;
        }
    }, []);
    const playBeat = useCallback(async (idx) => {
        if (idx >= beats.length) {
            setIsPlaying(false);
            return;
        }
        const beat = beats[idx];
        setBeatIdx(idx);
        // Fire all beat ops at beat start (before narration audio)
        if (beat.action)
            dispatch(beat.action);
        if (beat.ops)
            for (const op of beat.ops)
                applyOp(op);
        // Play narration (or skip if none)
        if (!beat.narration || userMode) {
            // No audio — wait beat.duration (or 2s default) then advance
            const ms = (beat.duration ?? 2) * 1000;
            const waitId = setTimeout(() => {
                if (currentIdxRef.current === idx)
                    playBeat(idx + 1);
            }, ms);
            return () => clearTimeout(waitId);
        }
        const voice = beat.speaker_id ? voiceMap?.[beat.speaker_id] : undefined;
        const url = await synthesize(beat.narration, voice);
        if (currentIdxRef.current !== idx)
            return; // user moved on
        if (!url) {
            // No pre-rendered MP3 for this beat. Wait beat.duration (or 4s
            // default) so the visual still cycles, then advance — never
            // synthesize at runtime.
            const ms = (beat.duration ?? 4) * 1000;
            const waitId = setTimeout(() => {
                if (currentIdxRef.current === idx)
                    playBeat(idx + 1);
            }, ms);
            return () => clearTimeout(waitId);
        }
        stopAudio();
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.addEventListener('ended', () => {
            if (currentIdxRef.current === idx)
                playBeat(idx + 1);
        });
        audio.addEventListener('error', () => {
            if (currentIdxRef.current === idx)
                playBeat(idx + 1);
        });
        await audio.play().catch(() => {
            /* user gesture not granted; surface via state */
            setIsPlaying(false);
        });
    }, 
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [beats, dispatch, applyOp, stopAudio, userMode, voiceMap]);
    const play = useCallback(() => {
        if (userMode)
            return;
        if (isFinished) {
            // Restart from the top
            stopAudio();
            setBeatIdx(-1);
            setIsPlaying(true);
            playBeat(0);
            return;
        }
        if (audioRef.current) {
            audioRef.current.play().catch(() => undefined);
            setIsPlaying(true);
            return;
        }
        setIsPlaying(true);
        playBeat(beatIdx < 0 ? 0 : beatIdx);
    }, [isFinished, beatIdx, playBeat, stopAudio, userMode]);
    const pause = useCallback(() => {
        if (audioRef.current)
            audioRef.current.pause();
        setIsPlaying(false);
    }, []);
    const reset = useCallback(() => {
        stopAudio();
        setBeatIdx(-1);
        setIsPlaying(false);
        setIsPreparing(false);
    }, [stopAudio]);
    // Auto-play on mount when requested
    useEffect(() => {
        if (autoPlay && !userMode)
            play();
        return () => stopAudio();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    // Stop audio + reset when the scene id changes (user navigates between scenes)
    useEffect(() => {
        reset();
        if (autoPlay && !userMode)
            play();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scene.id, userMode]);
    const state = {
        beatIdx,
        totalBeats: beats.length,
        isPlaying,
        isFinished,
        isPreparing,
    };
    // The chrome UI (transport bar, beat dots) is rendered by the parent via children
    return (_jsxs(_Fragment, { children: [_jsx(TimelineControls, { state: state, beats: beats, userMode: userMode, onPlay: play, onPause: pause, onReset: reset, onSeek: (i) => {
                    stopAudio();
                    playBeat(i);
                } }), children?.(state)] }));
}
function TimelineControls({ state, beats, userMode, onPlay, onPause, onReset, onSeek, }) {
    if (userMode)
        return null;
    const { isPlaying, isPreparing, isFinished, beatIdx } = state;
    const currentBeat = beatIdx >= 0 && beatIdx < beats.length ? beats[beatIdx] : null;
    return (_jsxs("div", { className: "flex items-center gap-3 bg-paper-card border border-ink-subtle/15 rounded-full pl-1.5 pr-4 py-1.5 shadow-card min-w-[260px] max-w-[460px]", children: [_jsx("button", { type: "button", onClick: isPlaying ? onPause : onPlay, disabled: isPreparing, className: "w-9 h-9 rounded-full bg-accent text-paper flex items-center justify-center hover:bg-accent-hover transition shrink-0 disabled:opacity-60", "aria-label": isPlaying ? 'Pause' : 'Play', children: isPreparing ? (_jsx(motion.svg, { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", animate: { rotate: 360 }, transition: { duration: 1.2, repeat: Infinity, ease: 'linear' }, children: _jsx("path", { d: "M21 12a9 9 0 1 1-6.2-8.5" }) })) : isPlaying ? (_jsxs("svg", { width: "12", height: "12", viewBox: "0 0 12 12", fill: "currentColor", children: [_jsx("rect", { x: "2", y: "1", width: "3", height: "10", rx: "0.5" }), _jsx("rect", { x: "7", y: "1", width: "3", height: "10", rx: "0.5" })] })) : (_jsx("svg", { width: "12", height: "12", viewBox: "0 0 12 12", fill: "currentColor", children: _jsx("path", { d: "M2 1 L10 6 L2 11 Z" }) })) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("div", { className: "flex items-baseline justify-between gap-2 mb-0.5", children: _jsx("p", { className: "font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted truncate", children: isPreparing
                                ? 'Synthesizing…'
                                : isFinished
                                    ? 'Scene complete'
                                    : currentBeat?.id
                                        ? `Beat ${beatIdx + 1}/${beats.length}`
                                        : 'Demo' }) }), _jsx("div", { className: "flex gap-[3px]", children: beats.map((b, i) => (_jsx("button", { type: "button", onClick: () => onSeek(i), "aria-label": `Jump to beat ${i + 1}`, className: `h-1 flex-1 rounded-full transition ${i === beatIdx
                                ? 'bg-accent'
                                : i < beatIdx
                                    ? 'bg-accent/40 hover:bg-accent/60'
                                    : 'bg-ink-subtle/15 hover:bg-ink-subtle/30'}` }, b.id))) })] }), isFinished && (_jsx("button", { type: "button", onClick: onReset, "aria-label": "Restart scene", className: "text-ink-subtle hover:text-ink shrink-0", children: _jsxs("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", children: [_jsx("path", { d: "M1 4v6h6" }), _jsx("path", { d: "M3.5 15a9 9 0 1 0 2.5-9.5L1 10" })] }) }))] }));
}
export function useTimeline({ scene, interactiveRef, userMode = false }) {
    const ref = useRef(null);
    useImperativeHandle(ref, () => ({
        play: () => undefined,
        pause: () => undefined,
        seekToBeat: () => undefined,
        reset: () => undefined,
    }));
    return useMemo(() => ({
        element: (_jsx(TimelinePlayer, { scene: scene, interactiveRef: interactiveRef, userMode: userMode })),
        handle: ref,
    }), [scene, interactiveRef, userMode]);
}
