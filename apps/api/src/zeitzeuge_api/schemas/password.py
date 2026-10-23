"""The password policy, restated server-side.

`apps/web/src/lib/auth/password.ts` renders this same checklist, and Cognito
enforces it a third time on the pool. Three copies is two too many in general,
but here each one is load-bearing: the UI must not submit a password it knows
will fail, the API must not depend on the UI, and Cognito must not depend on
either. The rules therefore live in one function whose ids match the
translation keys the checklist already uses.

If the pool policy is changed in Terraform, change it here in the same commit.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

MIN_LENGTH = 8
MAX_LENGTH = 256  # Cognito's own ceiling.

_RULES: tuple[tuple[str, re.Pattern[str] | None], ...] = (
    ("length", None),
    ("upper", re.compile(r"[A-ZÄÖÜ]")),
    ("lower", re.compile(r"[a-zäöüß]")),
    ("digit", re.compile(r"\d")),
    ("symbol", re.compile(r"[^\w\s]|_")),
)


@dataclass(frozen=True, slots=True)
class PasswordVerdict:
    satisfied: bool
    failed: tuple[str, ...]

    @property
    def message(self) -> str:
        return "The password is missing: " + ", ".join(self.failed) + "."


def evaluate_password(value: str) -> PasswordVerdict:
    failed: list[str] = []
    for rule_id, pattern in _RULES:
        if rule_id == "length":
            if not (MIN_LENGTH <= len(value) <= MAX_LENGTH):
                failed.append("length")
            continue
        assert pattern is not None
        if not pattern.search(value):
            failed.append(rule_id)
    return PasswordVerdict(satisfied=not failed, failed=tuple(failed))
