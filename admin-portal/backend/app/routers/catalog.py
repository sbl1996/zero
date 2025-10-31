from __future__ import annotations

from fastapi import APIRouter, Depends

from ..auth import get_api_key
from ..catalog import load_catalog_by_type
from ..schemas import CatalogItem, CatalogResponse

router = APIRouter(prefix="/api/catalog", tags=["catalog"])


@router.get("/{asset_type}", response_model=CatalogResponse)
def get_catalog(asset_type: str, _: str = Depends(get_api_key)) -> CatalogResponse:
    items = load_catalog_by_type(asset_type)
    return CatalogResponse(type=asset_type, items=[CatalogItem(id=item.id, label=item.label) for item in items])
