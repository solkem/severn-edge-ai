"""Build docs/CLASSROOM_GUIDE.pdf from docs/CLASSROOM_GUIDE.md.

This script uses only Python standard library:
1) Converts Markdown (subset used in this repo) to styled HTML
2) Writes a temporary HTML file next to the guide
3) Prints that HTML to PDF using headless Google Chrome

Usage:
    python3 docs/build_classroom_guide_pdf.py
"""

from __future__ import annotations

import html
import os
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parent
INPUT_MD = ROOT / "CLASSROOM_GUIDE.md"
OUTPUT_PDF = ROOT / "CLASSROOM_GUIDE.pdf"
TEMP_HTML = ROOT / "CLASSROOM_GUIDE_rendered.html"
CHROME_BIN = Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")


def md_inline(text: str) -> str:
    """Basic inline markdown formatting."""
    out = html.escape(text, quote=False)
    out = re.sub(r"`([^`]+)`", r"<code>\1</code>", out)
    out = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", out)
    out = re.sub(r"_([^_]+)_", r"<em>\1</em>", out)
    out = re.sub(r"\*([^*]+)\*", r"<em>\1</em>", out)
    return out


def is_table_rule(line: str) -> bool:
    s = line.strip().replace(" ", "")
    return bool(s) and set(s) <= {"|", "-", ":"}


def split_table_row(line: str) -> list[str]:
    raw = line.strip()
    if raw.startswith("|"):
        raw = raw[1:]
    if raw.endswith("|"):
        raw = raw[:-1]
    return [cell.strip() for cell in raw.split("|")]


