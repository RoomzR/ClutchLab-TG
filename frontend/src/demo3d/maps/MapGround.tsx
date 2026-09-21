import { Sky } from '@react-three/drei';
import { Suspense } from 'react';
import type { MapConfig } from '../../utils/mapConfig';
import { MapBlockout } from './MapBlockout';
import { MapModel } from './MapModel';

interface MapGroundProps {
  mapConfig: MapConfig;
}

/** GLB (exact map) if provided, else 3D zone blockout — not a flat 2D radar. */
export function MapGround({ mapConfig }: MapGroundProps) {
  return (
    <group>
      <Sky sunPosition={[140, 60, 40]} turbidity={4.5} rayleigh={1} mieCoefficient={0.0035} />
      <Suspense fallback={<MapBlockout mapConfig={mapConfig} />}>
        <MapModel mapConfig={mapConfig} />
      </Suspense>
    </group>
  );
}
