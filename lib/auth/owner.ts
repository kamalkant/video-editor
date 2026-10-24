import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Whose work this is: a request runs the files it makes (an AI picture or video, a voice, an imported stock
 * clip) inside ownerScope, so lib/videos gives them to that person (their My Assets, their files only). Work
 * that goes on after the answer (a Veo video, an import) keeps the scope it was started in.
 */
export const ownerScope = new AsyncLocalStorage<{ userId: string }>();

/** The person the current work is for, or null. */
export const currentOwner = (): string | null => ownerScope.getStore()?.userId ?? null;
