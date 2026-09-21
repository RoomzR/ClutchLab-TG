# Frontend architecture

```
src/
  app/              # (future) App shell + providers
  features/         # Domain barrels — import from here in new code
    auth/
    matches/
    demo-watch/
    billing/
  shared/           # (future) generic UI / api client
  demo3d/           # 3D spectator (already modular)
    viewer/ characters/ weapons/ maps/ hud/ effects/ core/ loading/
  pages/            # Route pages (legacy flat — OK for now)
  components/       # Shared + domain UI (migrate gradually into features/)
  api/              # HTTP clients by domain
  hooks/ utils/ types/ context/ i18n/
```

New code should prefer `features/<domain>` barrels.
demo3d/ is the reference module layout.
