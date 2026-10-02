"""Domain errors raised by the service layer.

Services stay HTTP-agnostic: they raise these, and a single exception handler in
``app.main`` turns them into ``{"detail": "..."}`` responses with the right status.
"""


class DomainError(Exception):
    status_code = 400

    def __init__(self, message: str, headers: dict[str, str] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.headers = headers


class AuthenticationError(DomainError):
    status_code = 401


class PermissionDeniedError(DomainError):
    status_code = 403


class NotFoundError(DomainError):
    status_code = 404


class ConflictError(DomainError):
    """The action is valid in general but conflicts with the current state."""

    status_code = 409


class PayloadTooLargeError(DomainError):
    status_code = 413


class InvalidInputError(DomainError):
    status_code = 422


class RateLimitedError(DomainError):
    status_code = 429
