/** Stills of states in the middle of an animation can only be taken by pinning them: this server draws WebGL in software, far too slowly to catch a frame in passing. A test page sets `window.__kcLanding` and the scene reads it every frame. */
export interface LandingDebug {
  readonly hq?: unknown;
  readonly introT?: unknown;
  readonly shot?: unknown;
  readonly hover?: unknown;
}

declare global {
  interface Window {
    __kcLanding?: LandingDebug;
  }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function readDebug(host: { readonly __kcLanding?: unknown }): LandingDebug | undefined {
  const value = host.__kcLanding;
  return typeof value === "object" && value !== null ? value : undefined;
}

export function forcesHq(debug: LandingDebug | undefined): boolean {
  return debug?.hq === true;
}

export function forcedIntro(debug: LandingDebug | undefined): number | null {
  return numberOrNull(debug?.introT);
}

export function forcedShot(debug: LandingDebug | undefined): number | null {
  return numberOrNull(debug?.shot);
}

export function forcedHover(debug: LandingDebug | undefined): number | null {
  return numberOrNull(debug?.hover);
}
