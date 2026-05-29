from .env import BASE_DIR, env, env_bool, env_int, env_list, load_dotenv


load_dotenv()


SECRET_KEY = env("DJANGO_SECRET_KEY", "django-insecure-troque-isso-em-producao")
DEBUG = env_bool("DJANGO_DEBUG", True)
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", ["127.0.0.1", "localhost"])
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS", [])

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "channels",
    "core",
    "vendas",
    "dashboard",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

LANGUAGE_CODE = "pt-br"
TIME_ZONE = env("DJANGO_TIME_ZONE", "America/Sao_Paulo")
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATICFILES_DIRS = [BASE_DIR / "static"]
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_STORAGE = "django.contrib.staticfiles.storage.ManifestStaticFilesStorage"
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": STATICFILES_STORAGE,
    },
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

LOGIN_URL = "login"
LOGIN_REDIRECT_URL = "redirecionar_usuario"
LOGOUT_REDIRECT_URL = "login"

PDV_RECEIPT_SETTINGS = {
    "store_name": env("PDV_STORE_NAME", "Dlima Store"),
    "store_address": env("PDV_STORE_ADDRESS", "AV. CONRRADI SEGUNDO"),
    "receipt_width": env_int("PDV_RECEIPT_WIDTH", 48),
    "printer_name": env("PDV_PRINTER_NAME", "PIPrinter"),
    "printer_search_terms": env_list(
        "PDV_PRINTER_SEARCH_TERMS",
        ["PIPrinter"],
    ),
    "receipt_encoding": env("PDV_RECEIPT_ENCODING", "CP860"),
    "open_cash_drawer": env_bool("PDV_OPEN_CASH_DRAWER", False),
}

PDV_LABEL_SETTINGS = {
    "printer_name": env("PDV_LABEL_PRINTER_NAME", "ELGIN L42PRO FULL"),
    "printer_search_terms": env_list(
        "PDV_LABEL_PRINTER_SEARCH_TERMS",
        ["ELGIN L42PRO FULL", "ELGIN", "L42"],
    ),
    "language": env("PDV_LABEL_LANGUAGE", "TSPL"),
}


def sqlite_database():
    return {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }


def postgres_database():
    return {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": env("POSTGRES_DB", "dlima_vendas"),
            "USER": env("POSTGRES_USER", "postgres"),
            "PASSWORD": env("POSTGRES_PASSWORD", ""),
            "HOST": env("POSTGRES_HOST", "127.0.0.1"),
            "PORT": env("POSTGRES_PORT", "5432"),
            "CONN_MAX_AGE": env_int("POSTGRES_CONN_MAX_AGE", 60),
            "OPTIONS": {},
        }
    }


if env("DATABASE_ENGINE", "sqlite").lower() == "postgres":
    DATABASES = postgres_database()
else:
    DATABASES = sqlite_database()


REDIS_HOST = env("REDIS_HOST", "127.0.0.1")
REDIS_PORT = env("REDIS_PORT", "6379")
REDIS_URL = env("REDIS_URL", f"redis://{REDIS_HOST}:{REDIS_PORT}/1")

if env_bool("USE_REDIS_CHANNEL_LAYER", False):
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {
                "hosts": [REDIS_URL],
            },
        }
    }
else:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer",
        }
    }


AUTH_PASSWORD_VALIDATORS = []

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = env_bool("USE_X_FORWARDED_HOST", True)
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_BROWSER_XSS_FILTER = True
X_FRAME_OPTIONS = "DENY"
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = False
