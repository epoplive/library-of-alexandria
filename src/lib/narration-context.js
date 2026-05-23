import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
const ctx = createContext(null);
export function NarrationProvider({ children }) {
    const [progress, setProgress] = useState(0);
    const [currentTimeSec, setCurrentTimeSec] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [sceneKey, setSceneKey] = useState('');
    const value = useMemo(() => ({
        progress, currentTimeSec, isPlaying, sceneKey,
        setProgress, setCurrentTimeSec, setIsPlaying, setSceneKey,
    }), [progress, currentTimeSec, isPlaying, sceneKey]);
    return _jsx(ctx.Provider, { value: value, children: children });
}
export function useNarration() {
    const v = useContext(ctx);
    if (!v)
        return { progress: 0, currentTimeSec: 0, isPlaying: false, sceneKey: '' };
    return {
        progress: v.progress,
        currentTimeSec: v.currentTimeSec,
        isPlaying: v.isPlaying,
        sceneKey: v.sceneKey,
    };
}
export function useNarrationControls() {
    const v = useContext(ctx);
    if (!v) {
        const noop = () => undefined;
        return {
            setProgress: noop,
            setCurrentTimeSec: noop,
            setIsPlaying: noop,
            setSceneKey: noop,
        };
    }
    return {
        setProgress: v.setProgress,
        setCurrentTimeSec: v.setCurrentTimeSec,
        setIsPlaying: v.setIsPlaying,
        setSceneKey: v.setSceneKey,
    };
}
/** Split a narration script into sentences for highlight tracking. */
export function splitSentences(text) {
    // Greedy split on sentence-ending punctuation followed by whitespace.
    const re = /([^.!?]+[.!?]+)(\s+|$)/g;
    const out = [];
    let m;
    let lastEnd = 0;
    while ((m = re.exec(text)) !== null) {
        out.push(m[1].trim());
        lastEnd = re.lastIndex;
    }
    const rest = text.slice(lastEnd).trim();
    if (rest)
        out.push(rest);
    return out.length ? out : [text];
}
/** Given current 0..1 progress + sentence count, which sentence is active. */
export function currentSentenceIndex(progress, total) {
    if (total === 0)
        return -1;
    return Math.min(total - 1, Math.floor(progress * total));
}
/**
 * Timings-aware sentence resolver. Pre-rendered narration ships with a
 * `timings` table: one entry per chunk (sentence-aligned by gen-audio's
 * splitter) with startMs + durationMs in the concatenated MP3. We map
 * the current audio position to a chunk, then interpolate within the
 * chunk by character weight to pick the active sentence.
 *
 * When `timings` is missing (no pre-rendered file with timings yet),
 * falls back to uniform `progress * total` partitioning.
 */
export function sentenceIndexFromTimings(currentTimeSec, progress, sentences, timings) {
    if (sentences.length === 0)
        return -1;
    if (!timings || timings.length === 0) {
        return currentSentenceIndex(progress, sentences.length);
    }
    const currentMs = currentTimeSec * 1000;
    const chunkIdx = locateChunk(timings, currentMs);
    const chunk = timings[chunkIdx];
    // Position within the chunk, 0..1
    const chunkProgress = chunk.durationMs > 0
        ? Math.min(1, Math.max(0, (currentMs - chunk.startMs) / chunk.durationMs))
        : 0;
    // Find which sentences belong to this chunk via prefix-matching
    const { firstSentenceIdx, lastSentenceIdx } = sentencesForChunk(chunk.text, sentences);
    if (firstSentenceIdx < 0) {
        return currentSentenceIndex(progress, sentences.length);
    }
    // Within the chunk, distribute by character weight (longer sentences hold longer)
    const chunkSentences = sentences.slice(firstSentenceIdx, lastSentenceIdx + 1);
    const totalChars = chunkSentences.reduce((a, s) => a + s.length, 0) || 1;
    let charCursor = 0;
    for (let i = 0; i < chunkSentences.length; i++) {
        const weight = chunkSentences[i].length / totalChars;
        if (chunkProgress < charCursor + weight)
            return firstSentenceIdx + i;
        charCursor += weight;
    }
    return lastSentenceIdx;
}
function locateChunk(timings, currentMs) {
    for (let i = timings.length - 1; i >= 0; i--) {
        if (currentMs >= timings[i].startMs)
            return i;
    }
    return 0;
}
function sentencesForChunk(chunkText, sentences) {
    // Match the FIRST sentence of the chunk against the narration's
    // sentence list. The chunk text is gen-audio's chunkTextForTts output
    // (sentence-aligned), so it begins with a sentence boundary.
    const trimmedChunk = chunkText.trim();
    if (sentences.length === 0)
        return { firstSentenceIdx: -1, lastSentenceIdx: -1 };
    let firstSentenceIdx = -1;
    for (let i = 0; i < sentences.length; i++) {
        if (trimmedChunk.startsWith(sentences[i])) {
            firstSentenceIdx = i;
            break;
        }
    }
    if (firstSentenceIdx < 0)
        return { firstSentenceIdx: -1, lastSentenceIdx: -1 };
    // Walk forward while the chunk still covers each sentence
    let covered = sentences[firstSentenceIdx];
    let lastSentenceIdx = firstSentenceIdx;
    while (lastSentenceIdx + 1 < sentences.length) {
        const next = sentences[lastSentenceIdx + 1];
        const combined = covered + ' ' + next;
        if (!trimmedChunk.startsWith(combined.trimStart()))
            break;
        covered = combined;
        lastSentenceIdx += 1;
    }
    return { firstSentenceIdx, lastSentenceIdx };
}
// Small helper for components that just want the current sentence index
export function useActiveSentence(text, timings) {
    const { progress, currentTimeSec } = useNarration();
    const sentences = useMemo(() => splitSentences(text), [text]);
    return useMemo(() => sentenceIndexFromTimings(currentTimeSec, progress, sentences, timings), [currentTimeSec, progress, sentences, timings]);
}
export function useNarrationSetter() {
    const v = useContext(ctx);
    // Keep latest context in a ref so the returned callback identity stays
    // stable across context state updates. Effects that depend on this
    // setter won't refire when progress/isPlaying/sceneKey change — that
    // was killing playback mid-flight (start → state changed → reset effect
    // fired because setter identity changed → audio paused).
    const ref = useRef(v);
    ref.current = v;
    return useCallback((patch) => {
        const cur = ref.current;
        if (!cur)
            return;
        if (patch.progress !== undefined)
            cur.setProgress(patch.progress);
        if (patch.currentTimeSec !== undefined)
            cur.setCurrentTimeSec(patch.currentTimeSec);
        if (patch.isPlaying !== undefined)
            cur.setIsPlaying(patch.isPlaying);
        if (patch.sceneKey !== undefined)
            cur.setSceneKey(patch.sceneKey);
    }, []);
}
