from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.deps import get_db
from app.models.identity import User
from app.schemas.notification import DeviceTokenIn, DeviceTokenOut
from app.services.push import register_device_token, unregister_device_token

router = APIRouter(prefix="/v1/devices", tags=["devices"])


@router.post("/apns", response_model=DeviceTokenOut)
def post_apns_token(
    payload: DeviceTokenIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = register_device_token(db, user, payload.token, payload.environment)
    return DeviceTokenOut(id=str(row.id), environment=row.environment, platform=row.platform)


@router.delete("/apns/{token}", status_code=status.HTTP_204_NO_CONTENT)
def delete_apns_token(
    token: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    unregister_device_token(db, user, token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
