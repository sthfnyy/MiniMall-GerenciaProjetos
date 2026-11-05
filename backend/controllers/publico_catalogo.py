from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config.database import get_db
from ..models import Categoria
from ..schemas import CategoriaOut

router = APIRouter(prefix="/publico", tags=["Vitrine pública"])


@router.get("/categorias", response_model=list[CategoriaOut])
async def listar_categorias(db: AsyncSession = Depends(get_db)):
    resultado = await db.execute(select(Categoria).order_by(Categoria.nome))
    return resultado.scalars().all()
