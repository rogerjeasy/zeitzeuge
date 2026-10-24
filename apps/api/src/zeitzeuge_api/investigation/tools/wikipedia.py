"""Wikipedia: what a candidate name *is*, and where.

When the model says «Acherhof», the article tells the adjudicator that it is a
historic house in Schwyz turned old people's home, with coordinates to check
against the point the registers gave. That is `open_web` evidence: useful for
corroboration, never enough on its own.

One request does both jobs: `list=search` gives the ranked titles with a
snippet, `generator=search` over the same query gives each page's coordinates
and canonical URL.
"""

from __future__ import annotations

from typing import Any

from zeitzeuge_api.investigation.tools.base import HttpTool, ToolHit
from zeitzeuge_api.investigation.tools.commons import WIKIMEDIA_USER_AGENT
from zeitzeuge_api.investigation.tools.geo import wgs84_to_lv95
from zeitzeuge_api.investigation.tools.text import name_match, strip_html


def api_url(lang: str) -> str:
    return f"https://{lang}.wikipedia.org/w/api.php"


class Wikipedia(HttpTool):
    USER_AGENT = WIKIMEDIA_USER_AGENT

    async def search(self, query: str, *, lang: str = "de", limit: int = 5) -> list[ToolHit]:
        params: dict[str, Any] = {
            "action": "query",
            "format": "json",
            "formatversion": "2",
            "list": "search",
            "srsearch": query,
            "srlimit": str(limit),
            "generator": "search",
            "gsrsearch": query,
            "gsrlimit": str(limit),
            "prop": "coordinates|info",
            "inprop": "url",
            "colimit": "max",
        }
        data = await self.get_json(api_url(lang), params)
        q = data.get("query", {})
        pages = {p.get("pageid"): p for p in q.get("pages", [])}
        hits: list[ToolHit] = []
        for rank, item in enumerate(q.get("search", []), start=1):
            page = pages.get(item.get("pageid"), {})
            title = str(item.get("title", ""))
            coords = page.get("coordinates") or []
            lv95 = None
            lat = lon = None
            if coords:
                lat, lon = float(coords[0]["lat"]), float(coords[0]["lon"])
                e, n = wgs84_to_lv95(lat, lon)
                lv95 = (round(e, 1), round(n, 1))
            url = str(
                page.get("canonicalurl")
                or page.get("fullurl")
                or f"https://{lang}.wikipedia.org/wiki/{title.replace(' ', '_')}"
            )
            hits.append(
                ToolHit(
                    tool="wikipedia.search",
                    label=title,
                    source=f"Wikipedia ({lang}), Artikel «{title}»",
                    source_uri=url,
                    match=name_match(title, query),
                    kind="article",
                    lv95=lv95,
                    attrs={
                        "snippet": strip_html(str(item.get("snippet", ""))),
                        "page_id": item.get("pageid"),
                        "lang": lang,
                        "rank": rank,
                        "lat": lat,
                        "lon": lon,
                        "timestamp": item.get("timestamp"),
                    },
                )
            )
        return hits
