// DOM overlay (outside the Canvas, sibling of the OSD): a full-screen "streaming"
// state while LA's first tiles load, and a small corner badge when we've fallen
// back to the sandbox (no API key, or a Google auth/quota error). On-brand green.
import { useWorldStore } from "./useWorldStore";
import "./loadingOverlay.css";

export function LoadingOverlay() {
  const mode = useWorldStore((s) => s.mode);
  const loading = useWorldStore((s) => s.loading);
  const apiKeyMissing = useWorldStore((s) => s.apiKeyMissing);
  const tileError = useWorldStore((s) => s.tileError);

  if (mode === "la" && loading) {
    return (
      <div className="ff-loading">
        <div className="ff-loading-inner">
          <div className="ff-loading-title">STREAMING LOS ANGELES</div>
          <div className="ff-loading-sub">◌ georeferencing photorealistic tiles…</div>
          <div className="ff-loading-bar">
            <div className="ff-loading-bar-fill" />
          </div>
        </div>
      </div>
    );
  }

  if (apiKeyMissing) {
    return (
      <div className="ff-notice">
        SANDBOX — no Google Maps API key.
        <br />
        Add <code>VITE_GOOGLE_MAPS_API_KEY</code> to <code>.env.local</code> to fly real LA.
      </div>
    );
  }

  if (tileError) {
    return (
      <div className="ff-notice ff-notice-err">
        SANDBOX — Map Tiles API error. Check the key, referrer restriction & quota.
      </div>
    );
  }

  return null;
}
