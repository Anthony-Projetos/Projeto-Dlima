import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent


def load_dotenv(env_path=None):
    env_file = Path(env_path or BASE_DIR / ".env")
    if not env_file.exists():
        return

    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def env(key, default=None):
    return os.environ.get(key, default)


def env_bool(key, default=False):
    value = env(key)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "t", "yes", "on"}


def env_list(key, default=None, separator=","):
    value = env(key)
    if value is None:
        return list(default or [])
    return [item.strip() for item in value.split(separator) if item.strip()]


def env_int(key, default=0):
    value = env(key)
    if value is None:
        return default
    return int(value)
