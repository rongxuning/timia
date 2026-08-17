import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.deps import get_db
from app.models.user import User
from app.schemas.plan import (
    PlanApplyRequest,
    PlanApplyRunOut,
    PlanConfirmRunOut,
    PlanSlotOut,
    PlanSlotPut,
    PlanSubscribeOut,
    PlanSubscribeRequest,
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
from app.services.plan_apply import (
    apply_one_shot,
    build_apply_run_out,
    cancel_subscription,
    confirm_apply_run,
    skip_apply_run,
    subscribe_plan,
)

router = APIRouter(prefix="/plan-templates", tags=["plan-templates"])
subscription_router = APIRouter(prefix="/plan-subscriptions", tags=["plan-subscriptions"])
apply_run_router = APIRouter(prefix="/plan-apply-runs", tags=["plan-apply-runs"])


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


@router.post(
    "/{template_id}/apply",
    response_model=PlanApplyRunOut,
    status_code=status.HTTP_201_CREATED,
)
def apply_template(
    template_id: uuid.UUID,
    payload: PlanApplyRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    run = apply_one_shot(
        db,
        user,
        template_id,
        payload.workspace_id,
        payload.project_id,
        payload.period_start,
    )
    return build_apply_run_out(db, run)


@router.post(
    "/{template_id}/subscribe",
    response_model=PlanSubscribeOut,
    status_code=status.HTTP_201_CREATED,
)
def subscribe_template(
    template_id: uuid.UUID,
    payload: PlanSubscribeRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return subscribe_plan(
        db,
        user,
        template_id,
        payload.workspace_id,
        payload.project_id,
        payload.timezone,
    )


@subscription_router.post("/{subscription_id}/cancel", status_code=status.HTTP_204_NO_CONTENT)
def cancel_plan_subscription(
    subscription_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    cancel_subscription(db, user, subscription_id)


@apply_run_router.post("/{run_id}/confirm", response_model=PlanConfirmRunOut)
def confirm_plan_apply_run(
    run_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    run, template_updated = confirm_apply_run(db, user, run_id)
    base = build_apply_run_out(db, run)
    return PlanConfirmRunOut(**base.model_dump(), template_updated=template_updated)


@apply_run_router.post("/{run_id}/skip", response_model=PlanApplyRunOut)
def skip_plan_apply_run(
    run_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    run = skip_apply_run(db, user, run_id)
    return build_apply_run_out(db, run)
