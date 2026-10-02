from app.core.security import create_access_token
from app.models import User

TEST_PASSWORD = "correct-horse-battery"


def auth(user: User) -> dict[str, str]:
    """Authorization header for ``user`` (skips the deliberately slow login)."""
    token, _ = create_access_token(user.id)
    return {"Authorization": f"Bearer {token}"}
