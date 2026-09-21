import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { shortestYawDeltaDeg } from '../core/coords';
import { fixValveMaterials } from '../core/fixValveMaterials';
import { HeldWeapon } from './HeldWeapon';
import { classifyWeapon, type WeaponClass } from '../weapons/weaponMesh';

/** Target standing height in Source units (feet → head ~72). */
const TARGET_HEIGHT = 72;

/** CS2 compass dirs relative to look: 0=forward, -90=right (E), +90=left (W). */
const LOCO_DIRS = [
  { key: 'n', deg: 0 },
  { key: 'ne', deg: -45 },
  { key: 'e', deg: -90 },
  { key: 'se', deg: -135 },
  { key: 's', deg: 180 },
  { key: 'sw', deg: 135 },
  { key: 'w', deg: 90 },
  { key: 'nw', deg: 45 },
] as const;

type LocoDir = (typeof LOCO_DIRS)[number]['key'];

interface GlbPlayerProps {
  team: 'CT' | 'T';
  opacity?: number;
  selected?: boolean;
  fallback: ReactNode;
  /** Units per tick — drives skeletal walk cycle. */
  speedPerTick?: number;
  dead?: boolean;
  /** Look pitch (Source degrees, +down). Applied to spine/neck/head after loco. */
  pitchDeg?: number;
  /** Eye yaw (Source degrees) — body faces this; loco dirs are relative to it. */
  lookYawDeg?: number;
  /** Movement yaw (Source degrees); null/still → idle. */
  moveYawDeg?: number | null;
  /** Active weapon short name — hand attach + arm hold pose. */
  weapon?: string | null;
  teamForWeapon?: 'CT' | 'T';
  pitchRadRef?: React.RefObject<number>;
  /** @deprecated unused — kept so callers don't break */
  torsoYawRad?: number;
}

const JUNK_NAME =
  /firstperson|viewmodel|v_arms|defusekit|sagebrush|dust_|mesh_overlay|n0_lr0|physics_group|playerflesh|agg_merge/i;

function meshLabel(obj: THREE.Object3D): string {
  return `${obj.name} ${obj.parent?.name ?? ''}`.toLowerCase();
}

function stripJunk(root: THREE.Object3D): void {
  const drop: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    if (JUNK_NAME.test(meshLabel(o))) drop.push(o);
  });
  for (const o of drop) o.parent?.remove(o);
}

function findBone(root: THREE.Object3D, ...names: string[]): THREE.Object3D | null {
  const want = names.map((n) => n.toLowerCase());
  let hit: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (hit || !o.name) return;
    if (want.includes(o.name.toLowerCase())) hit = o;
  });
  return hit;
}

type BoneRig = {
  legUL: THREE.Object3D | null;
  legUR: THREE.Object3D | null;
  legLL: THREE.Object3D | null;
  legLR: THREE.Object3D | null;
  armUL: THREE.Object3D | null;
  armUR: THREE.Object3D | null;
  spine: THREE.Object3D | null;
  spine1: THREE.Object3D | null;
  spine2: THREE.Object3D | null;
  neck: THREE.Object3D | null;
  head: THREE.Object3D | null;
  rest: Map<THREE.Object3D, THREE.Euler>;
};

