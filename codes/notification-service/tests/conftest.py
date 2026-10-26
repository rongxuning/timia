import os
import sys
from pathlib import Path

# The in-process scanner must stay off while TestClient starts the app lifespan.
os.environ["NOTIFICATION_DISPATCH_INTERVAL_SECONDS"] = "0"

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tests.helpers import client, db  # noqa: F401
