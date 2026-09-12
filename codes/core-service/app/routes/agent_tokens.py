import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.deps import get_db
from app.models.user import User
from app.schemas.agent_tokens import (
    AgentTokenCreate,
    AgentTokenCreatedOut,
    AgentTokenOut,
    AgentToolCallAuditIn,
)
from app.services.agent_tokens import (
    ALL_SCOPES,
    create_agent_token,
    list_agent_tokens,
    record_tool_call_audit,
    revoke_agent_token,
    token_to_out,
)

router = APIRouter(prefix="/auth/agent-tokens", tags=["agent-tokens"])


@router.get("", response_model=list[AgentTokenOut])
def list_tokens(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = list_agent_tokens(db, user.id)
    return [token_to_out(row) for row in rows]


@router.post("", response_model=AgentTokenCreatedOut, status_code=status.HTTP_201_CREATED)
def create_token(
    payload: AgentTokenCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="name_required")
    scopes = payload.scopes
    if scopes is not None:
        if not scopes:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="scopes_empty")
        invalid = [s for s in scopes if s not in ALL_SCOPES]
        if invalid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_scopes"
            )
    row, plaintext = create_agent_token(
        db,
        user_id=user.id,
        name=name,
        scopes=scopes,
        expires_at=payload.expires_at,
    )
    out = token_to_out(row)
    return AgentTokenCreatedOut(**out.model_dump(), token=plaintext)


@router.post("/audit", status_code=status.HTTP_204_NO_CONTENT)
def audit_tool_call(
    payload: AgentToolCallAuditIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    token_id = getattr(request.state, "agent_token_id", None)
    if not token_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="pat_required")
    record_tool_call_audit(
        db,
        user_id=user.id,
        token_id=uuid.UUID(token_id),
        tool_name=payload.tool_name,
        ok=payload.ok,
        error_detail=payload.error_detail,
        latency_ms=payload.latency_ms,
        request_meta=payload.request_meta,
    )
    return None


@router.delete("/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_token(
    token_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not revoke_agent_token(db, user_id=user.id, token_id=token_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    return None
