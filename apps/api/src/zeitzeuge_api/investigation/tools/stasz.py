"""The Staatsarchiv Schwyz online catalogue (scopeArchiv Query), minus the answer key.

The catalogue's search pages are ASP.NET postback forms, but scopeArchiv also
publishes an OpenSearch endpoint (`/OpenSearch/?q=…&format=rss`, advertised by
`OpenSearch/default.aspx`): a plain GET returning RSS, 25 items a page, each
with the detail URL, the level (Dokument, Dossier, …) and a description that
starts with the signature. That is what this client reads. «Thema» is not in
the feed, so the detail page of each kept hit is fetched (sequentially, cached)
and its attribute table parsed.

**The answer key never leaves this module.** The 600 test photos are the series
SG.CIV.17; their own catalogue entries — and those of their neighbours from the
same shoot — would hand the pipeline the expected answer. Every hit whose
signature is `SG.CIV.17` or `SG.CIV.17.*` is dropped *before* its detail page
is fetched or a `ToolHit` exists. All other SG.CIV series are fair reference
material, which is what the brief asks for (design note, «answer key excluded»).
"""

from __future__ import annotations

import html
import re
import xml.etree.ElementTree as ET
from dataclasses import replace
from html.parser import HTMLParser
from typing import Any

from zeitzeuge_api.investigation.tools.base import HttpTool, MatchKind, ToolHit, ToolUnavailable
from zeitzeuge_api.investigation.tools.text import contains_all_tokens, strip_html

BASE_URL = "https://query.staatsarchiv.sz.ch"
OPENSEARCH_URL = f"{BASE_URL}/OpenSearch/"
SOURCE = "Staatsarchiv Schwyz, Online-Archivkatalog (scopeArchiv)"
PAGE_SIZE = 25
MAX_PAGES = 4

EXCLUDED_SERIES = "SG.CIV.17"
# «SG.CIV.12.1649   Haus Grundstrasse 32 (Acherhof), Schwyz, 1939 (Dokument)»
_SIGNATURE = re.compile(r"^\s*(?P<sig>[A-Z][A-Za-z]*(?:\.[\w-]+)+)\s+(?P<rest>.*)$", re.S)
_ID = re.compile(r"[?&]ID=(\d+)")


def is_answer_key(signature: str) -> bool:
    """True for the test series itself: `SG.CIV.17` and everything below it."""
    sig = signature.strip()
    return sig == EXCLUDED_SERIES or sig.startswith(EXCLUDED_SERIES + ".")


def _clean_url(url: str) -> str:
    """The feed writes `https://host//detail.aspx`; collapse the double slash."""
    return re.sub(r"(?<!:)//+", "/", url.strip())


