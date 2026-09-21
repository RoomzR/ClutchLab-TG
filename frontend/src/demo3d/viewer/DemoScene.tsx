import { Suspense, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import type { BombEvent, GrenadeData, KillData, TickData } from '../../types/match';
import type { MapConfig } from '../../utils/mapConfig';
import {
  buildPlayerTracks,
  interpolatePositionsAtTick,
} from '../../utils/positionInterpolation';
import { getDeadPlayersAtTick, type RoundTickRange } from '../../utils/roundStats';
import { mapWorldBounds } from '../core/coords';
import { BombMarker } from '../effects/BombMarker';
import { CameraRig, type CameraMode } from './CameraRig';
import { GrenadeMeshes } from '../effects/GrenadeMeshes';
import { KillTracers } from '../effects/KillTracers';
import { CharacterOperator } from '../characters/CharacterOperator';
import { MapGround } from '../maps/MapGround';
import { tickMapCollisionFrame } from '../maps/mapCollision';
import { PovViewmodel } from '../weapons/PovViewmodel';
import { classifyWeapon } from '../weapons/weaponMesh';

interface DemoSceneProps {
  mapConfig: MapConfig;
  positions: TickData[];
  grenades: GrenadeData[];
  kills: KillData[];
  bombEvents?: BombEvent[];
  currentTick: number;
  tickRate: number;
  roundTickRanges: RoundTickRange[];
  selectedRound: number | null;
  cameraMode: CameraMode;
  followPlayer: string | null;
  showNames: boolean;
}

export function DemoScene({
  mapConfig,
  positions,
  grenades,
  kills,
  bombEvents = [],
  currentTick,
  tickRate,
  roundTickRanges,
  selectedRound,
  cameraMode,
  followPlayer,
  showNames,
}: DemoSceneProps) {
  const bounds = useMemo(() => mapWorldBounds(mapConfig), [mapConfig]);
  const tracks = useMemo(() => buildPlayerTracks(positions), [positions]);
  const livePlayers = useMemo(
    () => interpolatePositionsAtTick(tracks, currentTick),
    [tracks, currentTick],
  );

  const dead = useMemo(
    () => getDeadPlayersAtTick(currentTick, kills, roundTickRanges, selectedRound),
    [currentTick, kills, roundTickRanges, selectedRound],
  );

  const followTarget = useMemo(() => {
    if (!followPlayer) return null;
    return livePlayers.find((p) => p.player_name === followPlayer) ?? null;
  }, [followPlayer, livePlayers]);

  useFrame(() => {
    tickMapCollisionFrame();
  });

  const pov = cameraMode === 'pov';
  const castShadows = !pov;

  return (
    <>
      <color attach="background" args={['#5a7388']} />
      <ambientLight intensity={pov ? 0.85 : 0.65} />
      <directionalLight
        castShadow={castShadows}
        intensity={pov ? 0.9 : 1.15}
        position={[bounds.centerThree[0] + 900, 1400, bounds.centerThree[2] - 700]}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={6000}
        shadow-camera-left={-2000}
        shadow-camera-right={2000}
        shadow-camera-top={2000}
        shadow-camera-bottom={-2000}
      />
      <hemisphereLight args={['#dbeafe', '#334155', 0.45]} />

      <Suspense fallback={null}>
        <MapGround mapConfig={mapConfig} />
      </Suspense>

      {livePlayers.map((p) => (
        <CharacterOperator
          key={p.player_name}
          name={p.player_name}
          team={p.team}
          x={p.x}
          y={p.y}
          z={p.z}
          yaw={p.yaw}
          pitch={p.pitch}
          moveYaw={p.moveYaw}
          health={p.health}
          armor={p.armor}
          weapon={p.weapon}
          speedPerTick={p.speedPerTick}
          dead={dead.has(p.player_name)}
          selected={followPlayer === p.player_name}
          showName={showNames && !pov}
          hideForPov={pov && followPlayer === p.player_name}
          showAim={!pov}
        />
      ))}

      <GrenadeMeshes grenades={grenades} currentTick={currentTick} tickRate={tickRate} />
      <KillTracers
        kills={kills}
        positions={positions}
        currentTick={currentTick}
        tickRate={tickRate}
      />
      <BombMarker bombEvents={bombEvents} currentTick={currentTick} />

      {/* After CameraRig so viewmodel useFrame can follow the latest eye pose. */}
      <CameraRig
        mode={cameraMode}
        target={
          followTarget
            ? {
                x: followTarget.x,
                y: followTarget.y,
                z: followTarget.z,
                yaw: followTarget.yaw,
                pitch: followTarget.pitch,
              }
            : null
        }
        mapCenter={bounds.centerThree}
        mapSize={bounds.width}
        scoped={Boolean(followTarget?.scoped)}
        weapon={followTarget?.weapon}
      />

      <PovViewmodel
        active={
          cameraMode === 'pov' &&
          !!followTarget &&
          !dead.has(followPlayer ?? '') &&
          !(followTarget.scoped && classifyWeapon(followTarget.weapon) === 'sniper')
        }
        team={followTarget?.team ?? 'T'}
        weapon={followTarget?.weapon}
      />
    </>
  );
}
