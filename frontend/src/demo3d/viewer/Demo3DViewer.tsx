import { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Maximize2, Minimize2, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import type { BombEvent, GrenadeData, KillData, RoundData, RoundPause, TickData } from '../../types/match';
import { PlayerTimeline } from '../../components/PlayerTimeline';
import type { RoundTickRange } from '../../utils/roundStats';
import { getMapConfig } from '../../utils/mapConfig';
import { cn } from '../../lib/cn';
import {
  buildPlayerTracks,
  interpolateTrackAtTick,
} from '../../utils/positionInterpolation';
import { Cs2SpectatorHud } from '../hud/Cs2SpectatorHud';
import { MapLoadingScreen } from '../hud/MapLoadingScreen';
import { MiniMap } from '../hud/MiniMap';
import { PovOverlay } from '../hud/PovOverlay';
import { useDemoAssetLoader } from '../loading/useDemoAssetLoader';
import { DemoScene } from './DemoScene';
import type { CameraMode } from './CameraRig';

interface Demo3DViewerProps {
  mapName: string;
  positions: TickData[];
  grenades: GrenadeData[];
  kills: KillData[];
  bombEvents?: BombEvent[];
  rounds: RoundData[];
  roundPauses?: RoundPause[];
  roundTickRanges: RoundTickRange[];
  selectedRound: number | null;
  onRoundSelect: (round: number | null) => void;
  currentTick: number;
  onTickChange: (tick: number) => void;
  tickStart: number;
  tickEnd: number;
  tickRate: number;
  isPlaying: boolean;
  onPlayPause: () => void;
  playbackSpeed: number;
  onSpeedChange: (speed: number) => void;
  teamTName: string;
  teamCtName: string;
  playerNames: string[];
  players?: { name: string; team: 'CT' | 'T'; crosshair_code?: string | null }[];
  className?: string;
}

export function Demo3DViewer({
  mapName,
  positions,
  grenades,
  kills,
  bombEvents = [],
  rounds,
  roundPauses = [],
  roundTickRanges,
  selectedRound,
  onRoundSelect,
  currentTick,
  onTickChange,
  tickStart,
  tickEnd,
  tickRate,
  isPlaying,
  onPlayPause,
  playbackSpeed,
  onSpeedChange,
  teamTName,
  teamCtName,
  playerNames,
  players: playersProp,
  className,
}: Demo3DViewerProps) {
  const mapConfig = getMapConfig(mapName);
  const loadState = useDemoAssetLoader(mapConfig.id);
  const [cameraMode, setCameraMode] = useState<CameraMode>('free');
  const [followPlayer, setFollowPlayer] = useState<string | null>(playerNames[0] ?? null);
  const [showNames, setShowNames] = useState(true);
  const [immersive, setImmersive] = useState(true);
  const [gpuHint, setGpuHint] = useState(true);

  const players = useMemo(() => {
    if (playersProp?.length) return playersProp;
    const teamByName = new Map<string, 'CT' | 'T'>();
    for (const p of positions) {
      if (!teamByName.has(p.player_name)) teamByName.set(p.player_name, p.team);
    }
    return playerNames.map((name) => ({
      name,
      team: teamByName.get(name) ?? 'T',
      crosshair_code: null as string | null,
    }));
  }, [playersProp, playerNames, positions]);

  const followCrosshair = useMemo(() => {
    if (!followPlayer) return null;
    const exact = players.find((p) => p.name === followPlayer)?.crosshair_code;
    if (exact) return exact;
    const lower = followPlayer.toLowerCase();
    return (
      players.find((p) => p.name.toLowerCase() === lower)?.crosshair_code ?? null
    );
  }, [followPlayer, players]);

  const tracks = useMemo(() => buildPlayerTracks(positions), [positions]);
  const followPos = useMemo(() => {
    if (!followPlayer) return null;
    const pos = interpolateTrackAtTick(tracks.get(followPlayer) ?? [], currentTick);
    if (!pos) return null;
    return {
      x: pos.x,
      y: pos.y,
      z: pos.z,
      weapon: pos.weapon,
      pitch: pos.pitch,
      yaw: pos.yaw,
      scoped: pos.scoped,
    };
  }, [followPlayer, tracks, currentTick]);

  const selectPlayer = (name: string) => {
    setFollowPlayer(name);
    if (cameraMode === 'orbit' || cameraMode === 'free') {
      setCameraMode('follow');
    }
  };

  const setCamera = (mode: CameraMode) => {
    setCameraMode(mode);
    if ((mode === 'follow' || mode === 'pov') && !followPlayer && playerNames[0]) {
      setFollowPlayer(playerNames[0]);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        onPlayPause();
        return;
      }
      if (e.code === 'KeyN') {
        setShowNames((v) => !v);
        return;
      }
      if (e.code === 'KeyV') {
        setCameraMode((m) => {
          const next = m === 'pov' ? 'follow' : 'pov';
          if ((next === 'follow' || next === 'pov') && !followPlayer && playerNames[0]) {
            setFollowPlayer(playerNames[0]);
          }
          return next;
        });
        return;
      }
      if (e.code === 'KeyC') {
        setCameraMode((m) => (m === 'free' ? 'follow' : 'free'));
        return;
      }
      const digit = e.code.match(/^Digit(\d)$/);
      if (digit) {
        const idx = digit[1] === '0' ? 9 : Number(digit[1]) - 1;
        const ordered = [
          ...players.filter((p) => p.team === 'T'),
          ...players.filter((p) => p.team === 'CT'),
        ];
        if (ordered[idx]) {
          setFollowPlayer(ordered[idx].name);
          setCameraMode((m) => (m === 'orbit' || m === 'free' ? 'follow' : m));
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onPlayPause, players, followPlayer, playerNames]);

  const jumpRound = (dir: -1 | 1) => {
    if (!rounds.length) return;
    const idx =
      selectedRound && selectedRound > 0
        ? rounds.findIndex((r) => r.round_number === selectedRound)
        : 0;
    const next = Math.min(rounds.length - 1, Math.max(0, (idx < 0 ? 0 : idx) + dir));
    const round = rounds[next];
    onRoundSelect(round.round_number);
    const range = roundTickRanges.find((r) => r.round_number === round.round_number);
    onTickChange(range?.start ?? round.start_tick ?? tickStart);
  };

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-sm border border-white/10 bg-[#0a0e14]',
        immersive ? 'h-[min(92vh,1100px)] min-h-[720px]' : 'h-[640px] min-h-[560px]',
        className,
      )}
    >
      {!loadState.ready ? (
        <MapLoadingScreen
          mapName={mapConfig.id}
          mapImageUrl={mapConfig.imageUrl}
          state={loadState}
        />
      ) : (
        <>
      <Canvas
        shadows={cameraMode !== 'pov'}
        dpr={[1, 1.5]}
        camera={{ fov: 75, near: 0.05, far: 25000, position: [0, 420, 1200] }}
        gl={{
          antialias: cameraMode !== 'pov',
          powerPreference: 'high-performance',
          alpha: false,
        }}
        performance={{ min: 0.5 }}
        className="!absolute inset-0 h-full w-full"
        onCreated={({ gl }) => {
          gl.setClearColor('#87a0b8');
          gl.shadowMap.autoUpdate = false;
          gl.shadowMap.needsUpdate = true;
        }}
      >
        <DemoScene
          mapConfig={mapConfig}
          positions={positions}
          grenades={grenades}
          kills={kills}
          bombEvents={bombEvents}
          currentTick={currentTick}
          tickRate={tickRate}
          roundTickRanges={roundTickRanges}
          selectedRound={selectedRound}
          cameraMode={cameraMode}
          followPlayer={followPlayer}
          showNames={showNames}
        />
      </Canvas>

      <Cs2SpectatorHud
        mapDisplayName={mapConfig.displayName}
        currentTick={currentTick}
        tickRate={tickRate}
        teamTName={teamTName}
        teamCtName={teamCtName}
        selectedRound={selectedRound}
        rounds={rounds}
        roundTickRanges={roundTickRanges}
        roundPauses={roundPauses}
        kills={kills}
        positions={positions}
        players={players}
        followPlayer={followPlayer}
        onSelectPlayer={selectPlayer}
        cameraMode={cameraMode}
        onCameraMode={setCamera}
      />

      <MiniMap
        mapConfig={mapConfig}
        positions={positions}
        grenades={grenades}
        kills={kills}
        currentTick={currentTick}
        roundTickRanges={roundTickRanges}
        selectedRound={selectedRound}
        followPlayer={followPlayer}
      />

      <PovOverlay
        enabled
        cameraMode={cameraMode}
        followPlayer={followPlayer}
        followPos={followPos}
        weapon={followPos?.weapon}
        scoped={followPos?.scoped}
        crosshairCode={followCrosshair}
        grenades={grenades}
        currentTick={currentTick}
        tickRate={tickRate}
      />

      {gpuHint && (
        <div className="absolute left-3 top-[200px] z-40 w-[200px] rounded-sm border border-amber-400/30 bg-black/85 px-2.5 py-2 backdrop-blur">
          <p className="text-[10px] font-semibold text-amber-200">3D Spectator</p>
          <p className="mt-1 text-[10px] leading-snug text-slate-400">
            Aim / weapons from demo · V = POV · 1–0 players
          </p>
          <button
            type="button"
            onClick={() => setGpuHint(false)}
            className="mt-1 text-[10px] font-bold text-amber-300 hover:text-amber-100"
          >
            Got it
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setImmersive((v) => !v)}
        className="absolute right-3 top-3 z-40 rounded-sm border border-white/10 bg-black/70 p-2 text-slate-300 backdrop-blur hover:text-white"
        title={immersive ? 'Compact' : 'Immersive'}
      >
        {immersive ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </button>

      {/* Compact transport — keeps ~90% of the frame for the 3D view */}
      <div className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/95 via-black/70 to-transparent px-2.5 pb-2 pt-8">
        <div className="mb-1.5 flex items-center justify-center gap-1.5">
          <button
            type="button"
            onClick={() => jumpRound(-1)}
            className="rounded-sm border border-white/10 bg-white/5 p-1.5 text-slate-300 hover:text-white"
          >
            <SkipBack className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onPlayPause}
            className="rounded-sm border border-amber-400/40 bg-amber-400 px-3 py-1.5 text-black hover:bg-amber-300"
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => jumpRound(1)}
            className="rounded-sm border border-white/10 bg-white/5 p-1.5 text-slate-300 hover:text-white"
          >
            <SkipForward className="h-3.5 w-3.5" />
          </button>
        </div>
        <PlayerTimeline
          compact
          tickStart={tickStart}
          tickEnd={tickEnd}
          currentTick={Math.round(currentTick)}
          onTickChange={onTickChange}
          isPlaying={isPlaying}
          onPlayPause={onPlayPause}
          playbackSpeed={playbackSpeed}
          onSpeedChange={onSpeedChange}
          rounds={rounds}
          roundTickRanges={roundTickRanges}
          selectedRound={selectedRound}
          onRoundSelect={onRoundSelect}
          teamTName={teamTName}
        />
      </div>
        </>
      )}
    </div>
  );
}