function buildRig(root: THREE.Object3D): BoneRig {
  // CS2 VRF exports: leg_upper_L / spine_0 (case differs from older dumps).
  const legUL = findBone(root, 'leg_upper_l', 'leg_upper_L', 'L_Thigh', 'LeftUpLeg', 'mixamorig:LeftUpLeg');
  const legUR = findBone(root, 'leg_upper_r', 'leg_upper_R', 'R_Thigh', 'RightUpLeg', 'mixamorig:RightUpLeg');
  const legLL = findBone(root, 'leg_lower_l', 'leg_lower_L', 'L_Calf', 'LeftLeg', 'mixamorig:LeftLeg');
  const legLR = findBone(root, 'leg_lower_r', 'leg_lower_R', 'R_Calf', 'RightLeg', 'mixamorig:RightLeg');
  const armUL = findBone(root, 'arm_upper_l', 'arm_upper_L', 'L_UpperArm', 'LeftArm', 'mixamorig:LeftArm');
  const armUR = findBone(root, 'arm_upper_r', 'arm_upper_R', 'R_UpperArm', 'RightArm', 'mixamorig:RightArm');
  const spine = findBone(root, 'spine_0', 'spine_0_03', 'Spine', 'mixamorig:Spine');
  const spine1 = findBone(root, 'spine_1', 'spine_1_04');
  const spine2 = findBone(root, 'spine_2', 'spine_2_05', 'spine_3');
  const neck = findBone(root, 'neck_0', 'neck_01', 'Neck', 'mixamorig:Neck');
  const head = findBone(root, 'head_0', 'head', 'Head', 'mixamorig:Head');

  const rest = new Map<THREE.Object3D, THREE.Euler>();
  for (const b of [legUL, legUR, legLL, legLR, armUL, armUR, spine, spine1, spine2, neck, head]) {
    if (b) rest.set(b, b.rotation.clone());
  }
  return { legUL, legUR, legLL, legLR, armUL, armUR, spine, spine1, spine2, neck, head, rest };
}

/** Soft look pitch — mostly neck/head so loco spine stays natural. */
function applyAimPose(
  rig: BoneRig,
  pitchRad: number,
  torsoYawRad: number,
  additive: boolean,
  weaponClass: WeaponClass = 'other',
) {
  const p = THREE.MathUtils.clamp(pitchRad, -1.0, 1.0);
  const y = THREE.MathUtils.clamp(torsoYawRad, -0.35, 0.35);
  const pose = (bone: THREE.Object3D | null, dx: number, dy: number, dz = 0) => {
    if (!bone) return;
    if (additive) {
      bone.rotation.x += dx;
      bone.rotation.y += dy;
      bone.rotation.z += dz;
      return;
    }
    const r = rig.rest.get(bone);
    if (!r) return;
    bone.rotation.x = r.x + dx;
    bone.rotation.y = r.y + dy;
    bone.rotation.z = r.z + dz;
  };
  pose(rig.spine1, p * 0.08, y * 0.15);
  pose(rig.spine2, p * 0.12, y * 0.2);
  pose(rig.neck, p * 0.28, y * 0.25);
  pose(rig.head, p * 0.4, y * 0.2);

  // Raise arms into a CS2-like hold so the gun at the hand reads correctly.
  if (weaponClass === 'knife') {
    pose(rig.armUR, p * 0.15 - 0.25, -0.15, 0.35);
    pose(rig.armUL, p * 0.05 - 0.1, 0.1, -0.2);
  } else if (weaponClass === 'pistol' || weaponClass === 'nade') {
    pose(rig.armUR, p * 0.55 - 0.85, -0.05, 0.15);
    pose(rig.armUL, p * 0.15 - 0.2, 0.15, -0.25);
  } else {
    // rifle / smg / sniper — two-hand forward
    pose(rig.armUR, p * 0.45 - 0.95, -0.1, 0.2);
    pose(rig.armUL, p * 0.4 - 0.75, 0.25, -0.35);
  }
}

/**
 * Pin root_motion so clip root motion doesn't slide/spin the pawn.
 * Must use identity rotation: bind quat (0.5,0.5,0.5,0.5) + our rotX Z→Y
 * double-applies the axis fix and lays the character on its side/back.
 */
function freezeRootMotion(root: THREE.Object3D) {
  const bone = findBone(root, 'root_motion');
  if (!bone) return;
  bone.position.set(0, 0, 0);
  bone.rotation.set(0, 0, 0);
  bone.scale.set(1, 1, 1);
}

function applyBone(
  bone: THREE.Object3D | null,
  rest: Map<THREE.Object3D, THREE.Euler>,
  axis: 'x' | 'y' | 'z',
  delta: number,
) {
  if (!bone) return;
  const r = rest.get(bone);
  if (!r) return;
  bone.rotation.x = r.x + (axis === 'x' ? delta : 0);
  bone.rotation.y = r.y + (axis === 'y' ? delta : 0);
  bone.rotation.z = r.z + (axis === 'z' ? delta : 0);
}

class LoadErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.warn('[GlbPlayer] load failed, using procedural fallback', err, info.componentStack);
  }

  render() {
    if (this.state.failed) return <>{this.props.fallback}</>;
    return this.props.children;
  }
}

type Prepared = {
  scene: THREE.Object3D;
  scale: number;
  offset: [number, number, number];
  rot: [number, number, number];
  clips: THREE.AnimationClip[];
};

/**
 * Fit skinned agent into Source-unit Y-up space.
 * Centers XZ (Sketchfab exports often sit far from origin) and plants feet on Y=0.
 */
function preparePlayer(
  source: THREE.Object3D,
  clips: THREE.AnimationClip[],
  opacity: number,
  selected: boolean,
  emissive: string,
): Prepared | null {
  const root = cloneSkinned(source);
  stripJunk(root);
  fixValveMaterials(root, { unlit: false });
  root.updateMatrixWorld(true);

  let box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return null;

  const size0 = new THREE.Vector3();
  box.getSize(size0);
  if (size0.lengthSq() < 1e-10) return null;

  let rotX = 0;
  let rotZ = 0;
  if (size0.z >= size0.y * 1.2 && size0.z >= size0.x * 1.2) {
    rotX = -Math.PI / 2;
  } else if (size0.x >= size0.y * 1.2 && size0.x >= size0.z * 1.2) {
    rotZ = Math.PI / 2;
  }

  // Group look uses local +X. CS2 agent visual forward after Z→Y is +Z → +90° Y.
  const faceYaw = Math.PI / 2;
  const rot: [number, number, number] = [rotX, faceYaw, rotZ];

  const wrap = new THREE.Group();
  wrap.rotation.set(rot[0], rot[1], rot[2]);
  const measure = cloneSkinned(root);
  wrap.add(measure);
  wrap.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(wrap);
  const size = new THREE.Vector3();
  box.getSize(size);
  if (size.y < 0.05) return null;

  const scale = TARGET_HEIGHT / size.y;
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  const offset: [number, number, number] = [-cx * scale, -box.min.y * scale, -cz * scale];

  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (let i = 0; i < mats.length; i++) {
      const mat = mats[i];
      if (!mat) continue;
      const m = mat.clone();
      m.transparent = opacity < 1;
      m.opacity = opacity;
      m.depthWrite = opacity >= 1;
      if ('emissive' in m && selected) {
        (m as THREE.MeshStandardMaterial).emissive = new THREE.Color(emissive);
        (m as THREE.MeshStandardMaterial).emissiveIntensity = 0.12;
      }
      if (Array.isArray(mesh.material)) mesh.material[i] = m;
      else mesh.material = m;
    }
  });

  // Neutralize bind root_motion quat so group rotX/faceYaw alone stand the agent up.
  freezeRootMotion(root);

  return {
    scene: root,
    scale,
    offset,
    rot,
    clips: usableClips(clips).map((c) => c.clone()),
  };
}

/** Drop VRF preview / facial-only clips — they block procedural walk if treated as loco. */
function usableClips(clips: THREE.AnimationClip[]): THREE.AnimationClip[] {
  return clips.filter((c) => {
    const n = c.name.toLowerCase();
    if (/tools_preview|eye_test|preview|blink|eyelid|morph/.test(n)) return false;
    return c.tracks.some((t) => /\.(position|quaternion|scale)$/.test(t.name));
  });
}

function pickClip(clips: THREE.AnimationClip[], ...needles: string[]): THREE.AnimationClip | null {
  const lower = clips.map((c) => ({ c, n: c.name.toLowerCase() }));
  for (const needle of needles) {
    const hit = lower.find(({ n }) => n.includes(needle));
    if (hit) return hit.c;
  }
  return clips[0] ?? null;
}

