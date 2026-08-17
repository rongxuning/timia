import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.deps import get_db
from app.models.user import User
from app.schemas.plan import (
    PlanSlotOut,
    PlanSlotPut,
    PlanTemplateCreate,
    PlanTemplateOut,
    PlanTemplateUpdate,
)
from app.services.plan_api import (
    build_slot_out,
    build_template_out,
    create_plan_template,
    delete_plan_template,
    replace_slots,
    update_plan_template,
)

router = APIRouter(prefix="/plan-templates", tags=["plan-templates"])


@router.post("", response_model=PlanTemplateOut, status_code=status.HTTP_201_CREATED)
def create_template(
    payload: PlanTemplateCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    template = create_plan_template(db, user, payload)
    return build_template_out(db, template)


@router.patch("/{template_id}", response_model=PlanTemplateOut)
def patch_template(
    template_id: uuid.UUID,
    payload: PlanTemplateUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    template = update_plan_template(db, user, template_id, payload)
    return build_template_out(db, template)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(
    template_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    delete_plan_template(db, user, template_id)


@router.put("/{template_id}/slots", response_model=list[PlanSlotOut])
def put_template_slots(
    template_id: uuid.UUID,
    slots: list[PlanSlotPut],
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = replace_slots(db, user, template_id, slots)
    return [build_slot_out(row) for row in rows]
