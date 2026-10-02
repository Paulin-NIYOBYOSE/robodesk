from typing import Annotated, Literal

from pydantic import StringConstraints

from app.schemas.common import InputModel, OutputModel
from app.schemas.user import UserOut


class LoginRequest(InputModel):
    # Deliberately loose (no EmailStr): any malformed input simply fails to log in,
    # and the response never reveals which part was wrong.
    email: Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, max_length=254)]
    # Upper bound stops someone making the server hash megabyte-long passwords.
    password: Annotated[str, StringConstraints(max_length=128)]


class TokenResponse(OutputModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    user: UserOut