/** Blend weights for 8-way loco from move-vs-look yaw (degrees). */
function eightWayWeights(relDeg: number): Record<LocoDir, number> {
  const scored = LOCO_DIRS.map((d) => ({
    key: d.key,
    dist: Math.abs(shortestYawDeltaDeg(relDeg, d.deg)),
  })).sort((a, b) => a.dist - b.dist);
  const a = scored[0];
  const b = scored[1];
  const out = Object.fromEntries(LOCO_DIRS.map((d) => [d.key, 0])) as Record<LocoDir, number>;
  if (!a) return out;
  if (!b || a.dist < 1e-3) {
    out[a.key] = 1;
    return out;
  }
  const span = a.dist + b.dist || 1;
  out[a.key] = b.dist / span;
  out[b.key] = a.dist / span;
  return out;
}

type LocoActions = {
  idle: THREE.AnimationAction | null;
  walk: Partial<Record<LocoDir, THREE.AnimationAction>>;
  run: Partial<Record<LocoDir, THREE.AnimationAction>>;
  /** Fallback single walk/run when 8-way missing */
  walkFwd: THREE.AnimationAction | null;
  runFwd: THREE.AnimationAction | null;
  hasEightWay: boolean;
};

function AnimatedPlayer({
  prepared,
  speedPerTick,
  dead,
  pitchDeg,
  lookYawDeg,
  moveYawDeg,
  weapon,
  teamForWeapon,
  pitchRadRef,
  opacity,
}: {
  prepared: Prepared;
  speedPerTick: number;
  dead: boolean;
  pitchDeg: number;
  lookYawDeg: number;
  moveYawDeg: number | null;
  weapon?: string | null;
  teamForWeapon: 'CT' | 'T';
  pitchRadRef?: React.RefObject<number>;
  opacity: number;
}) {
  const sceneRef = useRef<THREE.Object3D>(prepared.scene);
  const localPitch = useRef(0);
  const pitchRef = pitchRadRef ?? localPitch;
  sceneRef.current = prepared.scene;
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<LocoActions>({
    idle: null,
    walk: {},
    run: {},
    walkFwd: null,
    runFwd: null,
    hasEightWay: false,
  });
  const hasClips = prepared.clips.length > 0;
  const rigRef = useRef<BoneRig | null>(buildRig(prepared.scene));
  const phase = useRef(Math.random() * Math.PI * 2);
  const smoothPitch = useRef(0);
  const smoothSpeed = useRef(0);
  const smoothRelYaw = useRef(0);

  useEffect(() => {
    rigRef.current = buildRig(prepared.scene);
    sceneRef.current = prepared.scene;
    if (!hasClips) return;
    const mixer = new THREE.AnimationMixer(prepared.scene);
    mixerRef.current = mixer;
    const byExact = (name: string) =>
      prepared.clips.find((c) => c.name.toLowerCase() === name) ?? null;

    const idleClip =
      byExact('idle') ?? pickClip(prepared.clips, 'idle', 'stand', 'default') ?? prepared.clips[0];
    const idle = mixer.clipAction(idleClip);
    idle.enabled = true;
    idle.setLoop(THREE.LoopRepeat, Infinity);
    idle.setEffectiveWeight(1);
    idle.play();

    const walk: Partial<Record<LocoDir, THREE.AnimationAction>> = {};
    const run: Partial<Record<LocoDir, THREE.AnimationAction>> = {};
    let eight = 0;
    for (const d of LOCO_DIRS) {
      const wClip = byExact(`walk_${d.key}`);
      const rClip = byExact(`run_${d.key}`);
      if (wClip) {
        const a = mixer.clipAction(wClip);
        a.enabled = true;
        a.setLoop(THREE.LoopRepeat, Infinity);
        a.setEffectiveWeight(0);
        a.play();
        walk[d.key] = a;
        eight++;
      }
      if (rClip) {
        const a = mixer.clipAction(rClip);
        a.enabled = true;
        a.setLoop(THREE.LoopRepeat, Infinity);
        a.setEffectiveWeight(0);
        a.play();
        run[d.key] = a;
      }
    }

    const walkFwdClip =
      byExact('walk_n') ?? byExact('walk') ?? pickClip(prepared.clips, 'walk', 'jog', 'move');
    const runFwdClip =
      byExact('run_n') ?? byExact('run') ?? pickClip(prepared.clips, 'run', 'sprint') ?? walkFwdClip;
    let walkFwd: THREE.AnimationAction | null = null;
    let runFwd: THREE.AnimationAction | null = null;
    if (eight < 4 && walkFwdClip) {
      walkFwd = mixer.clipAction(walkFwdClip);
      walkFwd.enabled = true;
      walkFwd.setLoop(THREE.LoopRepeat, Infinity);
      walkFwd.setEffectiveWeight(0);
      walkFwd.play();
    }
    if (eight < 4 && runFwdClip) {
      runFwd = mixer.clipAction(runFwdClip);
      runFwd.enabled = true;
      runFwd.setLoop(THREE.LoopRepeat, Infinity);
      runFwd.setEffectiveWeight(0);
      runFwd.play();
    }

    actionsRef.current = {
      idle,
      walk,
      run,
      walkFwd,
      runFwd,
      hasEightWay: eight >= 4,
    };
    return () => {
      mixer.stopAllAction();
      mixerRef.current = null;
    };
  }, [prepared, hasClips]);

  useFrame((_, delta) => {
    if (dead) return;
    const dt = Math.min(delta, 0.05);
    smoothSpeed.current = THREE.MathUtils.damp(smoothSpeed.current, speedPerTick, 7, dt);
    const speed = smoothSpeed.current;
    const moving = speed > 0.28;
    const sprintMix = THREE.MathUtils.smoothstep(speed, 1.4, 2.6);

    smoothPitch.current = THREE.MathUtils.damp(
      smoothPitch.current,
      THREE.MathUtils.degToRad(pitchDeg),
      9,
      dt,
    );
    const pitchRad = smoothPitch.current;
    localPitch.current = pitchRad;
    const rig = rigRef.current;
    const wClass = classifyWeapon(weapon);

    const moveYaw = moveYawDeg != null && Number.isFinite(moveYawDeg) ? Number(moveYawDeg) : null;
    const relTarget =
      moving && moveYaw != null ? shortestYawDeltaDeg(lookYawDeg, moveYaw) : smoothRelYaw.current;
    // Smooth direction change so 8-way doesn't snap.
    const relStep = shortestYawDeltaDeg(smoothRelYaw.current, relTarget);
    smoothRelYaw.current += relStep * (1 - Math.exp(-8 * dt));

    if (hasClips && mixerRef.current) {
      const acts = actionsRef.current;
      const moveAmt = moving ? THREE.MathUtils.smoothstep(speed, 0.28, 1.35) : 0;
      const tIdle = 1 - moveAmt;
      const blend = 5;
      const dampW = (a: THREE.AnimationAction | null | undefined, target: number) => {
        if (!a) return;
        a.setEffectiveWeight(THREE.MathUtils.damp(a.getEffectiveWeight(), target, blend, dt));
      };

      dampW(acts.idle, tIdle);

      if (acts.hasEightWay) {
        const dirW = eightWayWeights(smoothRelYaw.current);
        const walkShare = moveAmt * (1 - sprintMix);
        const runShare = moveAmt * sprintMix;
        for (const d of LOCO_DIRS) {
          dampW(acts.walk[d.key], walkShare * dirW[d.key]);
          dampW(acts.run[d.key], runShare * dirW[d.key]);
          const wa = acts.walk[d.key];
          const ra = acts.run[d.key];
          if (wa) {
            wa.timeScale = THREE.MathUtils.damp(
              wa.timeScale,
              Math.min(1.25, 0.85 + speed * 0.09),
              6,
              dt,
            );
          }
          if (ra) {
            ra.timeScale = THREE.MathUtils.damp(
              ra.timeScale,
              Math.min(1.2, 0.9 + speed * 0.05),
              6,
              dt,
            );
          }
        }
      } else {
        dampW(acts.walkFwd, moveAmt * (1 - sprintMix));
        dampW(acts.runFwd, moveAmt * sprintMix);
      }

      mixerRef.current.update(dt);
      freezeRootMotion(prepared.scene);
      if (rig) applyAimPose(rig, pitchRad, 0, true, wClass);
      return;
    }

    if (!rig) return;
    if (moving) phase.current += dt * Math.min(11, 4.5 + speed * 1.5);
    const swing = moving ? Math.sin(phase.current) * 0.45 : 0;
    const knee = moving ? Math.max(0, Math.sin(phase.current + Math.PI)) * 0.55 : 0;
    const arm = moving ? swing * 0.35 : 0;
    applyBone(rig.legUL, rig.rest, 'x', swing);
    applyBone(rig.legUR, rig.rest, 'x', -swing);
    applyBone(rig.legLL, rig.rest, 'x', knee);
    applyBone(rig.legLR, rig.rest, 'x', Math.max(0, Math.sin(phase.current)) * 0.55);
    applyBone(rig.armUL, rig.rest, 'x', -arm);
    applyBone(rig.armUR, rig.rest, 'x', arm);
    applyAimPose(rig, pitchRad, 0, false, wClass);
  });

  return (
    <>
      <group
        position={prepared.offset}
        scale={[prepared.scale, prepared.scale, prepared.scale]}
        rotation={prepared.rot}
      >
        <primitive object={prepared.scene} />
      </group>
      {/* Outside scale — Source-unit gun; grip meters × hand.matrixWorld. */}
      <HeldWeapon
        sceneRef={sceneRef}
        team={teamForWeapon}
        weapon={weapon}
        pitchRadRef={pitchRef}
        opacity={opacity}
        dead={dead}
      />
    </>
  );
}

