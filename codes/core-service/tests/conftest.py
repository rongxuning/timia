import os
import sys
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://timia:timia@127.0.0.1:5432/timia")
os.environ.setdefault("JWT_SECRET", "test_secret")


# Ensure `from app...` imports work when running tests from repo root or codes/core-service.
API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

