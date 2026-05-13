from typing import Any
from pydantic import BaseModel


class OkResponse(BaseModel):
    ok: bool = True
    data: Any = None


class ErrorResponse(BaseModel):
    ok: bool = False
    error: str
