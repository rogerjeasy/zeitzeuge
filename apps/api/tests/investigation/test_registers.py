"""The two Schwyz registers: KSI inventory sheets and name matching (no network)."""

from __future__ import annotations

from zeitzeuge_api.investigation.tools.registers import (
    alias,
    names_match,
    parse_ksi_layer,
    parse_ksi_sheet,
    street_and_number,
)

OLD_SHEET = """KANTONALES SCHUTZINVENTAR - KSI
Schwyz  -  Pfarrkirche St. Martin 01.001
Einstufung : national
Gattung : sakral
KTN : 878
EGID : 190208071
Beschreibung : "Festlichste Pfarrkirche der Schweiz". Bundesschutz seit 1963.
Kantonale Denkmalpflege 05.09.2022"""

NEW_SHEET = """Bildungsdepartement
Amt für Kultur Denkmalpflege
K A N T O N A L E S   S C H U T Z I N V E N T A R   -   K S I
Küssnacht, Remise Rigigasse 23 27.078
Objekt-Adresse: Rigigasse 23, 6403 Küssnacht
Einstufung: lokal
Datierung: um 1904
KTN  /  EGID: 1312  /  504128357"""


def test_the_older_sheet_layout() -> None:
    sheet = parse_ksi_sheet("01.001", OLD_SHEET, [])
    assert (sheet.municipality, sheet.name) == ("Schwyz", "Pfarrkirche St. Martin")
    assert sheet.egid == "190208071"
    assert sheet.classification == "national"
    assert sheet.description.startswith('"Festlichste Pfarrkirche')
    assert street_and_number(sheet) is None


def test_the_newer_sheet_layout_carries_the_address() -> None:
    sheet = parse_ksi_sheet("27.078", NEW_SHEET, [])
    assert (sheet.municipality, sheet.name) == ("Küssnacht", "Remise Rigigasse 23")
    assert sheet.egid == "504128357"
    assert sheet.dated == "um 1904"
    assert street_and_number(sheet) == ("Rigigasse", "23")


def test_a_name_that_is_an_address_yields_the_street() -> None:
    sheet = parse_ksi_sheet("01.050", "Schwyz - Haus Hauptplatz 3 (Hotel Wysses Rössli) 01.050", [])
    assert street_and_number(sheet) == ("Hauptplatz", "3")
    assert alias(sheet.name) == "Hotel Wysses Rössli"


def test_names_match_on_tokens_or_the_distinctive_core_but_not_on_generic_words() -> None:
    assert names_match("Haus Hauptplatz 3 (Hotel Wysses Rössli)", "Hotel Wysses Rössli")
    assert names_match("Kapelle Maria Hilf, Stoos", "Kapelle Maria Hilf")
    assert names_match("Haus (Acherhof)", "Alterszentrum Acherhof")
    assert not names_match("Kapelle", "Kapelle Maria Hilf")
    assert not names_match("Pfarrkirche St. Martin", "Pfarrkirche St. Jakob")
    assert not names_match("Hotel Schwyz", "Spital Schwyz")  # the shared word is a place


def test_the_wfs_layer_yields_number_point_and_sheet() -> None:
    gml = (
        "<wfs:member><gml:pos>2692359.989000 1208529.128000</gml:pos>"
        "<ms:ksi_link>&lt;a href=&#39;https://data.geo.sz.ch/public/Themen/A133a/01.001.pdf"
        "&#39; target =_blank&gt;Inventarblatt&lt;/a&gt;</ms:ksi_link></wfs:member>"
    )
    (obj,) = parse_ksi_layer(gml)
    assert obj.number == "01.001"
    assert obj.lv95 == (2692359.989, 1208529.128)
