"""Builds public/templates/question-template.docx (the "Download Word template" file).

Run after changing the text:  python scripts/make-word-template.py
The template is also parsed by a unit test (docxTemplate.test.ts), so it always matches
what the importer understands. Standard library only: a .docx is a zip of XML files.
"""
import pathlib
import zipfile
from xml.sax.saxutils import escape

OUT = pathlib.Path(__file__).resolve().parent.parent / "public" / "templates" / "question-template.docx"

# (text, style) — style: "title", "note", "q" (question, bold), or "" (normal)
PARAGRAPHS = [
    ("Model exam questions", "title"),
    ("How to fill in this template:", "note"),
    ("Number each question (1., 2., 3.). Write the options with A. B. C. D. and add an Answer line under each question.", "note"),
    ("Options can be one per line or all on one line. Instead of Answer lines you can put an answer key at the end, for example: Answer key: 1-B, 2-C, 3-A", "note"),
    ("Type the numbers and letters yourself. Do not use Word's automatic numbering.", "note"),
    ("Pictures and equations are not imported. Add pictures to each question after importing.", "note"),
    ("Delete these notes and the examples, then type your questions.", "note"),
    ("", ""),
    ("1. Which part of the cell produces most of its energy (ATP)?", "q"),
    ("A. Nucleus", ""),
    ("B. Mitochondrion", ""),
    ("C. Ribosome", ""),
    ("D. Golgi body", ""),
    ("Answer: B", ""),
    ("", ""),
    ("2. What is the value of 3² + 4²?", "q"),
    ("A. 7      B. 12      C. 25      D. 49", ""),
    ("Answer: C", ""),
    ("", ""),
    ("3. Which city is the capital of Ethiopia?", "q"),
    ("A) Addis Ababa", ""),
    ("B) Bahir Dar", ""),
    ("C) Hawassa", ""),
    ("D) Mekelle", ""),
    ("Answer: A", ""),
]


def run(text, bold=False, size=None, color=None):
    props = ""
    if bold:
        props += "<w:b/>"
    if color:
        props += f'<w:color w:val="{color}"/>'
    if size:
        props += f'<w:sz w:val="{size}"/>'
    rpr = f"<w:rPr>{props}</w:rPr>" if props else ""
    return f'<w:r>{rpr}<w:t xml:space="preserve">{escape(text)}</w:t></w:r>'


def paragraph(text, style):
    if style == "title":
        body = run(text, bold=True, size=32, color="0B2A6F")
    elif style == "note":
        body = run(text, size=20, color="4F5B78")
    elif style == "q":
        body = run(text, bold=True)
    else:
        body = run(text) if text else ""
    return f'<w:p><w:pPr><w:spacing w:after="80"/></w:pPr>{body}</w:p>'


DOCUMENT = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
    + "".join(paragraph(t, s) for t, s in PARAGRAPHS)
    + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
    '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/>'
    "</w:sectPr></w:body></w:document>"
)

CONTENT_TYPES = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    '<Default Extension="xml" ContentType="application/xml"/>'
    '<Override PartName="/word/document.xml" '
    'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    "</Types>"
)

RELS = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" '
    'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
    'Target="word/document.xml"/>'
    "</Relationships>"
)

OUT.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    # Fixed timestamps so rebuilding without changes gives an identical file.
    for name, data in [("[Content_Types].xml", CONTENT_TYPES), ("_rels/.rels", RELS), ("word/document.xml", DOCUMENT)]:
        info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(info, data.encode("utf-8"))
print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")
