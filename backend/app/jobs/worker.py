from celery import Celery

from app.core.config import get_settings

settings = get_settings()
celery_app = Celery("biosentinel", broker=settings.redis_url, backend=settings.redis_url)


@celery_app.task(name="biosentinel.health")
def health_check() -> str:
    return "ok"
