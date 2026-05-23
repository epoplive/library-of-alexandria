const lessonModules = import.meta.glob('/lessons/*/index.tsx');
const metaModules = import.meta.glob('/lessons/*/meta.json');
function slugFromPath(path) {
    return path.split('/')[2];
}
export function listLessonSlugs() {
    return Object.keys(lessonModules).map(slugFromPath).sort();
}
export async function loadLesson(slug) {
    const lessonPath = `/lessons/${slug}/index.tsx`;
    const loader = lessonModules[lessonPath];
    if (!loader)
        return null;
    const lesson = (await loader());
    const metaPath = `/lessons/${slug}/meta.json`;
    const metaLoader = metaModules[metaPath];
    const meta = metaLoader
        ? (await metaLoader()).default
        : { title: slug };
    return { Component: lesson.default, meta };
}
export async function listLessonsWithMeta() {
    const slugs = listLessonSlugs();
    return Promise.all(slugs.map(async (slug) => {
        const metaPath = `/lessons/${slug}/meta.json`;
        const loader = metaModules[metaPath];
        const meta = loader ? (await loader()).default : { title: slug };
        return { slug, ...meta };
    }));
}
