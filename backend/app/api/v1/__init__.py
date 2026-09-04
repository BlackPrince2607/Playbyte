from fastapi import APIRouter

from app.api.v1 import admin, catalog, feed, friends, games, guest, me, moments, reports

api_router = APIRouter(prefix="/v1")
api_router.include_router(guest.router)
api_router.include_router(feed.router)
api_router.include_router(moments.router)
api_router.include_router(games.router)
api_router.include_router(me.router)
api_router.include_router(friends.router)
api_router.include_router(reports.router)
api_router.include_router(admin.router)
api_router.include_router(catalog.router)
