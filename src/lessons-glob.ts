import type { ComponentType } from 'react';

type LessonModule = { default: ComponentType };
type MetaModule = { default: LessonMeta };

export interface LessonMeta {
  title: string;
  summary?: string;
  createdAt?: string;
  tags?: string[];
}

const lessonModules = import.meta.glob('/lessons/*/index.tsx');
const metaModules = import.meta.glob('/lessons/*/meta.json');

function slugFromPath(path: string): string {
  return path.split('/')[2];
}

export function listLessonSlugs(): string[] {
  return Object.keys(lessonModules).map(slugFromPath).sort();
}

export async function loadLesson(slug: string) {
  const lessonPath = `/lessons/${slug}/index.tsx`;
  const loader = lessonModules[lessonPath];
  if (!loader) return null;
  const lesson = (await loader()) as LessonModule;
  const metaPath = `/lessons/${slug}/meta.json`;
  const metaLoader = metaModules[metaPath];
  const meta = metaLoader
    ? ((await metaLoader()) as MetaModule).default
    : ({ title: slug } as LessonMeta);
  return { Component: lesson.default, meta };
}

export async function listLessonsWithMeta(): Promise<Array<LessonMeta & { slug: string }>> {
  const slugs = listLessonSlugs();
  return Promise.all(
    slugs.map(async (slug) => {
      const metaPath = `/lessons/${slug}/meta.json`;
      const loader = metaModules[metaPath];
      const meta = loader ? ((await loader()) as MetaModule).default : { title: slug };
      return { slug, ...meta };
    }),
  );
}
