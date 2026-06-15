// Install affordance (mobile only). Browsers won't let a page trigger an install on their
// own, so we surface it: on Android/Chromium we catch `beforeinstallprompt`, stash it, and
// show an INSTALL button that fires the native prompt; on iOS (which has no such event) we
// show a short "Add to Home Screen" hint instead. Installing runs the app fullscreen from the
// home screen — the reliable way to get true fullscreen on a phone. Hidden once installed
// (display-mode: standalone) or after the user dismisses it (remembered in localStorage).
import { useEffect, useState } from "react";
import { IS_TOUCH } from "./device";
import "./install.css";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "ff-install-dismissed";

function isInstalled(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: fullscreen)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  const ua = navigator.userAgent;
  return (
    /iphone|ipad|ipod/i.test(ua) ||
    // iPadOS 13+ reports as Mac but has touch points
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

// Eligible to even consider showing the prompt (mobile, not already installed, not dismissed).
function eligible(): boolean {
  if (!IS_TOUCH || isInstalled()) return false;
  try {
    if (localStorage.getItem(DISMISS_KEY) === "1") return false;
  } catch {
    /* private mode → still eligible */
  }
  return true;
}

export function InstallPrompt(): React.ReactElement | null {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  // iOS has no beforeinstallprompt, so decide its hint once at mount (lazy init — avoids a
  // synchronous setState inside the effect). Android starts hidden and flips on via the event.
  const [iosHint] = useState(() => eligible() && isIOS());
  const [show, setShow] = useState(() => eligible() && isIOS());

  useEffect(() => {
    if (!eligible()) return;
    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // keep our custom UI instead of the mini-infobar
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    const onInstalled = () => {
      setShow(false);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!IS_TOUCH || !show) return null;

  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const install = async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {
      /* user dismissed the native sheet */
    }
    setDeferred(null);
    setShow(false);
  };

  return (
    <div className="ff-install">
      {iosHint ? (
        <span className="ff-install-text">
          INSTALL FOR FULLSCREEN — tap <b>Share</b> then <b>Add to Home Screen</b>
        </span>
      ) : (
        <button className="ff-install-btn" onClick={install}>
          ⤓ INSTALL · FULLSCREEN
        </button>
      )}
      <button className="ff-install-x" onClick={dismiss} aria-label="Dismiss install prompt">
        ✕
      </button>
    </div>
  );
}
