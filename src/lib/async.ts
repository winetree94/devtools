export const mapConcurrent = async <TInput, TOutput>(
  items: readonly TInput[],
  concurrency: number,
  map: (item: TInput, index: number) => Promise<TOutput>,
): Promise<TOutput[]> => {
  const results: TOutput[] = [];
  let nextIndex = 0;

  const runWorker = async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const item = items[currentIndex];

      if (item === undefined) {
        return;
      }

      results[currentIndex] = await map(item, currentIndex);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => {
      return runWorker();
    }),
  );

  return results;
};
