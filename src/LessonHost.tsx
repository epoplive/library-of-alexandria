import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { loadLesson } from './lessons-glob';
import { ErrorBoundary } from './ErrorBoundary';

type Loaded = Awaited<ReturnType<typeof loadLesson>>;

export default function LessonHost() {
  const { slug } = useParams<{ slug: string }>();
  const [loaded, setLoaded] = useState<Loaded>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    setError(null);
    setLoaded(null);
    loadLesson(slug)
      .then((res) => {
        if (!res) setError(`No lesson at /lessons/${slug}.`);
        else setLoaded(res);
      })
      .catch((e) => setError(String(e)));
  }, [slug]);

  if (error) return <NotFound message={error} />;
  if (!loaded) return <Loading />;

  const { Component } = loaded;
  return (
    <ErrorBoundary>
      <Component />
    </ErrorBoundary>
  );
}

function Loading() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-ink-subtle animate-pulse">
        Loading lesson…
      </p>
    </main>
  );
}

function NotFound({ message }: { message: string }) {
  return (
    <main className="min-h-screen px-6 py-16">
      <div className="mx-auto max-w-xl text-center">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-ink-subtle mb-4">404</p>
        <h1 className="font-display text-3xl font-semibold mb-3">Lesson not found</h1>
        <p className="text-ink-muted mb-8">{message}</p>
        <Link
          to="/"
          className="font-mono text-xs uppercase tracking-[0.18em] text-accent hover:text-accent-hover"
        >
          ← Back to lessons
        </Link>
      </div>
    </main>
  );
}
