/** At most `size` model calls at once (the build prompt's four), the rest wait their turn. */
export function limiter(size: number): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0;
  const waiting: (() => void)[] = [];
  const next = () => {
    active -= 1;
    const go = waiting.shift();
    if (go) go();
  };
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= size) await new Promise<void>((resolve) => waiting.push(resolve));
    active += 1;
    try {
      return await task();
    } finally {
      next();
    }
  };
}
