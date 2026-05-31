from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.user import User


def main():
    db = SessionLocal()
    try:
        existing = db.scalar(select(User).where(User.email == "admin@timia.com"))
        if existing:
            return
        u = User(
            email="admin@timia.com",
            password_hash=hash_password("admin1234"),
            display_name="Admin",
            status="active",
        )
        db.add(u)
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()

