from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.chan_api import router as chan_router
from app.api.stock_api import router as stock_router
from app.api.scan_api import router as scan_router

app = FastAPI(
    title="缠论分析API", description="基于chan.py的缠论分析后端API", version="1.0.0"
)

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境建议设置具体的前端地址
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(chan_router)
app.include_router(stock_router)
app.include_router(scan_router)


@app.get("/")
async def root():
    return {"message": "缠论分析API服务正在运行"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
