// Shared immersive-fullscreen entry. Hiding the phone's system status/navigation bars (so
// the game is truly edge-to-edge) requires the Fullscreen API, called from a user gesture.
// Safe to call repeatedly — it no-ops once already fullscreen — and never throws.
export function requestImmersiveFullscreen(): void {
  const el = document.documentElement as HTMLElement & {
    requestFullscreen?: (opts?: FullscreenOptions) => Promise<void>;
  };
  if (!document.fullscreenElement && el.requestFullscreen) {
    el.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
  }
}
