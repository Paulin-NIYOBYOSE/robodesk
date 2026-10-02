import threading
import time
from collections import deque
from collections.abc import Callable


class FailedLoginLimiter:
    """Sliding-window counter of failed logins per account.

    In-process on purpose: the API runs as a single process here. With several
    replicas this state would move to Redis (or the API gateway).
    """

    # Above this many tracked keys, expired entries are swept so that failures for
    # many different (e.g. random) emails cannot grow memory without bound.
    SWEEP_THRESHOLD = 10_000

    def __init__(
        self, max_failures: int, window_seconds: int, clock: Callable[[], float] = time.monotonic
    ) -> None:
        self._max_failures = max_failures
        self._window = window_seconds
        self._clock = clock
        self._failures: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def retry_after(self, key: str) -> int | None:
        """Seconds until ``key`` may try again, or ``None`` if it is not blocked."""
        with self._lock:
            failures = self._prune(key)
            if len(failures) < self._max_failures:
                return None
            return max(1, int(failures[0] + self._window - self._clock()))

    def record_failure(self, key: str) -> None:
        with self._lock:
            if len(self._failures) >= self.SWEEP_THRESHOLD:
                for tracked in list(self._failures):
                    self._prune(tracked)
            self._failures.setdefault(key, deque()).append(self._clock())

    def tracked_keys(self) -> int:
        with self._lock:
            return len(self._failures)

    def reset(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._failures.clear()

    def _prune(self, key: str) -> deque[float]:
        failures = self._failures.get(key, deque())
        cutoff = self._clock() - self._window
        while failures and failures[0] <= cutoff:
            failures.popleft()
        if not failures:
            self._failures.pop(key, None)
        return failures
