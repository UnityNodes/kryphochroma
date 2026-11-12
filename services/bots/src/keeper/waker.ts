export interface Waker {
  readonly sleep: (ms: number) => Promise<void>;
  readonly wake: () => void;
}

/** A relayed move that ends a round wakes the keeper at once instead of waiting out its poll, so the reveal starts in the next block. */
export function createWaker(): Waker {
  let release: (() => void) | null = null;
  let early = false;
  return {
    sleep: (ms) => {
      if (early) {
        early = false;
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          release = null;
          resolve();
        };
        const timer = setTimeout(done, ms);
        release = done;
      });
    },
    wake: () => {
      if (release) release();
      else early = true;
    },
  };
}
