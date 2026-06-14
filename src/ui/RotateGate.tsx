// Landscape gate. Freefall flies in landscape only; in portrait this covers the screen with
// an on-brand rotate prompt. A tap tries to go fullscreen + lock to landscape where supported
// (Android Chrome). iOS Safari supports neither lock nor element fullscreen, so the prompt is
// the fallback there — we attempt best-effort and never block on failure. Desktop never mounts.
import { useState } from "react";
import type { ReactElement } from "react";
import { IS_TOUCH, useOrientation } from "./device";
import "./touch.css";

type Lockable = { lock?: (o: string) => Promise<void> };

export function RotateGate(): ReactElement | null {
  const orientation = useOrientation();
  const [busy, setBusy] = useState(false);
  if (!IS_TOUCH || orientation === "landscape") return null;

  const tryLock = async () => {
    setBusy(true);
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) await el.requestFullscreen().catch(() => {});
      const orient = screen.orientation as unknown as Lockable | undefined;
      await orient?.lock?.("landscape").catch(() => {});
    } catch {
      /* iOS can't lock or go fullscreen — the rotate prompt stands on its own */
    }
    setBusy(false);
  };

  return (
    <div className="ff-rotate" role="dialog" aria-label="Rotate device to landscape">
      <div className="ff-rotate-inner">
        <svg className="ff-rotate-icon" viewBox="0 0 64 64" width="76" height="76" aria-hidden="true">
          <rect x="24" y="6" width="16" height="30" rx="2.5" fill="none" stroke="#2bff8c" strokeWidth="2" />
          <circle cx="32" cy="31.5" r="1.4" fill="#2bff8c" />
          <path d="M12 46 A 24 24 0 0 0 52 52" fill="none" stroke="#2bff8c" strokeWidth="2" strokeLinecap="round" />
          <path d="M52 52 l -1 -7 M52 52 l -7 1" fill="none" stroke="#2bff8c" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <div className="ff-rotate-title">ROTATE TO LANDSCAPE</div>
        <div className="ff-rotate-sub">Freefall flies in landscape.</div>
        <button className="ff-btn ff-rotate-btn" onClick={tryLock}>
          {busy ? "…" : "GO FULLSCREEN"}
        </button>
        <div className="ff-rotate-note">On iPhone, just turn your device — lock isn't supported.</div>
      </div>
    </div>
  );
}
