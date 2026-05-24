import type { ZodTuple, ZodTypeAny } from 'zod';

type InteractiveArgsTuple =
  | ZodTuple<[ZodTypeAny, ...ZodTypeAny[]]>
  | ZodTuple<[]>;

export interface InteractiveContractMethodSpec {
  args: InteractiveArgsTuple;
}

export interface InteractiveContract<C extends string = string> {
  component_id: C;
  methods: { [method: string]: InteractiveContractMethodSpec };
}

export function defineInteractiveContract<
  C extends string,
  M extends { [method: string]: InteractiveArgsTuple },
>(
  spec: { component_id: C; methods: M },
): InteractiveContract<C> & { methods: { [K in keyof M]: { args: M[K] } } } {
  const methods = {} as { [K in keyof M]: { args: M[K] } };
  for (const method in spec.methods) {
    methods[method] = { args: spec.methods[method] };
  }
  return {
    component_id: spec.component_id,
    methods,
  };
}

export type InteractiveMethodNames<C extends InteractiveContract> = keyof C['methods'] & string;
