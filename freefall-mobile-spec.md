# Freefall — Mobile / Touch Spec

> Make Freefall fully playable on touchscreens as **one responsive codebase** — the desktop keyboard+mouse experience stays **byte-for-byte unchanged**; mobile is detected and adapted on top.

---

## 0. Orientation

The whole sim is built around keyboard + mouse. Mobile means three things: **touch flight controls**, a **landscape-gated HUD reflow** for a small screen, and a **mobile performance profile** for weaker GPUs streaming photoreal tiles. The flight model, world, and all M1–M3 + waypoint/pause features stay intact — only the input source and presentation adapt.

**Decisions (locked):**
- **Controls:** **dual virtual sticks, FPV-radio style (Mode 2).** Left = sticky throttle + self-centering yaw; right = self-centering pitch/roll. Translucent green, matching the goggle OSD aesthetic.
- **Throttle feel:** **ratchet-from-hover** — the left vertical is spring-to-center; deflection integrates the throttle setpoint while held and **holds where you lift** (sticky). Seeds at the live hover value on first touch. Both sticks float (the nub spawns where the thumb lands).
- **Default flight mode on mobile:** **Angle (self-leveling).** Acro still available via the mode toggle.
- **Orientation:** **landscape only** — prompt to rotate (and lock where the browser allows).
- **Performance:** **crisp visuals, accept lower fps** — keep tile detail high; reclaim performance by capping pixel ratio + aggressive unloading, *not* by gutting detail.
- **HUD:** **minimal essentials**, reflowed around the thumb zones, with H to expand.

**Key principle:** the flight model already consumes 4 normalized input channels (throttle, yaw, pitch, roll) through M1's input layer. The virtual sticks feed those **same channels** — so the feel is unchanged; only the source differs. The physics are not touched.

---

## 1. Detection + responsive strategy

One app. Detect touch via coarse pointer + touch capability (`matchMedia('(pointer: coarse)')` + `navigator.maxTouchPoints`) computed once at load (`src/ui/device.ts` → `IS_TOUCH`). On touch → enable the virtual sticks, HUD reflow, Angle default, and perf profile. On non-touch → the existing desktop experience, unchanged (the touch components never mount). A `?touch=1` / `?desktop=1` URL override forces either UI for testing.

## 2. Landscape gate

Detect portrait on mobile → show a **rotate overlay** (`RotateGate`) and suspend the flight view. On a tap, attempt `requestFullscreen()` + `screen.orientation.lock('landscape')` (Android Chrome). **iOS Safari can't lock** — the prompt is the fallback there (best-effort, never blocks). Safe-area insets (`env(safe-area-inset-*)`) keep controls clear of notches / the home indicator; `viewport-fit=cover` + `touch-action: none` + `overscroll-behavior: none` suppress pinch/double-tap zoom, pull-to-refresh, and the long-press callout.

## 3. Touch flight controls — dual virtual sticks

Two generous thumb zones in the bottom corners, each a floating-origin nub. **Pointer Events + `setPointerCapture`** per zone → two thumbs track independently even when a thumb slides outside its corner. Left = vertical throttle (ratchet, sticky) + horizontal yaw (self-centers); right = pitch + roll (self-center, = lean angle in Angle mode). A single rAF pump applies light smoothing and writes the normalized axes via `setTouchAxes()`, which `advanceInput()` blends into the same channels (gated by a `touchActive` flag, so desktop is unaffected). A left-edge gauge shows the throttle level.

## 4. Touch equivalents for everything else

A top-center button cluster: **pause**, **mode** (ACRO/ANGLE), **respawn**, **nav target** (cycle / clear waypoint), **HUD**, and a **⚙ settings sheet** replacing leva (flight mode, tile detail `errorTarget`, draw distance, units). Each button calls the same store action as its desktop key.

## 5. Pause / free-look on touch

**Pause button** → freeze (drone frozen, physics paused, tiles keep streaming). **One-finger drag** = look (feeds the same delta the free-cam's `consumeLook()` drains); **two-finger drag** = dolly/truck the camera. The clean-capture default carries over: hide the chrome, leaving a small `PAUSED` badge.

## 6. HUD reflow — minimal essentials

Landscape, thumbs in both bottom corners. Keep: crosshair, artificial horizon, compact speed + altitude (top corners), flight-mode (the MODE button), and neighborhood + nav (top-center). The on-screen stick indicators and the bottom throttle bar are dropped (the virtual sticks + left-edge gauge replace them). The minimap collapses to a tap-to-open pill (top-right) and expands near-full-screen. Attribution stays visible (ToS), repositioned clear of the thumb zones.

## 7. Performance profile — crisp-first

Keep tile detail near desktop (`errorTarget` unchanged). **Cap `devicePixelRatio`** (1.25 on touch) — the single biggest mobile win. Shorter draw distance (~10 km, fog hides the cutoff) + a tighter LRU byte budget for aggressive unloading. Accept a lower fps target; the World detail/draw-distance sliders stay reachable in the settings sheet.

## 8. Non-goals

No native app, no separate codebase, no PWA, no collision, no desktop retuning.
