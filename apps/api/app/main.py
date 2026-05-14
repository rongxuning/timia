from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.auth import router as auth_router
from app.routes.activity import router as activity_router
from app.routes.comments import router as comments_router
from app.routes.items import router as items_router
from app.routes.me import router as me_router
from app.routes.members import router as members_router
from app.routes.projects import router as projects_router
from app.routes.users import router as users_router
from app.routes.workspaces import router as workspaces_router
from app.routes.dev_db_tables import router as dev_db_tables_router


app = FastAPI(title="Timia API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:3000",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(workspaces_router)
app.include_router(members_router)
app.include_router(users_router)
app.include_router(projects_router)
app.include_router(items_router)
app.include_router(comments_router)
app.include_router(activity_router)
app.include_router(me_router)
app.include_router(dev_db_tables_router)


@app.get("/health")
def health():
    return {"ok": True}

