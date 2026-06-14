// Pause / free-look camera. While paused (useDroneStore.paused), the drone is
// frozen (FlightModel bails) and this takes over the SAME camera — no second
// camera, no makeDefault swap (which would rebuild the postprocessing composer).
//
// On the pause edge we reparent the FPV camera: detach it to the scene root so the
// frozen drone group no longer drives it, free-fly it in world space, then on resume
// reattach it under the drone rig and restore the exact FPV pose (origin + uptilt).
// The reparent runs in a useLayoutEffect so it lands before the next useFrame.
import { useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useDroneStore } from "../drone/droneState";
import { useTuning } from "../tuning/tuningStore";
import { consumeLook, consumeTouchPan, isDown } from "../input/useInput";
import { CONTROLS } from "../input/controlConfig";
import { IS_TOUCH } from "../ui/device";
import { DEG2RAD } from "../lib/mathUtils";

const LOOK_SENS = 0.0022; // rad per pixel of mouse motion
const MOVE_SPEED = 60; // m/s base
const FAST_MULT = 4; // Shift
const PITCH_LIMIT = Math.PI / 2 - 0.02; // avoid gimbal flip at straight up/down
const TOUCH_PAN_GAIN = 0.25; // m per px of 2-finger drag (touch free-cam dolly/truck)

// module scratch — single-threaded useFrame, allocation-free
const _euler = new THREE.Euler(0, 0, 0, "YXZ");
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();

export function FreeCamController({
  droneRef,
}: {
  droneRef: RefObject<THREE.Group | null>;
}): null {
  const paused = useDroneStore((s) => s.paused);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const yaw = useRef(0);
  const pitch = useRef(0);

  useLayoutEffect(() => {
    if (paused) {
      // detach to world space, preserving the current view pose (no jump)
      scene.attach(camera);
      _euler.setFromQuaternion(camera.quaternion, "YXZ");
      yaw.current = _euler.y;
      pitch.current = _euler.x;
    } else {
      // back under the drone rig + restore the exact FPV local pose (the uptilt that
      // FpvCamera bakes; its layout effect won't re-fire on resume)
      const g = droneRef.current;
      if (g) {
        g.attach(camera);
        camera.position.set(0, 0, 0);
        camera.rotation.set(useTuning.getState().cameraUptilt * DEG2RAD, 0, 0);
        camera.updateMatrixWorld();
      }
    }
  }, [paused, camera, scene, droneRef]);

  useFrame((_s, delta) => {
    if (!useDroneStore.getState().paused) return;

    // look (mouse delta only accrues while pointer-locked; click to lock)
    const { dx, dy } = consumeLook();
    if (dx !== 0 || dy !== 0) {
      const invert = useTuning.getState().invertPitch;
      yaw.current -= dx * LOOK_SENS;
      pitch.current -= (invert ? -dy : dy) * LOOK_SENS;
      pitch.current = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch.current));
      camera.quaternion.setFromEuler(_euler.set(pitch.current, yaw.current, 0, "YXZ"));
    }

    // move along the look direction (no collision — phases through everything)
    let mz = 0;
    let mx = 0;
    if (isDown(CONTROLS.throttleUp)) mz += 1; // W forward
    if (isDown(CONTROLS.throttleDown)) mz -= 1; // S back
    if (isDown(CONTROLS.yawRight)) mx += 1; // D right
    if (isDown(CONTROLS.yawLeft)) mx -= 1; // A left
    if (mz !== 0 || mx !== 0) {
      const fast = isDown("ShiftLeft") || isDown("ShiftRight");
      const step = MOVE_SPEED * (fast ? FAST_MULT : 1) * delta;
      _fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
      _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
      camera.position.addScaledVector(_fwd, mz * step);
      camera.position.addScaledVector(_right, mx * step);
    }

    // touch: 2-finger drag dollies/trucks the free camera (there's no WASD on mobile).
    // The 1-finger look path is unchanged — it feeds the same mouse delta consumed above.
    if (IS_TOUCH) {
      const { dz, dx: pdx } = consumeTouchPan();
      if (dz !== 0 || pdx !== 0) {
        _fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
        _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
        camera.position.addScaledVector(_fwd, dz * TOUCH_PAN_GAIN);
        camera.position.addScaledVector(_right, pdx * TOUCH_PAN_GAIN);
      }
    }

    camera.updateMatrixWorld();
  });

  return null;
}
