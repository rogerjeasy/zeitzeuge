"""The password policy, which exists in three places and must agree in all of them."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from zeitzeuge_api.schemas.password import evaluate_password

WEB_POLICY = Path(__file__).resolve().parents[2] / "web" / "src" / "lib" / "auth" / "password.ts"


@pytest.mark.parametrize(
    ("password", "satisfied", "missing"),
    [
        ("Gletscher-1893!", True, ()),
        ("kurz1!A", False, ("length",)),
        ("gletscher-1893!", False, ("upper",)),
        ("GLETSCHER-1893!", False, ("lower",)),
        ("Gletscher-Tal!", False, ("digit",)),
        ("Gletscher1893", False, ("symbol",)),
        ("abcdefghijklmnopqrstuvwxyz", False, ("upper", "digit", "symbol")),
    ],
)
def test_policy(password: str, satisfied: bool, missing: tuple[str, ...]) -> None:
    verdict = evaluate_password(password)
    assert verdict.satisfied is satisfied
    assert verdict.failed == missing


def test_umlauts_count_as_letters() -> None:
    """A Swiss archivist's password is allowed to look Swiss."""
    assert evaluate_password("Ölberg-Höhe-1897!").satisfied is True
    # Ä is upper case; ß is lower case. Neither may be mistaken for a symbol.
    assert "upper" not in evaluate_password("Ärgernis-2!x").failed
    assert "lower" not in evaluate_password("STRAßE-2!X").failed


def test_rule_ids_match_the_web_checklist() -> None:
    """The ids are translation keys in the UI — drift would break the checklist."""
    if not WEB_POLICY.exists():  # pragma: no cover - running outside the monorepo
        pytest.skip("apps/web is not present")
    source = WEB_POLICY.read_text(encoding="utf-8")
    web_ids = set(re.findall(r'\{\s*id:\s*"([a-z]+)"', source))
    api_ids = {"length", "upper", "lower", "digit", "symbol"}
    assert web_ids == api_ids, json.dumps(sorted(web_ids))
