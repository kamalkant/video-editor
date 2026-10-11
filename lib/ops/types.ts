import type { z } from "zod";

/**
 * Builds one FFmpeg -filter_complex graph from a list of operations.
 * Each operation reads an input expression and returns its output pad label.
 * The first operation reads the source head ("[0:v]" plus any fps filter), so
 * a single op produces exactly the same graph text as before the refactor.
 */
export class GraphBuilder {
  readonly statements: string[] = [];
  private used = new Set<string>();
  /** The mask video input (e.g. "[1:v]fps=24,"), for ops that need one. */
  maskInput?: string;

  /** A pad label that is unique within this graph (first use keeps the plain name). */
  label(name: string): string {
    let l = name;
    for (let i = 2; this.used.has(l); i++) l = `${name}_${i}`;
    this.used.add(l);
    return l;
  }

  add(statement: string) {
    this.statements.push(statement);
  }

  toString() {
    return this.statements.join(";");
  }
}

/** An input expression: either "[label]" or the source head, e.g. "[0:v]fps=12,". */
export type Input = string;

export interface OpDefinition<P> {
  /** Stable type id stored in edit specs (never rename). */
  type: string;
  label: string;
  schema: z.ZodType<P>;
  defaults: P;
  /** Clamp/snap untrusted params. Must not throw for schema-valid input. */
  sanitize(params: P): P;
  /** Append filter statements; returns the output pad label (without brackets). */
  toFilter(params: P, input: Input, g: GraphBuilder): string;
  /** Does the editor have a live GPU preview for this op? */
  live?: boolean;
  /** Does this op change timing (trim, speed)? The job uses it for progress/duration. */
  affectsTiming?: boolean;
  /** Does this op read a mask video (second FFmpeg input)? */
  needsMask?: boolean;
}
