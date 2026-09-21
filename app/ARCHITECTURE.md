# Backend architecture

```
app/
  main.py                 # FastAPI app factory + match routes (extract next)
  config.py
  api/                    # HTTP routers by domain
    auth/ billing/ tournaments/ folders/ coach/ …
  core/                   # security, permissions, rate_limit
  db/                     # pool, schema
  services/               # business logic
    parsing/ storage/ notifications/ analytics/ …
  cs2parser-worker/       # Node demo parser (unchanged)
  scripts/
```

Flat `*_routes.py` names are **shims** that re-export from `api/*` so existing
`from auth_routes import …` keeps working. Prefer new paths in new code.
