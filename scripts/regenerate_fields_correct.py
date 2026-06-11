"""
Regenerate {form}.fields.json files with CORRECT rect coordinates by reading
each PDF's AcroForm widget annotations directly.

Cursor's auto-extraction had a Y-offset bug that placed values at wrong line
positions (e.g., 60 pts off). This script reads the actual widget /Rect from
each page's /Annots list, which is the authoritative position the form expects
text to be drawn.

Preserves any semantic name keys from the existing fields.json so mappers
keep working — only the rect/page/id/type get refreshed.
"""
import json
import warnings
from pathlib import Path
from pypdf import PdfReader

warnings.filterwarnings('ignore')

FORMS_DIR = Path(__file__).parent.parent / 'public' / 'irs-forms'


def short_id(full_name: str) -> str:
    """topmostSubform[0].Page1[0].f1_4[0] → topmostSubform_0_Page1_0_f1_4_0"""
    return (full_name
            .replace('[', '_').replace(']', '')
            .replace('.', '_'))


def detect_form_year(pdf_path: Path):
    stem = pdf_path.stem
    if '_' in stem:
        parts = stem.rsplit('_', 1)
        if len(parts) == 2 and parts[1].isdigit():
            return parts[0], int(parts[1])
    return stem, 2025  # legacy default


def extract_widget_rects(reader: PdfReader):
    """Walk every page's annot list, capture each widget's /T (field name)
    + /Rect + /FT + page number. Returns list of {full_name, short, rect, page, type}."""
    out = []
    for page_idx, page in enumerate(reader.pages):
        annots = page.get('/Annots')
        if annots is None:
            continue
        # Resolve IndirectObject if needed
        if hasattr(annots, 'get_object'):
            annots = annots.get_object()
        if not annots:
            continue
        for annot_ref in annots:
            annot = annot_ref.get_object() if hasattr(annot_ref, 'get_object') else annot_ref
            if annot.get('/Subtype') != '/Widget':
                continue
            # Walk up the /Parent chain to build the full name
            parts = []
            current = annot
            seen = 0
            while current is not None and seen < 12:
                t = current.get('/T')
                if t is not None:
                    parts.append(str(t))
                parent = current.get('/Parent')
                current = parent.get_object() if hasattr(parent, 'get_object') else parent
                seen += 1
            full_name = '.'.join(reversed(parts))
            rect = annot.get('/Rect')
            ft = annot.get('/FT')
            # Walk up Parent chain for /FT if not on widget
            if ft is None:
                cur = annot.get('/Parent')
                cur_seen = 0
                while cur is not None and cur_seen < 8:
                    cur_obj = cur.get_object() if hasattr(cur, 'get_object') else cur
                    if cur_obj.get('/FT'):
                        ft = cur_obj.get('/FT')
                        break
                    cur = cur_obj.get('/Parent')
                    cur_seen += 1
            ftype = 'text'
            if ft == '/Btn':
                ftype = 'checkbox'
            elif ft == '/Ch':
                ftype = 'choice'
            out.append({
                'full_name': full_name,
                'short': short_id(full_name),
                'rect': [float(x) for x in rect] if rect else None,
                'page': page_idx + 1,
                'type': ftype,
            })
    return out


def regenerate_for_pdf(pdf_path: Path, json_path: Path):
    reader = PdfReader(str(pdf_path))
    widgets = extract_widget_rects(reader)
    form_name, year = detect_form_year(pdf_path)

    # Load existing JSON to preserve semantic name keys (if any)
    existing = {}
    if json_path.exists():
        try:
            existing = json.load(open(json_path))['fields']
        except Exception:
            existing = {}
    # Build a reverse lookup: id → semantic_name (in existing JSON)
    id_to_sem = {}
    for sem, defn in existing.items():
        if isinstance(defn, dict) and 'id' in defn:
            id_to_sem[defn['id']] = sem

    out = {
        'form': form_name,
        'year': year,
        'pdfFilename': pdf_path.name,
        'fields': {},
    }
    for w in widgets:
        if not w['rect']:
            continue
        # Use existing semantic name if present, else short id
        key = id_to_sem.get(w['full_name'], w['short'])
        out['fields'][key] = {
            'id': w['full_name'],
            'page': w['page'],
            'rect': w['rect'],
            'type': w['type'],
            'description': existing.get(key, {}).get('description', f'Auto-extracted ({w["short"]})'),
        }
    json_path.write_text(json.dumps(out, indent=2))
    return len(out['fields'])


def main():
    pdfs = sorted(FORMS_DIR.glob('*.pdf'))
    print(f'Regenerating field maps for {len(pdfs)} PDFs...')
    for pdf in pdfs:
        json_path = pdf.with_suffix('.fields.json')
        n = regenerate_for_pdf(pdf, json_path)
        print(f'  {pdf.name}: {n} fields')


if __name__ == '__main__':
    main()
