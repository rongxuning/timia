import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("JWT_SECRET", "test_secret_change_me")
os.environ.setdefault("USER_INTERNAL_TOKEN", "test_user_internal")
os.environ.setdefault("CORE_SERVICE_BASE", "http://core.test")
os.environ.setdefault("OAUTH_DEV_MODE", "false")
os.environ.setdefault("WECHAT_WEB_APP_ID", "")
os.environ.setdefault("WECHAT_WEB_APP_SECRET", "")
os.environ.setdefault("WECHAT_WEB_REDIRECT_URI", "")

from tests.helpers import client, db  # noqa: F401
