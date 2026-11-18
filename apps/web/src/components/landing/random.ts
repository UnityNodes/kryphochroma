/** The felt grain, the loose deck and the rival rows must look the same on every visit and in every still, so their scatter comes from a fixed seed instead of Math.random. */
export function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
