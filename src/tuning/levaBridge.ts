// Lets the 'U' hotkey drive the leva "metric" control directly, so leva stays
// the single owner of that value (the panel and the store never diverge).
// TuningPanel populates `set` once mounted; input.ts calls it.
export const levaBridge: {
  set: ((patch: Record<string, unknown>) => void) | null;
} = { set: null };
