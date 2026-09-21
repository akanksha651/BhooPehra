from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.district import District


router = APIRouter(
    prefix="/api/districts",
    tags=["Districts"],
)


@router.get("")
def get_districts(
    db: Session = Depends(get_db),
):
    districts = db.scalars(
        select(District).order_by(District.id)
    ).all()

    return [
        {
            "id": district.id,
            "name": district.name,
            "state": district.state,
            "code": district.code,
        }
        for district in districts
    ]