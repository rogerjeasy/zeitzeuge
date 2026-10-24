"""Name folding shared by every client, so «equal after normalising» means one thing.

`MatchKind.NORMALISED` promises "equal after case, accents, hyphens and
«St./Sankt»-style folding". If each client folded names its own way, the same
pair of strings could be NORMALISED from swisstopo and FUZZY from OSM, and the
confidence rule would be scoring the clients' quirks instead of the evidence.
"""

from __future__ import annotations

import html
import re
import unicodedata

from zeitzeuge_api.investigation.tools.base import MatchKind

_TAG = re.compile(r"<[^>]+>")
_SPACE = re.compile(r"\s+")
_SANKT = re.compile(r"\bst\.\s*")
_TOKEN = re.compile(r"[^\W_]+")


def strip_html(value: str) -> str:
    """Drop tags, decode entities, collapse whitespace."""
    return _SPACE.sub(" ", html.unescape(_TAG.sub(" ", value))).strip()


def fold(value: str) -> str:
    """Lower-case, accent-free, hyphen-free, «St.» → «sankt»."""
    decomposed = unicodedata.normalize("NFKD", value.casefold())
    plain = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    plain = _SANKT.sub("sankt ", plain)
    plain = re.sub(r"[-\u2010-\u2015_/,.'\u2019()]", " ", plain)
    return _SPACE.sub(" ", plain).strip()


def tokens(value: str) -> list[str]:
    return _TOKEN.findall(fold(value))


def name_match(found: str, query: str) -> MatchKind:
    """EXACT if identical, NORMALISED if equal after folding, else FUZZY."""
    if found.strip() == query.strip():
        return MatchKind.EXACT
    if fold(found) == fold(query):
        return MatchKind.NORMALISED
    return MatchKind.FUZZY


def contains_all_tokens(haystack: str, query: str) -> bool:
    """True if every token of `query` occurs as a token of `haystack` (folded)."""
    wanted = tokens(query)
    have = set(tokens(haystack))
    return bool(wanted) and all(t in have for t in wanted)