class _DetailParser(HTMLParser):
    """Collects `label: value` pairs from scopeArchiv's `veXDetailAttribute*` cells."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.fields: dict[str, str] = {}
        self._cell: str | None = None
        self._text: list[str] = []
        self._label: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "td":
            return
        classes = (dict(attrs).get("class") or "").split()
        if "veXDetailAttributLabel" in classes:
            self._cell, self._text = "label", []
        elif "veXDetailAttributValue" in classes:
            self._cell, self._text = "value", []

    def handle_endtag(self, tag: str) -> None:
        if tag != "td" or self._cell is None:
            return
        text = re.sub(r"\s+", " ", "".join(self._text)).strip()
        if self._cell == "label":
            self._label = text.rstrip(":").strip()
        elif self._label:
            self.fields.setdefault(self._label, text)
            self._label = None
        self._cell = None

    def handle_data(self, data: str) -> None:
        if self._cell is not None:
            self._text.append(data)


def parse_detail(html: str) -> dict[str, str]:
    parser = _DetailParser()
    parser.feed(html)
    return parser.fields


def parse_feed(xml_text: str) -> tuple[int | None, list[dict[str, Any]]]:
    """(totalResults, items) from one OpenSearch RSS page."""
    try:
        # The feed comes from one fixed public host; ElementTree never resolves
        # external entities and the bundled expat rejects entity-expansion bombs.
        root = ET.fromstring(xml_text)  # noqa: S314
    except ET.ParseError as exc:
        raise ToolUnavailable(f"Staatsarchiv OpenSearch feed unreadable: {exc}") from exc
    channel = root.find("channel")
    if channel is None:
        return None, []
    total: int | None = None
    for child in channel:
        if child.tag.endswith("}totalResults") and child.text:
            total = int(child.text)
    items: list[dict[str, Any]] = []
    for item in channel.findall("item"):
        # Not strip_html: it would collapse the spaces that separate the signature.
        description = html.unescape(item.findtext("description") or "").strip()
        m = _SIGNATURE.match(description)
        enclosure = item.find("enclosure")
        link = _clean_url(item.findtext("link") or "")
        id_match = _ID.search(link)
        items.append(
            {
                "signature": m["sig"] if m else "",
                "summary": re.sub(r"\s+", " ", m["rest"]).strip() if m else description,
                "titel": strip_html(item.findtext("title") or ""),
                "stufe": (item.findtext("category") or "").strip(),
                "url": link,
                "ve_id": id_match.group(1) if id_match else None,
                "thumbnail": _clean_url(enclosure.get("url", ""))
                if enclosure is not None
                else None,
            }
        )
    return total, items


class StaatsarchivCatalogue(HttpTool):
    """Full-text search over the Staatsarchiv Schwyz catalogue, SG.CIV.17 excluded."""

    async def search(self, text: str, *, limit: int = 10, details: bool = True) -> list[ToolHit]:
        """Up to `limit` catalogue entries for `text`, in the catalogue's ranking.

        `details=True` fetches each kept entry's detail page for «Thema» and the
        other attributes (one request per hit, cached).
        """
        kept: list[dict[str, Any]] = []
        excluded = 0
        for page in range(MAX_PAGES):
            params = {"q": text, "format": "rss"}
            if page:
                params["si"] = str(page * PAGE_SIZE + 1)
            total, items = parse_feed(await self.get_text(OPENSEARCH_URL, params))
            for item in items:
                # Fail closed: an entry whose signature cannot be read cannot be
                # shown not to belong to the answer key, so it is withheld too.
                if not item["signature"] or is_answer_key(item["signature"]):
                    excluded += 1
                    continue
                kept.append(item)
            seen = (page + 1) * PAGE_SIZE
            if len(kept) >= limit or not items or (total is not None and seen >= total):
                break

        hits: list[ToolHit] = []
        for item in kept[:limit]:
            fields: dict[str, str] = {}
            if details and item["url"]:
                fields = parse_detail(await self.get_text(item["url"]))
            signature = fields.get("Signatur") or item["signature"]
            if is_answer_key(signature):  # the detail page disagreed with the feed
                excluded += 1
                continue
            titel = fields.get("Titel") or item["titel"]
            haystack = " ".join([titel, fields.get("Thema", "")])
            hits.append(
                ToolHit(
                    tool="stasz.search",
                    label=titel,
                    source=f"{SOURCE}, {signature}",
                    source_uri=item["url"],
                    match=MatchKind.NORMALISED
                    if contains_all_tokens(haystack, text)
                    else MatchKind.FUZZY,
                    kind="catalogue_entry",
                    attrs={
                        "signature": signature,
                        "titel": titel,
                        "thema": fields.get("Thema"),
                        "stufe": fields.get("Stufe") or item["stufe"],
                        "date": fields.get("Entstehungszeitraum"),
                        "archivalienart": fields.get("Archivalienart"),
                        "author": fields.get("Autor/Fotograf/Künstler"),
                        "summary": item["summary"],
                        "ve_id": item["ve_id"],
                        "thumbnail": item["thumbnail"],
                    },
                )
            )
        # Say how many answer-key entries were withheld, so the ledger can show it.
        return [replace(h, attrs=h.attrs | {"excluded_answer_key_hits": excluded}) for h in hits]
