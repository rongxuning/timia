from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.user import SYSTEM_ROLE_ADMIN, User

ADMIN_EMAIL = "admin@gmail.com"
ADMIN_PASSWORD = "admin1234"
ADMIN_DISPLAY_NAME = "Admin"


def main():
    db = SessionLocal()
    try:
        existing = db.scalar(select(User).where(User.email == ADMIN_EMAIL))
        if existing:
            if existing.system_role != SYSTEM_ROLE_ADMIN:
                existing.system_role = SYSTEM_ROLE_ADMIN
                db.commit()
            return
        u = User(
            email=ADMIN_EMAIL,
            password_hash=hash_password(ADMIN_PASSWORD),
            display_name=ADMIN_DISPLAY_NAME,
            status="active",
            system_role=SYSTEM_ROLE_ADMIN,
        )
        db.add(u)
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
