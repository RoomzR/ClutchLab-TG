import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { Maximize2, Minus, Plus } from 'lucide-react';
import type { BombEvent, GrenadeData, HeatmapPoint, KillData, RoundData, RoundPause, TickData } from '../types/match';
import type { PreAimData } from '../utils/killReplay';
import type { MapLayerState, MapTeamFilter } from './MapLayerControls';
import { DEFAULT_MAP_LAYERS } from './MapLayerControls';
import { getMapConfig } from '../utils/mapConfig';
import { gameToRadarPixel } from '../utils/mapCoordinates';
import {
  getActiveGrenadesAtTick,
  getGrenadeOpacity,
  getGrenadeRemainingSeconds,
  formatGrenadeTimer,
  getInFlightGrenadesAtTick,
  grenadePositionAtTick,
  GRENADE_RADAR_RADIUS,
} from '../utils/grenadeReplay';
import { getGrenadeIconConfig } from '../utils/grenadeIcons';
import {
  buildPlayerTracks,
  interpolatePositionsAtTick,
  interpolateTrackAtTick,
  viewConeRadarPath,
} from '../utils/positionInterpolation';
import { getDeadPlayersAtTick, getDeathTicksInRound, type RoundTickRange } from '../utils/roundStats';
import { MapReplayHud } from './MapReplayHud';
import { GrenadeIcon } from './GrenadeIcon';
import { cn } from '../lib/cn';

export type MapMode = 'positions' | 'grenades' | 'heatmap';

interface MatchMapProps {
  mapName: string;
  mode?: MapMode;
  positions?: TickData[];
  grenades?: GrenadeData[];
  heatmapPoints?: HeatmapPoint[];
  selectedPlayers?: string[];
  currentTick?: number;
  kills?: KillData[];
  rounds?: RoundData[];
  roundTickRanges?: RoundTickRange[];
  roundPauses?: RoundPause[];
  selectedRound?: number | null;
  tickRate?: number;
  teamTName?: string;
  teamCtName?: string;
  positionsLoading?: boolean;
  positionsError?: boolean;
  teamFilter?: MapTeamFilter;
  layers?: MapLayerState;
  trajectoryPlayer?: string | null;
  highlightedKill?: KillData | null;
  highlightedGrenade?: GrenadeData | null;
  preAimData?: PreAimData | null;
  bombEvents?: BombEvent[];
  onGrenadeClick?: (grenade: GrenadeData) => void;
  className?: string;
}

const TEAM_COLORS = { CT: '#5eb6ff', T: '#ff8a3d' } as const;

const MAX_TRAJECTORY_POINTS = 120;
const WALK_SPEED_THRESHOLD = 2.5;

function playerDotScale(speedPerTick?: number): number {
  if (speedPerTick == null || speedPerTick < 0.2) return 0.85;
  if (speedPerTick < WALK_SPEED_THRESHOLD) return 0.78;
  if (speedPerTick < 3.2) return 1;
  return 1.08;
}

function subsamplePoints<T>(points: T[], maxPoints: number): T[] {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  return points.filter((_, i) => i % step === 0 || i === points.length - 1);
}

function getGrenadeRadarStyle(type: GrenadeData['grenade_type']) {
  const config = getGrenadeIconConfig(type);
  return { fill: config.radarFill, stroke: config.radarStroke };
}

function grenadeKey(g: GrenadeData): string {
  return `${g.tick}-${g.player_name}-${g.grenade_type}-${g.to_x.toFixed(0)}-${g.to_y.toFixed(0)}`;
}

