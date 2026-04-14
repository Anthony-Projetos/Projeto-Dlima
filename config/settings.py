from .env import env, load_dotenv


load_dotenv()

SETTINGS_ENV = env("DJANGO_SETTINGS_ENV", "dev").lower()

if SETTINGS_ENV == "prod":
    from .settings_prod import *  # noqa: F403,F401
else:
    from .settings_dev import *  # noqa: F403,F401
