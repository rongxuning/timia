import argparse
import uuid

from sqlalchemy import delete

from app.db.session import SessionLocal
from app.models.item import Item


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace-id", required=True)
    args = parser.parse_args()

    workspace_id = uuid.UUID(args.workspace_id)

    db = SessionLocal()
    try:
        res = db.execute(delete(Item).where(Item.workspace_id == workspace_id))
        db.commit()
        print(f"deleted_items={res.rowcount}")
    finally:
        db.close()


if __name__ == "__main__":
    main()

