import { aiMatte } from "./aiMatte";
import { blackKey } from "./blackKey";
import { chromaKey } from "./chromaKey";
import type { OpDefinition } from "./types";

/**
 * Every operation the editor can apply, by type id. To add a feature (trim, crop,
 * background replace…): write lib/ops/<name>.ts implementing OpDefinition,
 * add it here and to the EditSpec union in lib/edit/spec.ts, and register its
 * inspector panel in components/studio/tools/registry.ts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyOp = OpDefinition<any>;

export const OPS = {
  chromaKey,
  blackKey,
  aiMatte,
} as const satisfies Record<string, AnyOp>;

export type OpType = keyof typeof OPS;
