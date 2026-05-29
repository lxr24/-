from fastapi import APIRouter

from .group import router as group_router
from .listing import router as listing_router
from .management import router as management_router

router = APIRouter(prefix="/conversations", tags=["conversations"])
router.include_router(listing_router)
router.include_router(group_router)
router.include_router(management_router)
