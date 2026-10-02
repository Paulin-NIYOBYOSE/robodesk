"""Exhaustive checks of the pure state machine (no database needed)."""

from itertools import product

import pytest

from app.core.errors import ConflictError, PermissionDeniedError
from app.models import RequestStatus as S
from app.models import UserRole
from app.services.workflow import TRANSITIONS, allowed_transitions, check_transition

EXPECTED = {
    (S.SUBMITTED, S.IN_PROGRESS): {UserRole.OPERATOR, UserRole.ADMIN},
    (S.IN_PROGRESS, S.DELIVERED): {UserRole.OPERATOR, UserRole.ADMIN},
    (S.DELIVERED, S.ACCEPTED): {UserRole.CLIENT},
    (S.DELIVERED, S.REJECTED): {UserRole.CLIENT},
    (S.REJECTED, S.IN_PROGRESS): {UserRole.OPERATOR, UserRole.ADMIN},
}
INVALID_PAIRS = [pair for pair in product(S, S) if pair not in EXPECTED]


def test_transition_table_matches_the_brief():
    assert {pair: set(roles) for pair, roles in TRANSITIONS.items()} == EXPECTED


@pytest.mark.parametrize(("current", "target"), list(EXPECTED))
def test_valid_transitions_are_allowed_for_the_owning_roles(current, target):
    for role in UserRole:
        if role in EXPECTED[(current, target)]:
            check_transition(current, target, role)  # does not raise
        else:
            with pytest.raises(PermissionDeniedError):
                check_transition(current, target, role)


@pytest.mark.parametrize(("current", "target"), INVALID_PAIRS)
@pytest.mark.parametrize("role", list(UserRole))
def test_every_other_transition_is_rejected_for_every_role(current, target, role):
    with pytest.raises(ConflictError):
        check_transition(current, target, role)


def test_terminal_state_has_no_way_out():
    for role in UserRole:
        assert allowed_transitions(S.ACCEPTED, role) == []


def test_allowed_transitions_per_role():
    assert allowed_transitions(S.DELIVERED, UserRole.CLIENT) == [S.ACCEPTED, S.REJECTED]
    assert allowed_transitions(S.DELIVERED, UserRole.OPERATOR) == []
    assert allowed_transitions(S.REJECTED, UserRole.ADMIN) == [S.IN_PROGRESS]
    assert allowed_transitions(S.SUBMITTED, UserRole.CLIENT) == []
