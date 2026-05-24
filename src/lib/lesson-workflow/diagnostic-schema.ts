import { z } from 'zod';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(JsonValueSchema),
  ]),
);

export const DiagnosticSeveritySchema = z.enum(['info', 'warning', 'error']);

export const DiagnosticSchema = z.object({
  code: z.string().min(1),
  path: z.array(z.union([z.string(), z.number()])),
  actual: JsonValueSchema.optional(),
  expected: JsonValueSchema.optional(),
  repair: z.string().optional(),
  severity: DiagnosticSeveritySchema,
}).strict();

export type Diagnostic = z.infer<typeof DiagnosticSchema>;
