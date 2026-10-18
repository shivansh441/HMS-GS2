"""API v1 master router mounting feature subrouters."""

from fastapi import APIRouter

from app.api.v1.endpoints import auth, bookings, health, inventory, properties, spec

api_router = APIRouter()

# Mount authentication and infrastructure routers
api_router.include_router(auth.router)
api_router.include_router(bookings.router)
api_router.include_router(health.router)
api_router.include_router(inventory.router)
api_router.include_router(properties.router)
api_router.include_router(spec.router)
