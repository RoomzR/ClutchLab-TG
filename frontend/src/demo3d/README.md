# demo3d — CS2 spectator (Demo24-style)

```
demo3d/
  index.ts          # public API (Demo3DViewer)
  viewer/           # Canvas shell, scene, camera
  characters/       # Operators, skinned players, hand weapons
  weapons/          # GLB weapons, POV viewmodel (donk offsets), grip
  maps/             # Map GLB, blockout, align, collision
  hud/              # Crosshair, spectator HUD, minimap, loading screen
  effects/          # Grenades, kill tracers, bomb
  core/             # coords, GLB probe, Valve materials
  loading/          # Asset warm-up before Canvas mounts
```

Assets (volume-mounted):

- `/models/weapons/*.glb` — CS2 meshes
- `/models/viewmodels/{arms,glove_ct,glove_t}.glb` — FP arms
- `/models/players/{ct,t}.glb` — third-person
- `/maps/3d/{map}.glb` + PNG sidecars

POV uses donk viewmodel: `fov 68`, `offset_x 2.5`, `offset_z -1.5`.
