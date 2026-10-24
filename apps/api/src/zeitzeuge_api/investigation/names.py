"""Name rules the stages share: what is generic, what is distinctive, what is a massif.

Registers and people name the same thing differently. swissNAMES3D spells the
summits «Gross Mythen» and «Chli Mythen»; a model says «Grosser Mythen»; the
archive's own vocabulary (the brief's example) says «Mythen». And
«Alterszentrum Acherhof» is catalogued as «Acherhof». These helpers make those
equal where they should be and keep every specific name in the observation
text, so nothing is silently renamed.
"""

from __future__ import annotations

from zeitzeuge_api.investigation.tools.text import fold, tokens

GENERIC_BUILDING_WORDS = frozenset(
    {
        "alterszentrum",
        "altersheim",
        "alters",
        "pflegeheim",
        "pflegezentrum",
        "wohnheim",
        "hotel",
        "restaurant",
        "gasthaus",
        "gasthof",
        "spital",
        "kantonsspital",
        "klinik",
        "kirche",
        "pfarrkirche",
        "kapelle",
        "kloster",
        "schulhaus",
        "schule",
        "schulanlage",
        "haus",
        "zentrum",
        "wohngruppe",
        "aussenwohngruppe",
        "areal",
        "gebaeude",
        "gebäude",
        "und",
        "der",
        "die",
        "das",
        "de",
        "la",
        "le",
        "am",
        "im",
        "an",
        "bei",
    }
)
UNKNOWN_MARKERS = ("unbekannt", "unknown", "unbestimmt", "?", "oder ")

_SUMMIT_QUALIFIERS = frozenset(
    {
        "gross",
        "grosser",
        "grosse",
        "chli",
        "chlii",
        "klein",
        "kleiner",
        "kleine",
        "hinter",
        "vorder",
        "ober",
        "unter",
    }
)


def is_placeholder(name: str) -> bool:
    """«Alters- oder Pflegeheim (unbekannt)» is a description, not a name."""
    folded = fold(name)
    return any(marker in folded for marker in UNKNOWN_MARKERS) or "(" in name


def distinctive(name: str) -> str:
    """«Alterszentrum Acherhof» → «acherhof»; empty when nothing distinctive is left."""
    return " ".join(t for t in tokens(name) if t not in GENERIC_BUILDING_WORDS and len(t) > 2)


def massif(name: str) -> str | None:
    """«Gross Mythen» / «Grosser Mythen» / «Chli Mythen» → «Mythen»; None for a plain name."""
    parts = name.split()
    if len(parts) >= 2 and fold(parts[0]) in _SUMMIT_QUALIFIERS:
        return " ".join(parts[1:])
    return None


def feature_key(name: str) -> str:
    """The grouping key for See/Fluss/Berg: a summit counts towards its massif."""
    return fold(massif(name) or name)


PLACE_WORDS = frozenset(
    fold(name)
    for name in (
        # The 30 municipalities of Canton Schwyz.
        "Alpthal",
        "Altendorf",
        "Arth",
        "Einsiedeln",
        "Feusisberg",
        "Freienbach",
        "Galgenen",
        "Gersau",
        "Illgau",
        "Ingenbohl",
        "Innerthal",
        "Küssnacht",
        "Lachen",
        "Lauerz",
        "Morschach",
        "Muotathal",
        "Oberiberg",
        "Reichenburg",
        "Riemenstalden",
        "Rothenthurm",
        "Sattel",
        "Schübelbach",
        "Schwyz",
        "Steinen",
        "Steinerberg",
        "Tuggen",
        "Unteriberg",
        "Vorderthal",
        "Wangen",
        "Wollerau",
        # Villages and parts that name buildings as often as municipalities do.
        "Brunnen",
        "Seewen",
        "Ibach",
        "Rickenbach",
        "Goldau",
        "Oberarth",
        "Immensee",
        "Merlischachen",
        "Stoos",
        "Bisisthal",
        "Hoch-Ybrig",
        "Siebnen",
        "Pfäffikon",
        "Bäch",
        "Wilen",
        "Hurden",
        "Biberbrugg",
        "Brunni",
        "Euthal",
        "Studen",
        "Willerzell",
        "Trachslau",
        "Haggenegg",
        "Holzegg",
        "Rigi",
        "Mythen",
        "Sihlsee",
        "Lauerzersee",
        "Zugersee",
        "Zürichsee",
        "Vierwaldstättersee",
        "Urnersee",
    )
)
"""Names that are places, not buildings. «Spital Schwyz» has «Schwyz» as its only
non-generic word; a page about Schwyz does not name the Spital."""
