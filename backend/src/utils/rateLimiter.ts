/**
 * A simple sequential rate limiter that enforces a minimum delay between
 * calls. Useful for external API polling where we must respect rate limits
 * (e.g. USITC HTS API: 1 request / second).
 */
export function createDelay(ms: number): () => Promise<void> {
  return () => new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Process an array of items sequentially with a fixed delay between each
 * invocation of the provided async function.
 */
export async function processWithDelay<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  delayMs: number,
): Promise<R[]> {
  const results: R[] = [];
  const delay = createDelay(delayMs);

  for (const item of items) {
    const result = await fn(item);
    results.push(result);
    if (items.indexOf(item) < items.length - 1) {
      await delay();
    }
  }

  return results;
}