function LoadedPlayer({
  url,
  opacity,
  selected,
  emissive,
  fallback,
  speedPerTick,
  dead,
  pitchDeg,
  lookYawDeg,
  moveYawDeg,
  weapon,
  teamForWeapon,
  pitchRadRef,
}: {
  url: string;
  opacity: number;
  selected: boolean;
  emissive: string;
  fallback: ReactNode;
  speedPerTick: number;
  dead: boolean;
  pitchDeg: number;
  lookYawDeg: number;
  moveYawDeg: number | null;
  weapon?: string | null;
  teamForWeapon: 'CT' | 'T';
  pitchRadRef?: React.RefObject<number>;
}) {
  const gltf = useGLTF(url);

  const prepared = useMemo(
    () => preparePlayer(gltf.scene, gltf.animations ?? [], opacity, selected, emissive),
    [gltf.scene, gltf.animations, opacity, selected, emissive],
  );

  if (!prepared) return <>{fallback}</>;

  return (
    <AnimatedPlayer
      prepared={prepared}
      speedPerTick={speedPerTick}
      dead={dead}
      pitchDeg={pitchDeg}
      lookYawDeg={lookYawDeg}
      moveYawDeg={moveYawDeg}
      weapon={weapon}
      teamForWeapon={teamForWeapon}
      pitchRadRef={pitchRadRef}
      opacity={opacity}
    />
  );
}

export function GlbPlayer({
  team,
  opacity = 1,
  selected = false,
  fallback,
  speedPerTick = 0,
  dead = false,
  pitchDeg = 0,
  lookYawDeg = 0,
  moveYawDeg = null,
  weapon = null,
  teamForWeapon,
  pitchRadRef,
}: GlbPlayerProps) {
  const base = team === 'CT' ? '/models/players/ct.glb' : '/models/players/t.glb';
  const url = base;
  const weaponTeam = teamForWeapon ?? team;

  // Always attempt the agent GLB. SoftBoundary/Suspense handle missing files.
  return (
    <LoadErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <LoadedPlayer
          url={url}
          opacity={opacity}
          selected={selected}
          emissive={team === 'CT' ? '#38bdf8' : '#fdba74'}
          fallback={fallback}
          speedPerTick={speedPerTick}
          dead={dead}
          pitchDeg={pitchDeg}
          lookYawDeg={lookYawDeg}
          moveYawDeg={moveYawDeg}
          weapon={weapon}
          teamForWeapon={weaponTeam}
          pitchRadRef={pitchRadRef}
        />
      </Suspense>
    </LoadErrorBoundary>
  );
}
