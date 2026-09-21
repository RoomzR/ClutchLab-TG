import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { EYE_HEIGHT, gameToThree, sourceLookDir } from '../core/coords';

export type CameraMode = 'orbit' | 'free' | 'follow' | 'pov';

interface CameraRigProps {
  mode: CameraMode;
  target?: {
    x: number;
    y: number;
    z: number;
    yaw?: number | null;
    pitch?: number | null;
  } | null;
  mapCenter: [number, number, number];
  mapSize: number;
  /** AWP/Scout scoped — lower FOV like CS2. */
  scoped?: boolean;
  weapon?: string | null;
}

export function CameraRig({
  mode,
  target,
  mapCenter,
  mapSize,
  scoped = false,
  weapon = null,
}: CameraRigProps) {
  const { camera, gl } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const yawPitch = useRef({ yaw: 0, pitch: -0.2 });
  const freePos = useRef(new THREE.Vector3(mapCenter[0], 420, mapCenter[2] + mapSize * 0.35));
  const pointerLocked = useRef(false);
  const initialized = useRef(false);
  const lastMode = useRef(mode);

  useEffect(() => {
    if (!initialized.current) {
      camera.position.set(mapCenter[0], Math.max(420, mapSize * 0.28), mapCenter[2] + mapSize * 0.35);
      camera.lookAt(mapCenter[0], 40, mapCenter[2]);
      freePos.current.copy(camera.position);
      initialized.current = true;
    }
  }, [camera, mapCenter, mapSize]);

  useEffect(() => {
    if (lastMode.current !== mode) {
      if (mode === 'free') {
        freePos.current.copy(camera.position);
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        yawPitch.current.yaw = Math.atan2(-dir.x, -dir.z);
        yawPitch.current.pitch = Math.asin(Math.max(-0.99, Math.min(0.99, dir.y)));
      }
      lastMode.current = mode;
    }
  }, [mode, camera]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useEffect(() => {
    if (mode !== 'free') {
      if (document.pointerLockElement === gl.domElement) {
        document.exitPointerLock();
      }
      pointerLocked.current = false;
      return;
    }

    const el = gl.domElement;

    const onClick = () => {
      if (document.pointerLockElement !== el) {
        el.requestPointerLock();
      }
    };

    const onLockChange = () => {
      pointerLocked.current = document.pointerLockElement === el;
    };

    const onMove = (e: MouseEvent) => {
      if (!pointerLocked.current) return;
      yawPitch.current.yaw -= e.movementX * 0.0022;
      yawPitch.current.pitch = Math.max(
        -1.4,
        Math.min(1.2, yawPitch.current.pitch - e.movementY * 0.0022),
      );
    };

    el.addEventListener('click', onClick);
    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('mousemove', onMove);
    return () => {
      el.removeEventListener('click', onClick);
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('mousemove', onMove);
      if (document.pointerLockElement === el) document.exitPointerLock();
    };
  }, [gl, mode]);

  // Priority -2: eye pose before PovViewmodel (−1) and render (0).
  useFrame((_, delta) => {
    if (mode === 'orbit') return;

    if ((mode === 'follow' || mode === 'pov') && !target) {
      // Round switch / missing tick — keep last free pose instead of freezing mid-air.
      return;
    }

    if ((mode === 'follow' || mode === 'pov') && target) {
      const [px, py, pz] = gameToThree(target.x, target.y, target.z);
      const yawDeg = target.yaw ?? 0;
      const pitchDeg = target.pitch ?? 0;
      const [fx, fy, fz] = sourceLookDir(yawDeg, pitchDeg);

      if (mode === 'pov') {
        // Snap to demo eye angles — no lerp skew vs parsed pitch/yaw.
        const eye = new THREE.Vector3(px, py + EYE_HEIGHT, pz);
        camera.position.copy(eye);
        freePos.current.copy(eye);
        camera.up.set(0, 1, 0);
        camera.lookAt(eye.x + fx, eye.y + fy, eye.z + fz);
        if ('fov' in camera) {
          const persp = camera as THREE.PerspectiveCamera;
          let dirty = false;
          // Scoped snipers: CS2-like zoom FOV (~40). Otherwise playable 75.
          const wantFov =
            scoped && /awp|ssg08|scar20|g3sg1|scout/i.test(String(weapon || ''))
              ? 40
              : scoped
                ? 45
                : 75;
          if (Math.abs(persp.fov - wantFov) > 0.1) {
            persp.fov = wantFov;
            dirty = true;
          }
          if (Math.abs(persp.near - 0.05) > 1e-4) {
            persp.near = 0.05;
            dirty = true;
          }
          if (dirty) persp.updateProjectionMatrix();
        }
        return;
      }

      if ('fov' in camera) {
        const persp = camera as THREE.PerspectiveCamera;
        if (Math.abs(persp.fov - 75) > 0.1) {
          persp.fov = 75;
          persp.updateProjectionMatrix();
        }
      }

      const desired = new THREE.Vector3(
        px - fx * 180,
        py + EYE_HEIGHT + 28,
        pz - fz * 180,
      );
      camera.position.lerp(desired, 1 - Math.exp(-5 * delta));
      camera.lookAt(px, py + EYE_HEIGHT - 4, pz);
      return;
    }

    if (mode === 'free') {
      const speed = (keys.current.ShiftLeft ? 1600 : 700) * delta;
      const forward = new THREE.Vector3(
        -Math.sin(yawPitch.current.yaw) * Math.cos(yawPitch.current.pitch),
        Math.sin(yawPitch.current.pitch),
        -Math.cos(yawPitch.current.yaw) * Math.cos(yawPitch.current.pitch),
      ).normalize();
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

      if (keys.current.KeyW || keys.current.ArrowUp) freePos.current.addScaledVector(forward, speed);
      if (keys.current.KeyS || keys.current.ArrowDown) freePos.current.addScaledVector(forward, -speed);
      if (keys.current.KeyA || keys.current.ArrowLeft) freePos.current.addScaledVector(right, -speed);
      if (keys.current.KeyD || keys.current.ArrowRight) freePos.current.addScaledVector(right, speed);
      if (keys.current.KeyE || keys.current.Space) freePos.current.y += speed;
      if (keys.current.KeyQ || keys.current.ControlLeft) freePos.current.y -= speed;

      camera.position.copy(freePos.current);
      camera.lookAt(freePos.current.clone().add(forward));
    }
  }, -2);

  if (mode !== 'orbit') return null;

  return (
    <OrbitControls
      makeDefault
      target={mapCenter}
      enableDamping
      dampingFactor={0.08}
      minDistance={180}
      maxDistance={mapSize * 1.6}
      maxPolarAngle={Math.PI * 0.48}
    />
  );
}
