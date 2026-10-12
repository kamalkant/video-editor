/**
 * Work on several items at once, but hand the results over in the items' order, each as soon as it and
 * the ones before it are done. Importing three files: they are looked at together (decoding a first frame
 * takes a moment each), the first lands on the timeline as soon as it's ready, and the others follow in
 * the order they were picked. An item whose work fails is skipped.
 */
export async function inOrder<T, R>(items: T[], work: (item: T) => Promise<R>, take: (item: T, result: R) => void, concurrency = 3): Promise<void> {
  const done = items.map(() => {
    let resolve!: (r: R) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<R>((a, b) => ((resolve = a), (reject = b)));
    promise.catch(() => undefined);
    return { promise, resolve, reject };
  });
  let next = 0;
  // (a few at a time: each one decodes a video)
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        done[i]!.resolve(await work(items[i]!));
      } catch (e) {
        done[i]!.reject(e);
      }
    }
  };
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, worker);
  for (let i = 0; i < items.length; i++) {
    let r: R;
    try {
      r = await done[i]!.promise;
    } catch {
      continue;
    }
    take(items[i]!, r);
  }
  await Promise.all(workers);
}