function MatchMapComponent({
  mapName,
  mode = 'positions',
  positions = [],
  grenades = [],
  heatmapPoints = [],
  selectedPlayers = [],
  currentTick,
  kills = [],
  rounds = [],
  roundTickRanges = [],
  roundPauses = [],
  selectedRound = null,
  tickRate = 64,
  teamTName = 'T',
  teamCtName = 'CT',
  positionsLoading = false,
  positionsError = false,
  teamFilter = 'all',
  layers = DEFAULT_MAP_LAYERS,
  trajectoryPlayer = null,
  highlightedKill = null,
  highlightedGrenade = null,
  preAimData = null,
  bombEvents = [],
  onGrenadeClick,
  className,
}: MatchMapProps) {
  const mapConfig = getMapConfig(mapName);
  const {
    showRadar,
    showPlayers,
    showNames,
    showViewCones,
    showTrajectories,
    showUtilities,
    showUtilityLines,
    showKillLines,
    showBomb,
    smokeOnly,
  } = layers;
  const tick = currentTick ?? 0;
  const viewportRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const playerTracks = useMemo(() => buildPlayerTracks(positions), [positions]);

  const positionRoundHint = useMemo(() => {
    const rounds = new Set<number>();
    for (const pos of positions) {
      if (pos.tick > tick) continue;
      if (Number.isFinite(pos.round_number) && pos.round_number > 0) {
        rounds.add(pos.round_number);
      }
    }
    return rounds.size === 1 ? [...rounds][0] : undefined;
  }, [positions, tick]);

  const deathTicks = useMemo(
    () => getDeathTicksInRound(tick, kills, roundTickRanges, selectedRound, positionRoundHint),
    [kills, tick, roundTickRanges, selectedRound, positionRoundHint],
  );

  const deadPlayers = useMemo(
    () =>
      getDeadPlayersAtTick(tick, kills, roundTickRanges, selectedRound, positionRoundHint),
    [kills, tick, roundTickRanges, selectedRound, positionRoundHint],
  );

  const visiblePositions = useMemo(() => {
    if (mode !== 'positions') return [];
    const result = interpolatePositionsAtTick(
      playerTracks,
      tick,
      selectedPlayers.length > 0 ? selectedPlayers : undefined,
    );

    return result.map((pos) => {
      if (teamFilter !== 'all' && pos.team !== teamFilter) return null;
      const deathTick = deathTicks.get(pos.player_name);
      if (deathTick == null || tick <= deathTick) return pos;
      const track = playerTracks.get(pos.player_name);
      if (!track) return pos;
      return interpolateTrackAtTick(track, deathTick) ?? pos;
    }).filter((pos): pos is NonNullable<typeof pos> => pos !== null);
  }, [playerTracks, selectedPlayers, tick, mode, deathTicks, teamFilter]);

  const trajectories = useMemo(() => {
    if (mode !== 'positions' || !showTrajectories) return [];
    const map = new Map<string, TickData[]>();
    let filtered = positions.filter(
      (p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.tick <= tick,
    );
    if (teamFilter !== 'all') {
      filtered = filtered.filter((p) => p.team === teamFilter);
    }
    if (trajectoryPlayer) {
      filtered = filtered.filter((p) => p.player_name === trajectoryPlayer);
    } else if (selectedPlayers.length > 0) {
      filtered = filtered.filter((p) => selectedPlayers.includes(p.player_name));
    }
    for (const pos of filtered) {
      const list = map.get(pos.player_name) ?? [];
      list.push(pos);
      map.set(pos.player_name, list);
    }
    return Array.from(map.entries()).map(([name, pts]) => ({
      name,
      team: pts[0]?.team ?? 'CT',
      points: subsamplePoints(
        pts.sort((a, b) => a.tick - b.tick),
        MAX_TRAJECTORY_POINTS,
      ),
    }));
  }, [positions, selectedPlayers, tick, mode, teamFilter, showTrajectories, trajectoryPlayer]);

  const validGrenades = useMemo(() => {
    let list = grenades.filter(
      (g) =>
        Number.isFinite(g.from_x) &&
        Number.isFinite(g.from_y) &&
        Number.isFinite(g.to_x) &&
        Number.isFinite(g.to_y),
    );
    if (teamFilter !== 'all') {
      list = list.filter((g) => g.team === teamFilter);
    }
    return list;
  }, [grenades, teamFilter]);

  const activeGrenades = useMemo(() => {
    if (mode !== 'positions' || !showUtilities) return [];
    let list = getActiveGrenadesAtTick(validGrenades, tick);
    if (smokeOnly) list = list.filter((g) => g.grenade_type === 'smoke');
    if (teamFilter !== 'all') list = list.filter((g) => g.team === teamFilter);
    return list;
  }, [validGrenades, tick, mode, smokeOnly, teamFilter, showUtilities]);

  const inFlightGrenades = useMemo(() => {
    if (mode !== 'positions' || !showUtilities) return [];
    let list = getInFlightGrenadesAtTick(validGrenades, tick, tickRate);
    if (smokeOnly) list = list.filter((g) => g.grenade_type === 'smoke');
    if (teamFilter !== 'all') list = list.filter((g) => g.team === teamFilter);
    if (highlightedGrenade) {
      const key = grenadeKey(highlightedGrenade);
      if (!list.some((g) => grenadeKey(g) === key)) {
        const progress = grenadePositionAtTick(highlightedGrenade, tick, tickRate);
        if (progress.phase === 'flight') list = [...list, highlightedGrenade];
      }
    }
    return list;
  }, [validGrenades, tick, mode, smokeOnly, teamFilter, showUtilities, tickRate, highlightedGrenade]);

  const visibleKillLines = useMemo(() => {
    if (mode !== 'positions' || !showKillLines) return [];
    return kills.filter((k) => {
      if (selectedRound && selectedRound > 0 && k.round_number !== selectedRound) return false;
      return tick >= k.tick && tick <= k.tick + tickRate * 8;
    });
  }, [kills, tick, mode, showKillLines, selectedRound, tickRate]);

  const visibleBombEvents = useMemo(() => {
    if (!showBomb) return [];
    return bombEvents.filter((event) => {
      if (selectedRound && selectedRound > 0 && event.round_number !== selectedRound) {
        return false;
      }
      return tick >= event.tick && tick <= event.tick + tickRate * 50;
    });
  }, [bombEvents, tick, selectedRound, tickRate, showBomb]);

  const showPreAim =
    preAimData &&
    highlightedKill &&
    tick >= highlightedKill.tick - tickRate * 2 &&
    tick <= highlightedKill.tick + tickRate;

  const toPx = useCallback(
    (x: number, y: number) => gameToRadarPixel(x, y, mapConfig),
    [mapConfig],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setPan({
      x: dragRef.current.panX + (e.clientX - dragRef.current.x),
      y: dragRef.current.panY + (e.clientY - dragRef.current.y),
    });
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.min(4, Math.max(0.6, z - e.deltaY * 0.001)));
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-white/10 bg-[#05080d] shadow-[0_20px_80px_rgba(0,0,0,0.55)]',
        className,
      )}
    >
      {mode === 'positions' && (
        <MapReplayHud
          mapName={mapName}
          currentTick={tick}
          tickRate={tickRate}
          teamTName={teamTName}
          teamCtName={teamCtName}
          selectedRound={selectedRound}
          rounds={rounds}
          roundTickRanges={roundTickRanges}
          roundPauses={roundPauses}
          kills={kills}
          positions={positions}
        />
      )}

      <div className="absolute right-3 top-3 z-[1100] flex flex-col gap-1.5">
        <button type="button" onClick={() => setZoom((z) => Math.min(4, z + 0.2))} className="radar-control-btn">
          <Plus className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))} className="radar-control-btn">
          <Minus className="h-4 w-4" />
        </button>
        <button type="button" onClick={resetView} className="radar-control-btn">
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>

      <div
        ref={viewportRef}
        className="radar-viewport h-[min(78vh,820px)] min-h-[520px] w-full cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
      >
        <div
          className="radar-stage"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          <img
            src={mapConfig.imageUrl}
            alt={mapConfig.displayName}
            className="radar-image pointer-events-none select-none"
            draggable={false}
            style={{ opacity: showRadar ? 1 : 0.15 }}
          />

          <svg
            className="radar-svg-layer"
            viewBox={`0 0 ${mapConfig.radarSize} ${mapConfig.radarSize}`}
            preserveAspectRatio="none"
          >
            {mode === 'positions' &&
              showKillLines &&
              visibleKillLines.map((k) => {
                const killerPos = visiblePositions.find((p) => p.player_name === k.killer);
                const victimPos =
                  visiblePositions.find((p) => p.player_name === k.victim) ||
                  (() => {
                    const track = playerTracks.get(k.victim);
                    return track ? interpolateTrackAtTick(track, k.tick) : null;
                  })();
                if (!killerPos || !victimPos) return null;
                const a = toPx(killerPos.x, killerPos.y);
                const b = toPx(victimPos.x, victimPos.y);
                return (
                  <g key={`kill-line-${k.tick}-${k.killer}-${k.victim}`}>
                    <line
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke="#ef4444"
                      strokeWidth={2}
                      opacity={0.75}
                    />
                    <circle cx={b.x} cy={b.y} r={5} fill="#ef4444" stroke="#fff" strokeWidth={1} />
                  </g>
                );
              })}

            {mode === 'positions' &&
              showViewCones &&
              showPlayers &&
              visiblePositions.map((pos) => {
                const deathTick = deathTicks.get(pos.player_name);
                const isDead =
                  (deathTick != null && tick > deathTick) || deadPlayers.has(pos.player_name);
                if (isDead || !Number.isFinite(pos.yaw as number)) return null;
                const color = TEAM_COLORS[pos.team];
                const d = viewConeRadarPath(pos.x, pos.y, Number(pos.yaw), toPx);
                return (
                  <path
                    key={`cone-${pos.player_name}`}
                    d={d}
                    fill={color}
                    fillOpacity={0.22}
                    stroke={color}
                    strokeOpacity={0.55}
                    strokeWidth={1.25}
                  />
                );
              })}

            {mode === 'positions' &&
              showPlayers &&
              visiblePositions.map((pos) => {
                const deathTick = deathTicks.get(pos.player_name);
                const isDead =
                  (deathTick != null && tick > deathTick) || deadPlayers.has(pos.player_name);
                if (!isDead) return null;
                const { x, y } = toPx(pos.x, pos.y);
                const color = TEAM_COLORS[pos.team];
                const s = 9;
                return (
                  <g key={`death-${pos.player_name}`} opacity={0.95}>
                    <line
                      x1={x - s}
                      y1={y - s}
                      x2={x + s}
                      y2={y + s}
                      stroke="#05080d"
                      strokeWidth={5}
                      strokeLinecap="round"
                    />
                    <line
                      x1={x + s}
                      y1={y - s}
                      x2={x - s}
                      y2={y + s}
                      stroke="#05080d"
                      strokeWidth={5}
                      strokeLinecap="round"
                    />
                    <line
                      x1={x - s}
                      y1={y - s}
                      x2={x + s}
                      y2={y + s}
                      stroke={color}
                      strokeWidth={3}
                      strokeLinecap="round"
                    />
                    <line
                      x1={x + s}
                      y1={y - s}
                      x2={x - s}
                      y2={y + s}
                      stroke={color}
                      strokeWidth={3}
                      strokeLinecap="round"
                    />
                  </g>
                );
              })}

            {mode === 'positions' &&
              showPreAim &&
              preAimData &&
              (() => {
                const pre = toPx(preAimData.preAimPos.x, preAimData.preAimPos.y);
                const killer = toPx(preAimData.killerPos.x, preAimData.killerPos.y);
                const victim = toPx(preAimData.victimPos.x, preAimData.victimPos.y);
                const color = preAimData.isSniper ? '#fbbf24' : '#f87171';
                return (
                  <g key="pre-aim" opacity={0.9}>
                    <line
                      x1={pre.x}
                      y1={pre.y}
                      x2={victim.x}
                      y2={victim.y}
                      stroke={color}
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      opacity={0.75}
                    />
                    <line
                      x1={killer.x}
                      y1={killer.y}
                      x2={victim.x}
                      y2={victim.y}
                      stroke="#ef4444"
                      strokeWidth={2.5}
                      opacity={0.9}
                    />
                    <circle cx={pre.x} cy={pre.y} r={5} fill={color} stroke="#fff" strokeWidth={1} />
                    <circle cx={victim.x} cy={victim.y} r={6} fill="#ef4444" stroke="#fff" strokeWidth={1.5} />
                  </g>
                );
              })()}

            {mode === 'positions' &&
              visibleBombEvents.map((event, i) => {
                if (!Number.isFinite(event.x) || !Number.isFinite(event.y) || (event.x === 0 && event.y === 0)) {
                  return null;
                }
                const { x, y } = toPx(event.x, event.y);
                const planted = event.event_type === 'bomb_planted';
                return (
                  <g key={`bomb-${event.tick}-${i}`}>
                    <circle
                      cx={x}
                      cy={y}
                      r={10}
                      fill={planted ? 'rgba(249,115,22,0.35)' : 'rgba(34,211,238,0.35)'}
                      stroke={planted ? '#f97316' : '#22d3ee'}
                      strokeWidth={2}
                    />
                    <text
                      x={x}
                      y={y + 4}
                      textAnchor="middle"
                      fill="#fff"
                      fontSize={10}
                      fontWeight="bold"
                    >
                      {event.site}
                    </text>
                  </g>
                );
              })}

            {mode === 'positions' &&
              trajectories.map(({ name, team, points }) => {
                if (points.length < 2) return null;
                const d = points
                  .map((p, i) => {
                    const { x, y } = toPx(p.x, p.y);
                    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                  })
                  .join(' ');
                return (
                  <path
                    key={`path-${name}`}
                    d={d}
                    fill="none"
                    stroke={TEAM_COLORS[team]}
                    strokeWidth={2}
                    strokeOpacity={0.55}
                    strokeDasharray="4 6"
                  />
                );
              })}

            {mode === 'positions' &&
              showUtilities &&
              showUtilityLines &&
              [...activeGrenades, ...inFlightGrenades].map((g, i) => {
                const from = toPx(g.from_x, g.from_y);
                const to = toPx(g.to_x, g.to_y);
                const highlighted = highlightedGrenade && grenadeKey(highlightedGrenade) === grenadeKey(g);
                return (
                  <line
                    key={`util-line-${grenadeKey(g)}-${i}`}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={highlighted ? '#fbbf24' : '#94a3b8'}
                    strokeWidth={highlighted ? 2.5 : 1.25}
                    strokeDasharray="4 5"
                    opacity={highlighted ? 0.95 : 0.45}
                  />
                );
              })}

            {mode === 'positions' &&
              showUtilities &&
              activeGrenades.map((g, i) => {
                const { x, y } = toPx(g.to_x, g.to_y);
                const style = getGrenadeRadarStyle(g.grenade_type);
                const opacity = getGrenadeOpacity(g, tick);
                const radius = GRENADE_RADAR_RADIUS[g.grenade_type];
                return (
                  <g key={`active-g-${grenadeKey(g)}-${i}`} opacity={opacity}>
                    <circle
                      cx={x}
                      cy={y}
                      r={radius}
                      fill={style.fill}
                      stroke={style.stroke}
                      strokeWidth={g.grenade_type === 'smoke' ? 1.5 : 2}
                    />
                    {(g.grenade_type === 'he' || g.grenade_type === 'flash') && (
                      <circle cx={x} cy={y} r={radius * 0.45} fill={style.stroke} opacity={0.6} />
                    )}
                  </g>
                );
              })}

            {mode === 'positions' &&
              showUtilities &&
              inFlightGrenades.map((g, i) => {
                const pos = grenadePositionAtTick(g, tick, tickRate);
                const { x, y } = toPx(pos.x, pos.y);
                const style = getGrenadeRadarStyle(g.grenade_type);
                return (
                  <g key={`flight-g-${grenadeKey(g)}-${i}`}>
                    <circle cx={x} cy={y} r={7} fill={style.stroke} stroke="#fff" strokeWidth={1.5} opacity={0.95} />
                  </g>
                );
              })}

            {mode === 'grenades' &&
              validGrenades.map((g, i) => {
                const from = toPx(g.from_x, g.from_y);
                const to = toPx(g.to_x, g.to_y);
                const highlighted = highlightedGrenade && grenadeKey(highlightedGrenade) === grenadeKey(g);
                return (
                  <g
                    key={`grenade-${grenadeKey(g)}-${i}`}
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      onGrenadeClick?.(g);
                    }}
                  >
                    {(showUtilityLines || mode === 'grenades') && (
                      <line
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        stroke={highlighted ? '#fbbf24' : '#94a3b8'}
                        strokeWidth={highlighted ? 2.5 : 1.5}
                        strokeDasharray="5 5"
                        opacity={0.7}
                      />
                    )}
                    <circle
                      cx={to.x}
                      cy={to.y}
                      r={highlighted ? 9 : 6}
                      fill="#1e293b"
                      stroke={highlighted ? '#fbbf24' : '#cbd5e1'}
                      strokeWidth={highlighted ? 2.5 : 1.5}
                    />
                  </g>
                );
              })}

            {mode === 'heatmap' &&
              heatmapPoints.map((p, i) => {
                const { x, y } = toPx(p.x, p.y);
                const r = 8 + p.density * 24;
                return (
                  <circle
                    key={`heat-${i}`}
                    cx={x}
                    cy={y}
                    r={r}
                    fill={`rgba(6,182,212,${0.08 + p.density * 0.35})`}
                    stroke={`rgba(34,211,238,${0.15 + p.density * 0.4})`}
                    strokeWidth={1}
                  />
                );
              })}
          </svg>

          {mode === 'positions' &&
            showUtilities &&
            activeGrenades.map((g, i) => {
              const { x, y } = toPx(g.to_x, g.to_y);
              const opacity = getGrenadeOpacity(g, tick);
              const remaining = getGrenadeRemainingSeconds(g, tick, tickRate);
              return (
                <button
                  key={`active-g-icon-${grenadeKey(g)}-${i}`}
                  type="button"
                  className="radar-grenade-icon"
                  style={{
                    left: `${(x / mapConfig.radarSize) * 100}%`,
                    top: `${(y / mapConfig.radarSize) * 100}%`,
                    opacity,
                  }}
                  title={`${g.player_name} · ${g.grenade_type}${remaining != null ? ` · ${formatGrenadeTimer(remaining)} left` : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onGrenadeClick?.(g);
                  }}
                >
                  <GrenadeIcon type={g.grenade_type} size={12} withBackdrop />
                  {remaining != null && remaining > 0.15 && (
                    <span className="radar-grenade-timer">{formatGrenadeTimer(remaining)}</span>
                  )}
                </button>
              );
            })}

          {mode === 'positions' &&
            showUtilities &&
            inFlightGrenades.map((g, i) => {
              const pos = grenadePositionAtTick(g, tick, tickRate);
              const { x, y } = toPx(pos.x, pos.y);
              return (
                <button
                  key={`flight-g-icon-${grenadeKey(g)}-${i}`}
                  type="button"
                  className="radar-grenade-icon"
                  style={{
                    left: `${(x / mapConfig.radarSize) * 100}%`,
                    top: `${(y / mapConfig.radarSize) * 100}%`,
                  }}
                  title={`${g.player_name} · ${g.grenade_type} in flight`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onGrenadeClick?.(g);
                  }}
                >
                  <GrenadeIcon type={g.grenade_type} size={12} withBackdrop />
                  <span className="radar-grenade-timer radar-grenade-timer--flight">air</span>
                </button>
              );
            })}

          {mode === 'positions' &&
            showPlayers &&
            visiblePositions.map((pos) => {
              const deathTick = deathTicks.get(pos.player_name);
              const isDead =
                (deathTick != null && tick > deathTick) || deadPlayers.has(pos.player_name);
              if (isDead) return null;
              const { x, y } = toPx(pos.x, pos.y);
              const color = TEAM_COLORS[pos.team];
              const leftPct = (x / mapConfig.radarSize) * 100;
              const topPct = (y / mapConfig.radarSize) * 100;
              const dotScale = playerDotScale(pos.speedPerTick);
              return (
                <div
                  key={pos.player_name}
                  className="radar-player-token"
                  style={{
                    left: `${leftPct}%`,
                    top: `${topPct}%`,
                  }}
                  title={`${pos.player_name} · tick ${Math.floor(tick)}`}
                >
                  <div
                    className="radar-player-dot"
                    style={{
                      background: color,
                      boxShadow: `0 0 0 3px ${color}33`,
                      transform: `scale(${dotScale})`,
                    }}
                  />
                  {showNames && (
                    <span className="radar-player-label">{pos.player_name}</span>
                  )}
                </div>
              );
            })}

          {mode === 'grenades' &&
            validGrenades.map((g, i) => {
              const { x, y } = toPx(g.to_x, g.to_y);
              return (
                <button
                  key={`g-icon-${grenadeKey(g)}-${i}`}
                  type="button"
                  className="radar-grenade-icon"
                  style={{
                    left: `${(x / mapConfig.radarSize) * 100}%`,
                    top: `${(y / mapConfig.radarSize) * 100}%`,
                  }}
                  title={`${g.player_name} · ${g.grenade_type} — click to replay`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onGrenadeClick?.(g);
                  }}
                >
                  <GrenadeIcon type={g.grenade_type} size={12} withBackdrop />
                </button>
              );
            })}
        </div>
      </div>

      {mode === 'positions' && positionsLoading && (
        <div className="pointer-events-none absolute inset-0 z-[1100] flex items-center justify-center bg-black/50">
          <p className="rounded-xl border border-cyan-400/30 bg-black/80 px-4 py-2 text-sm text-cyan-300">
            Загрузка позиций...
          </p>
        </div>
      )}

      {mode === 'positions' && !positionsLoading && positionsError && (
        <div className="pointer-events-none absolute inset-0 z-[1100] flex items-center justify-center bg-black/50">
          <p className="rounded-xl border border-red-400/30 bg-black/80 px-4 py-2 text-sm text-red-300">
            Ошибка загрузки позиций
          </p>
        </div>
      )}

      {mode === 'positions' && !positionsLoading && !positionsError && positions.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-[1100] flex items-center justify-center bg-black/50">
          <p className="rounded-xl border border-white/10 bg-black/80 px-4 py-2 text-sm text-slate-300">
            Позиции не найдены. Перезагрузите демку.
          </p>
        </div>
      )}

      {mode === 'grenades' && validGrenades.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-[1100] flex items-center justify-center bg-black/50">
          <p className="rounded-xl border border-white/10 bg-black/80 px-4 py-2 text-sm text-slate-300">
            {grenades.length > 0
              ? 'Гранаты без координат. Перезагрузите демку.'
              : 'Гранаты не найдены для выбранных фильтров'}
          </p>
        </div>
      )}
    </div>
  );
}

export const MatchMap = memo(MatchMapComponent);
