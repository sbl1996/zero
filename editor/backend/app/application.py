from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes import monsters_router, maps_router, music_router, equipment_router


def create_app() -> FastAPI:
    app = FastAPI(title="Game Editor Backend", version="0.1.0")
    
    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:5175"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    app.include_router(monsters_router)
    app.include_router(maps_router)
    app.include_router(music_router)
    app.include_router(equipment_router)
    return app


app = create_app()
