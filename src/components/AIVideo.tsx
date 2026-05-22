interface AIVideoProps {
  prompt: string;
  caption?: string;
  duration?: number;
  src?: string;
}

export function AIVideo({ prompt, caption, duration, src }: AIVideoProps) {
  if (src) {
    return (
      <figure className="my-6">
        <video
          controls
          src={src}
          className="w-full rounded-2xl shadow-card border border-ink-subtle/10"
        />
        {caption && (
          <figcaption className="mt-2 text-center text-sm text-ink-muted">{caption}</figcaption>
        )}
      </figure>
    );
  }

  return (
    <figure className="my-6">
      <div className="rounded-2xl border-2 border-dashed border-accent/30 bg-accent-soft/30 p-8 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent mb-3">
          ▶ Video placeholder
        </p>
        <p className="text-ink-muted italic">"{prompt}"</p>
        {duration && (
          <p className="mt-2 font-mono text-xs text-ink-subtle">~{duration}s</p>
        )}
      </div>
      {caption && (
        <figcaption className="mt-2 text-center text-sm text-ink-muted">{caption}</figcaption>
      )}
    </figure>
  );
}
