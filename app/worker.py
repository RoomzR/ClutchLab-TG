"""Dedicated parse/analysis worker: `python worker.py`.

Consumes the Redis parse queue so heavy demo parsing never runs in the API process.
Also runs the retention cleanup.
"""

import asyncio
import logging
import os
import signal

from config import settings
from db.academy_schema import ensure_academy_schema
from core.academy import ensure_default_org
from postgres_repo import close_pool, init_pool
from saas_schema import ensure_saas_schema
from services.parsing.pipeline import run_parse_job
from services.parsing.queue import start_workers, stop_workers

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("worker")


async def main() -> None:
    os.makedirs(settings.upload_dir, exist_ok=True)
    pool = await init_pool()
    await ensure_saas_schema(pool)
    await ensure_academy_schema(pool)
    await ensure_default_org()

    from main import cleanup_loop

    start_workers(run_parse_job, count=settings.parse_worker_count)
    cleanup = asyncio.create_task(cleanup_loop())
    logger.info("Worker started: %s parse workers", settings.parse_worker_count)

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop.set)
        except NotImplementedError:
            pass
    await stop.wait()
    cleanup.cancel()
    await stop_workers()
    await close_pool()


if __name__ == "__main__":
    asyncio.run(main())
