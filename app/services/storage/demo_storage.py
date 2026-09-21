import logging
from pathlib import Path
from typing import Iterable

import boto3
from botocore.config import Config as BotoConfig

from config import settings

logger = logging.getLogger(__name__)


def is_s3_enabled() -> bool:
    return bool(settings.s3_enabled and settings.s3_bucket)


def demo_object_key(match_id: str) -> str:
    prefix = (settings.s3_prefix or "").strip("/")
    filename = f"{match_id}.dem"
    return f"{prefix}/{filename}" if prefix else filename


def _make_s3_client():
    extra_kwargs: dict[str, str] = {}
    if settings.s3_access_key_id and settings.s3_secret_access_key:
        extra_kwargs["aws_access_key_id"] = settings.s3_access_key_id
        extra_kwargs["aws_secret_access_key"] = settings.s3_secret_access_key

    boto_cfg = None
    if settings.s3_endpoint_url:
        s3_addressing = "path" if settings.s3_force_path_style else "auto"
        boto_cfg = BotoConfig(s3={"addressing_style": s3_addressing})

    client = boto3.client(
        "s3",
        region_name=settings.s3_region,
        endpoint_url=settings.s3_endpoint_url or None,
        config=boto_cfg,
        **extra_kwargs,
    )
    return client


def upload_demo_file(local_path: str, match_id: str) -> None:
    if not is_s3_enabled():
        return
    client = _make_s3_client()
    key = demo_object_key(match_id)
    client.upload_file(local_path, settings.s3_bucket, key)
    logger.info("Uploaded demo to S3: %s", key)


def download_demo_file(match_id: str, local_path: str) -> None:
    if not is_s3_enabled():
        return
    client = _make_s3_client()
    key = demo_object_key(match_id)
    Path(local_path).parent.mkdir(parents=True, exist_ok=True)
    client.download_file(settings.s3_bucket, key, local_path)
    logger.info("Downloaded demo from S3: %s", key)


def delete_demo_files(match_ids: Iterable[str]) -> int:
    if not is_s3_enabled():
        return 0
    match_ids_list = list(match_ids)
    if not match_ids_list:
        return 0
    client = _make_s3_client()
    deleted_total = 0
    for i in range(0, len(match_ids_list), 1000):
        objects = [{"Key": demo_object_key(mid)} for mid in match_ids_list[i : i + 1000]]
        resp = client.delete_objects(
            Bucket=settings.s3_bucket,
            Delete={"Objects": objects, "Quiet": True},
        )
        deleted_total += len(resp.get("Deleted", []) or [])
        if resp.get("Errors"):
            logger.warning("S3 delete errors: %s", resp["Errors"])
    return deleted_total

