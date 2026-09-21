# ClutchLab — CS2 Demo Intelligence

Полнофункциональный анализатор демо-записей Counter-Strike 2: FastAPI-бэкенд, React-фронтенд, PostgreSQL, Docker.

## Архитектура

```
├── app/           # FastAPI + cs2parser (Node) + PostgreSQL
├── frontend/      # React + TypeScript + Vite
└── docker-compose.yml
```

Парсинг демо идёт через [cs2parser](https://github.com/osztenkurden/cs2parser) (Node.js ≥22). Python-бэкенд вызывает воркер `app/cs2parser-worker/parse.mjs`.

## Быстрый старт (Docker)

```bash
docker compose up --build
```

Приложение: http://localhost  
API: http://localhost/api  
Health check бэкенда: http://localhost/api (прокси) — эндпоинт `GET /health` на порту 8000

## Локальная разработка

### Бэкенд

Нужны Python 3.12+ и Node.js 22+.

```bash
cd app
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cd cs2parser-worker && npm install && cd ..
export DATABASE_URL=postgresql://cs2:cs2@localhost:5432/cs2_analyzer
uvicorn main:app --reload --port 8000
```

### Фронтенд

```bash
cd frontend
npm install
cp .env.example .env   # VITE_API_BASE_URL=http://localhost:8000/api
npm run dev
```

## Лимиты загрузки

| Размер | Поведение |
|--------|-----------|
| > 300 МБ | Предупреждение на фронтенде, TICK_STEP=8 на бэкенде |
| > 600 МБ | Загрузка заблокирована |

## Production-оптимизации

### Бэкенд
- GZip, TrustedHost, таймауты (60с / 600с для upload)
- Semaphore(3) на параллельный парсинг
- ETag + Cache-Control для GET overview/rounds/positions
- Пул PostgreSQL (5–20), bulk copy_records_to_table
- Стриминговый парсинг cs2parser (Node worker), мониторинг RAM
- Автоочистка демок старше 7 дней (каждые 24ч)

### Фронтенд
- React.lazy + Suspense для страниц
- React.memo на MatchMap, HeatmapLayer, TrajectoryLayer
- Code splitting (vendor, charts, map, pdf)
- useDebounce для фильтров
- ErrorBoundary + улучшенные axios interceptors

## Переменные окружения

### app/.env

```env
DATABASE_URL=postgresql://cs2:cs2@db:5432/cs2_analyzer
UPLOAD_DIR=uploads
DEMO_RETENTION_DAYS=7
MAX_UPLOAD_BYTES=629145600
PARSE_SEMAPHORE_LIMIT=3
MEMORY_LIMIT_MB=2048
```

### frontend/.env

```env
VITE_API_BASE_URL=/api
```

## Сборка

```bash
# Frontend
cd frontend && npm run build

# Backend image
docker build -t cs2-analyzer-api ./app

# Full stack
docker compose build
```

## API

| Метод | Путь | Описание |
|-------|------|----------|
| POST | /api/matches/upload | Загрузка .dem |
| GET | /api/matches/{id}/status | Статус парсинга |
| GET | /api/matches/{id} | Обзор матча |
| GET | /api/matches/{id}/positions | Позиции игроков |
| GET | /api/matches/{id}/grenades | Гранаты |
| GET | /api/matches/{id}/kills | Убийства |
| GET | /api/matches/{id}/rounds | Раунды |
| GET | /api/matches/{id}/heatmap/{player} | Heatmap |
| GET | /api/matches/{id}/players/{name}/* | Статистика игрока |

## Карты

Поддерживаются: de_dust2, de_mirage, de_inferno, de_nuke, de_ancient, de_anubis, de_overpass, de_cache.

Радары карт: `frontend/public/maps/*.png`

Архивы карт и моделей (`02-models.zip`, `03`–`06b`) лежат рядом на диске и в git не входят: они больше лимита GitHub на один файл.
