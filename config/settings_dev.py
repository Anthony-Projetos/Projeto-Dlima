from .settings_base import *  # noqa: F403,F401
from .env import env_bool


DEBUG = env_bool("DJANGO_DEBUG", True)
ALLOWED_HOSTS = [
    "dlimastore.com.br",
    "www.dlimastore.com.br",
    "161.35.127.2",
    "127.0.0.1",
    "localhost",
]
