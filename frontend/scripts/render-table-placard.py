"""Render a private A6 table placard from one JSON object on stdin.

Requires reportlab. The signed URL is only accepted through stdin so it does
not appear in process arguments or shell history.
"""

import json
import os
import sys
import uuid
from pathlib import Path

from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing, Group, Rect, String
from reportlab.graphics import renderPDF, renderSVG
from reportlab.lib.colors import HexColor
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont


def main():
    os.umask(0o077)
    data = json.load(sys.stdin)
    output = Path(data["output"])
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    output.chmod(0o700)
    if not data["url"].startswith("https://"):
        raise ValueError("Table placards require an HTTPS URL")
    for text in (data["restaurant"], data["label"], data["code"]):
        if not isinstance(text, str) or not text.strip() or len(text) > 100:
            raise ValueError("Invalid placard label")

    font_file = os.environ.get("PLACARD_FONT_TTF", "/System/Library/Fonts/Supplemental/AppleGothic.ttf")
    font = "Helvetica-Bold"
    if Path(font_file).is_file():
        pdfmetrics.registerFont(TTFont("PlacardUnicode", font_file))
        font = "PlacardUnicode"
    elif any(ord(char) > 127 for char in data["restaurant"] + data["label"]):
        raise ValueError("Set PLACARD_FONT_TTF to a Unicode TrueType font")

    page_width, page_height = 105 * mm, 148 * mm
    canvas = Drawing(page_width, page_height)
    canvas.add(Rect(0, 0, page_width, page_height, fillColor=HexColor("#ffffff"), strokeColor=None))
    canvas.add(String(page_width / 2, 132 * mm, data["restaurant"], textAnchor="middle",
                      fontName=font, fontSize=17, fillColor=HexColor("#242424")))
    table_title = data["label"] if data["label"].casefold().startswith("table ") else f'TABLE {data["label"]}'
    canvas.add(String(page_width / 2, 117 * mm, table_title, textAnchor="middle",
                      fontName=font, fontSize=20, fillColor=HexColor("#a53c21")))
    canvas.add(String(page_width / 2, 108 * mm, "SCAN TO ORDER", textAnchor="middle",
                      fontName=font, fontSize=10, fillColor=HexColor("#4b4b4b")))
    widget = qr.QrCodeWidget(data["url"], barLevel="H")
    x0, y0, x1, y1 = widget.getBounds()
    size = 72 * mm
    qr_group = Group()
    qr_group.add(widget)
    scale = size / max(x1 - x0, y1 - y0)
    qr_group.transform = (scale, 0, 0, scale, (page_width - size) / 2 - x0 * scale, 25 * mm - y0 * scale)
    canvas.add(qr_group)
    canvas.add(String(page_width / 2, 14 * mm, "ORDER AT THIS TABLE", textAnchor="middle",
                      fontName=font, fontSize=10, fillColor=HexColor("#4b4b4b")))

    svg = output / "placard.svg"
    pdf = output / "placard.pdf"
    nonce = uuid.uuid4().hex
    temporary_svg = output / f".placard-{nonce}.svg"
    temporary_pdf = output / f".placard-{nonce}.pdf"
    try:
        renderSVG.drawToFile(canvas, str(temporary_svg))
        renderPDF.drawToFile(canvas, str(temporary_pdf))
        with temporary_pdf.open("rb") as pdf_stream:
            header = pdf_stream.read(5)
        if temporary_pdf.stat().st_size < 100 or header != b"%PDF-":
            raise ValueError("Placard PDF render failed")
        if temporary_svg.stat().st_size < 100:
            raise ValueError("Placard SVG render failed")
        os.chmod(temporary_svg, 0o600)
        os.chmod(temporary_pdf, 0o600)
        os.replace(temporary_svg, svg)
        os.replace(temporary_pdf, pdf)
    finally:
        temporary_svg.unlink(missing_ok=True)
        temporary_pdf.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
