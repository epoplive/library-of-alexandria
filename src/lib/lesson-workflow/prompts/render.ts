import { readFileSync } from 'node:fs';
import { sha256 } from '../artifact-ref';

type PromptInputs = Readonly<{ [key: string]: string | number | boolean }>;

export function renderPrompt(
  template_path: string,
  inputs: PromptInputs,
): { rendered: string; hash: string } {
  const template = readFileSync(template_path, 'utf8');
  const rendered = template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, name: string) => {
    const value = inputs[name];
    if (value === undefined) throw new Error(`missing prompt input "${name}"`);
    return String(value);
  });
  return {
    rendered,
    hash: sha256(rendered),
  };
}
