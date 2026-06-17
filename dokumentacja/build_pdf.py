#!/usr/bin/env python3
"""
build_pdf.py — renderuje dokumentacja.md do PDF (razem ze zdjeciami).

Jak to dziala:
  1. Skrypt sam tworzy wirtualne srodowisko (.venv) obok siebie i instaluje
     tam biblioteki 'markdown' + 'weasyprint' (zeby nie ruszac systemowego
     Pythona). Robi to tylko raz.
  2. Zamienia Markdown -> HTML (z tabelami, blokami kodu, naglowkami).
  3. Dokleja arkusz stylow (CSS) z rozsadnym wygladem dokumentu.
  4. WeasyPrint renderuje HTML -> PDF. Sciezki do obrazkow sa wzgledne
     do pliku .md, wiec zdjecia z folderu dokumentacja/ wskakuja same.

Uzycie:
  python3 build_pdf.py                      # bierze ./dokumentacja.md
  python3 build_pdf.py inny_plik.md         # wlasny plik wejsciowy
  python3 build_pdf.py wejscie.md wynik.pdf # wlasne wejscie i wyjscie

Wymaga dzialajacego internetu przy pierwszym uruchomieniu (instalacja paczek)
oraz systemowych bibliotek pango/cairo (na Ubuntu zwykle juz sa).
"""

import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
VENV_DIR = HERE / ".venv"
REQUIREMENTS = ["markdown==3.7", "weasyprint==62.3", "pydyf==0.10.0",
                "pygments==2.18.0"]


def venv_python() -> Path:
    """Zwraca sciezke do interpretera Pythona wewnatrz naszego venv."""
    if os.name == "nt":
        return VENV_DIR / "Scripts" / "python.exe"
    return VENV_DIR / "bin" / "python"


def ensure_venv() -> None:
    """Tworzy venv i instaluje zaleznosci, jesli jeszcze ich nie ma."""
    py = venv_python()
    if not py.exists():
        print("[1/4] Tworze wirtualne srodowisko (.venv)…")
        import venv
        venv.EnvBuilder(with_pip=True).create(VENV_DIR)

    # Sprawdzamy, czy biblioteki sa juz zainstalowane.
    check = subprocess.run(
        [str(py), "-c", "import markdown, weasyprint"],
        capture_output=True,
    )
    if check.returncode != 0:
        print("[2/4] Instaluje biblioteki (markdown, weasyprint)…")
        subprocess.run([str(py), "-m", "pip", "install", "--quiet",
                        "--upgrade", "pip"], check=True)
        subprocess.run([str(py), "-m", "pip", "install", "--quiet",
                        *REQUIREMENTS], check=True)
    else:
        print("[2/4] Biblioteki juz zainstalowane — pomijam.")


# ---------------------------------------------------------------------------
# Ponizsza czesc uruchamia sie JUZ WEWNATRZ venv (po przelaczeniu interpretera)
# ---------------------------------------------------------------------------

CSS = """
@page {
    size: A4;
    margin: 2cm 2.2cm;
    @bottom-center {
        content: counter(page) " / " counter(pages);
        font-size: 9pt;
        color: #888;
    }
}
body {
    font-family: "DejaVu Sans", "Liberation Sans", Arial, sans-serif;
    font-size: 10.5pt;
    line-height: 1.5;
    color: #1a1a1a;
}
h1 { font-size: 20pt; color: #0d2440; border-bottom: 2px solid #0d2440;
     padding-bottom: 6px; margin-top: 0; }
h2 { font-size: 15pt; color: #0d2440; margin-top: 22px;
     border-bottom: 1px solid #c9d3e0; padding-bottom: 3px; }
h3 { font-size: 12.5pt; color: #234; margin-top: 16px; }
p { margin: 6px 0; }
a { color: #1558b0; text-decoration: none; }
strong { color: #0d2440; }

/* bloki kodu */
pre {
    background: #f4f6fa;
    border: 1px solid #d7deea;
    border-radius: 5px;
    padding: 10px 12px;
    font-family: "DejaVu Sans Mono", "Liberation Mono", monospace;
    font-size: 8.7pt;
    line-height: 1.4;
    white-space: pre-wrap;
    word-wrap: break-word;
    page-break-inside: avoid;
}
code {
    font-family: "DejaVu Sans Mono", "Liberation Mono", monospace;
    font-size: 9pt;
    background: #eef1f6;
    padding: 1px 4px;
    border-radius: 3px;
}
pre code { background: none; padding: 0; }

/* tabele */
table {
    border-collapse: collapse;
    width: 100%;
    margin: 12px 0;
    font-size: 9.5pt;
    page-break-inside: avoid;
}
th, td { border: 1px solid #c9d3e0; padding: 6px 9px; text-align: left;
         vertical-align: top; }
th { background: #0d2440; color: #fff; }
tr:nth-child(even) td { background: #f4f6fa; }

/* obrazki */
img {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 10px auto;
    border: 1px solid #d7deea;
    border-radius: 4px;
}

/* podpisy pod obrazkami (kursywa) i drobne notki */
em { color: #555; }

blockquote {
    border-left: 4px solid #c9d3e0;
    margin: 10px 0;
    padding: 4px 14px;
    color: #444;
}
hr { border: none; border-top: 1px solid #c9d3e0; margin: 18px 0; }
ul, ol { margin: 6px 0 6px 0; padding-left: 22px; }
li { margin: 3px 0; }
"""

HTML_TEMPLATE = """<!doctype html>
<html lang="pl">
<head><meta charset="utf-8"><style>{css}</style></head>
<body>{body}</body>
</html>"""


def render(md_path: Path, pdf_path: Path) -> None:
    """Zamienia plik .md na .pdf (uruchamiane wewnatrz venv)."""
    import markdown
    from weasyprint import HTML

    print(f"[3/4] Czytam {md_path.name} i zamieniam Markdown -> HTML…")
    text = md_path.read_text(encoding="utf-8")

    html_body = markdown.markdown(
        text,
        extensions=["tables", "fenced_code", "codehilite", "toc", "sane_lists"],
        extension_configs={"codehilite": {"noclasses": True}},
    )
    full_html = HTML_TEMPLATE.format(css=CSS, body=html_body)

    print(f"[4/4] Renderuje PDF -> {pdf_path.name}…")
    # base_url = folder pliku .md, dzieki czemu wzgledne sciezki do
    # obrazkow (np. app-final.png) sa znajdowane poprawnie.
    HTML(string=full_html, base_url=str(md_path.parent)).write_pdf(str(pdf_path))
    print(f"\nGotowe! Zapisano: {pdf_path}")


def main() -> None:
    # Argumenty: [wejscie.md] [wyjscie.pdf]
    md_path = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else HERE / "dokumentacja.md"
    if len(sys.argv) > 2:
        pdf_path = Path(sys.argv[2]).resolve()
    else:
        pdf_path = md_path.with_suffix(".pdf")

    if not md_path.exists():
        sys.exit(f"Nie znaleziono pliku wejsciowego: {md_path}")

    # Jesli NIE jestesmy jeszcze w venv -> przygotuj go i uruchom siebie ponownie.
    if sys.prefix == sys.base_prefix:
        ensure_venv()
        print("Przelaczam sie na interpreter z venv…\n")
        result = subprocess.run([str(venv_python()), __file__,
                                 str(md_path), str(pdf_path)])
        sys.exit(result.returncode)

    # Tutaj jestesmy juz w venv -> robimy wlasciwa robote.
    render(md_path, pdf_path)


if __name__ == "__main__":
    main()
