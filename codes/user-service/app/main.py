from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routes.auth_proxy import router as auth_proxy_router
from app.routes.internal import router as internal_router
from app.routes.wechat_web import router as wechat_web_router

app = FastAPI(title="Timia User Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static WeChat routes before the /auth/{path} proxy.
app.include_router(wechat_web_router)
app.include_router(auth_proxy_router)
app.include_router(internal_router)


@app.get("/health")
def health():
    return {"ok": True}