def render_markdown_to_html(md_text: str) -> str:
    lines = md_text.splitlines()
    i = 0
    parts: list[str] = []

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if not stripped:
            i += 1
            continue

        # Fenced code block
        if stripped.startswith("```"):
            code_lines: list[str] = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code_lines.append(lines[i])
                i += 1
            if i < len(lines):
                i += 1
            code_html = html.escape("\n".join(code_lines), quote=False)
            parts.append(f"<pre><code>{code_html}</code></pre>")
            continue

        # Headings
        h = re.match(r"^(#{1,6})\s+(.*)$", line)
        if h:
            level = len(h.group(1))
            parts.append(f"<h{level}>{md_inline(h.group(2).strip())}</h{level}>")
            i += 1
            continue

        # Horizontal rule
        if stripped in {"---", "***"}:
            parts.append("<hr>")
            i += 1
            continue

        # Table
        if "|" in line and i + 1 < len(lines) and is_table_rule(lines[i + 1]):
            header = split_table_row(lines[i])
            i += 2
            rows: list[list[str]] = []
            while i < len(lines):
                row_line = lines[i].strip()
                if not row_line or "|" not in row_line:
                    break
                rows.append(split_table_row(lines[i]))
                i += 1
            table_html = ["<table><thead><tr>"]
            for c in header:
                table_html.append(f"<th>{md_inline(c)}</th>")
            table_html.append("</tr></thead><tbody>")
            for row in rows:
                table_html.append("<tr>")
                for c in row:
                    table_html.append(f"<td>{md_inline(c)}</td>")
                table_html.append("</tr>")
            table_html.append("</tbody></table>")
            parts.append("".join(table_html))
            continue

        # Blockquote
        if stripped.startswith(">"):
            quote_lines: list[str] = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                quote_lines.append(lines[i].strip().lstrip(">").strip())
                i += 1
            parts.append(f"<blockquote>{'<br>'.join(md_inline(q) for q in quote_lines)}</blockquote>")
            continue

        # Unordered list
        if re.match(r"^\s*[-*]\s+", line):
            items: list[str] = []
            while i < len(lines) and re.match(r"^\s*[-*]\s+", lines[i]):
                item = re.sub(r"^\s*[-*]\s+", "", lines[i]).strip()
                items.append(f"<li>{md_inline(item)}</li>")
                i += 1
            parts.append(f"<ul>{''.join(items)}</ul>")
            continue

        # Ordered list
        if re.match(r"^\s*\d+\.\s+", line):
            items = []
            while i < len(lines) and re.match(r"^\s*\d+\.\s+", lines[i]):
                item = re.sub(r"^\s*\d+\.\s+", "", lines[i]).strip()
                items.append(f"<li>{md_inline(item)}</li>")
                i += 1
            parts.append(f"<ol>{''.join(items)}</ol>")
            continue

        # Paragraph
        para_lines = [line.strip()]
        i += 1
        while i < len(lines):
            nxt = lines[i].strip()
            if not nxt:
                break
            if (
                nxt.startswith("#")
                or nxt.startswith(">")
                or nxt.startswith("```")
                or nxt in {"---", "***"}
                or re.match(r"^\s*[-*]\s+", lines[i])
                or re.match(r"^\s*\d+\.\s+", lines[i])
            ):
                break
            if "|" in lines[i] and i + 1 < len(lines) and is_table_rule(lines[i + 1]):
                break
            para_lines.append(nxt)
            i += 1
        paragraph = " ".join(para_lines)
        parts.append(f"<p>{md_inline(paragraph)}</p>")

    body = "\n".join(parts)

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Severn Edge AI — Classroom Guide</title>
  <style>
    @page {{
      size: A4;
      margin: 16mm;
    }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Aptos, Arial, sans-serif;
      color: #1f2937;
      font-size: 11pt;
      line-height: 1.45;
      margin: 0;
    }}
    h1, h2, h3 {{
      color: #0f766e;
      margin: 1.0em 0 0.4em;
      page-break-after: avoid;
    }}
    h1 {{ font-size: 24pt; }}
    h2 {{ font-size: 17pt; }}
    h3 {{ font-size: 14pt; }}
    p {{ margin: 0.45em 0; }}
    ul, ol {{ margin: 0.45em 0 0.45em 1.2em; padding: 0; }}
    li {{ margin: 0.2em 0; }}
    hr {{
      border: 0;
      border-top: 1px solid #d1d5db;
      margin: 1em 0;
    }}
    blockquote {{
      border-left: 4px solid #14b8a6;
      margin: 0.7em 0;
      padding: 0.35em 0.8em;
      background: #f0fdfa;
    }}
    code {{
      font-family: ui-monospace, Menlo, Monaco, Consolas, monospace;
      background: #f3f4f6;
      padding: 0.08em 0.3em;
      border-radius: 4px;
      font-size: 0.95em;
    }}
    pre {{
      background: #0f172a;
      color: #e2e8f0;
      padding: 0.7em;
      border-radius: 6px;
      white-space: pre-wrap;
      word-break: break-word;
      page-break-inside: avoid;
    }}
    table {{
      width: 100%;
      border-collapse: collapse;
      margin: 0.7em 0;
      page-break-inside: avoid;
      font-size: 10pt;
    }}
    th, td {{
      border: 1px solid #cbd5e1;
      padding: 6px 7px;
      vertical-align: top;
    }}
    th {{
      background: #ecfeff;
      color: #0f172a;
      text-align: left;
      font-weight: 700;
    }}
    tr:nth-child(even) td {{
      background: #f8fafc;
    }}
  </style>
</head>
<body>
{body}
</body>
</html>
"""


def build_pdf() -> None:
    if not INPUT_MD.exists():
        raise FileNotFoundError(f"Missing source markdown: {INPUT_MD}")
    if not CHROME_BIN.exists():
        raise FileNotFoundError(
            "Google Chrome binary not found at /Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        )

    html_text = render_markdown_to_html(INPUT_MD.read_text(encoding="utf-8"))
    TEMP_HTML.write_text(html_text, encoding="utf-8")

    html_abs = TEMP_HTML.resolve().as_uri()
    user_data_dir = Path("/tmp/severn-chrome-headless")
    user_data_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        str(CHROME_BIN),
        "--headless=new",
        "--disable-gpu",
        "--allow-file-access-from-files",
        f"--user-data-dir={user_data_dir}",
        f"--print-to-pdf={OUTPUT_PDF.resolve()}",
        html_abs,
    ]

    subprocess.run(cmd, check=True)
    print(f"Saved {OUTPUT_PDF}")


if __name__ == "__main__":
    build_pdf()
