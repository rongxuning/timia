from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routes.files import router as files_router
from app.routes.internal import router as internal_router
from app.routes.views.file_browser import router as file_browser_router

app = FastAPI(title="Timia File Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(files_router)
app.include_router(internal_router)
app.include_router(file_browser_router)


@app.get("/health")
def health():
    return {"ok": True}
