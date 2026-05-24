import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readArtifact, writeArtifact } from './artifact-ref';
import { ProjectLockSchema, type ProjectLock } from './lockfile-schema';
import {
  LessonProjectSchema,
  type LessonProject,
  type WorkflowStepStatus,
} from './project-schema';
import type { WorkflowStep } from './types';

export function paths(slug: string): {
  projectJson: string;
  lockJson: string;
  artifactsDir: string;
  productionsDir: string;
  storyboardsDir: string;
  runsDir: string;
  audioDir: string;
  charactersJson: string;
  lessonDir: string;
  metaJson: string;
} {
  const lessonDir = path.join('lessons', slug);
  return {
    projectJson: path.join(lessonDir, 'project.json'),
    lockJson: path.join(lessonDir, 'project.lock.json'),
    artifactsDir: path.join(lessonDir, 'artifacts'),
    productionsDir: path.join(lessonDir, 'productions'),
    storyboardsDir: path.join(lessonDir, 'storyboards'),
    runsDir: path.join(lessonDir, 'artifacts', 'runs'),
    audioDir: path.join(lessonDir, 'audio'),
    charactersJson: path.join(lessonDir, 'characters.json'),
    lessonDir,
    metaJson: path.join(lessonDir, 'meta.json'),
  };
}

export async function readProject(slug: string): Promise<LessonProject> {
  const projectPaths = paths(slug);
  return readArtifact(projectPaths.projectJson, LessonProjectSchema);
}

export async function writeProject(slug: string, project: LessonProject): Promise<void> {
  const projectPaths = paths(slug);
  await writeArtifact(projectPaths.projectJson, project, LessonProjectSchema);
}

export async function readLock(slug: string): Promise<ProjectLock> {
  const projectPaths = paths(slug);
  return readArtifact(projectPaths.lockJson, ProjectLockSchema);
}

export async function writeLock(slug: string, lock: ProjectLock): Promise<void> {
  const projectPaths = paths(slug);
  await writeArtifact(projectPaths.lockJson, lock, ProjectLockSchema);
}

export function setWorkflowStepStatus(
  project: LessonProject,
  step: WorkflowStep,
  status: WorkflowStepStatus,
  artifactRef?: string,
  ranAt?: string,
): LessonProject {
  const lastRanAt = ranAt === undefined ? new Date().toISOString() : ranAt;
  const workflow = project.workflow === undefined ? {} : project.workflow;
  const stepState = artifactRef === undefined
    ? {
      status,
      last_ran_at: lastRanAt,
    }
    : {
      status,
      last_ran_at: lastRanAt,
      artifact_ref: artifactRef,
    };
  return LessonProjectSchema.parse({
    ...project,
    workflow: {
      ...workflow,
      [step]: stepState,
    },
  });
}

export async function ensureProjectScaffold(slug: string): Promise<void> {
  const projectPaths = paths(slug);
  await mkdir(projectPaths.artifactsDir, { recursive: true });
  await mkdir(projectPaths.runsDir, { recursive: true });
  await mkdir(projectPaths.storyboardsDir, { recursive: true });
  await mkdir(projectPaths.productionsDir, { recursive: true });
  await writeFile(path.join(projectPaths.artifactsDir, '.gitkeep'), '', 'utf8');
  await writeFile(path.join(projectPaths.runsDir, '.gitkeep'), '', 'utf8');
}
