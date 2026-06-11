"""Standalone 2025 Form 1040 page 1 DEBUG renderer.
Draws every AcroForm widget rect outline + leaf name onto the form.
Output: dist/_DEBUG_1040_2025_p1.pdf — open it to see where each leaf sits.

This is the FIRST step of the 2025 rebuild — verify the rects against the
actual form before authoring any line→leaf mapping."""
from io import BytesIO
from pathlib import Path
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, ArrayObject
from reportlab.pdfgen.canvas import Canvas

REPO = Path(__file__).parent.parent
PDF_IN = REPO / 'public' / 'irs-forms' / '1040_2025.pdf'
PDF_OUT = REPO / 'dist' / '_DEBUG_1040_2025_p1.pdf'


def extract_widgets(pdf_path):
    """Yield (page_idx, leaf_name, rect, ft, max_len, is_comb) for every widget."""
    r = PdfReader(str(pdf_path))
    for pg_idx, page in enumerate(r.pages):
        annots = page.get('/Annots', [])
        if hasattr(annots, 'get_object'):
            annots = annots.get_object()
        for a in annots:
            ao = a.get_object() if hasattr(a, 'get_object') else a
            if ao.get('/Subtype') != '/Widget':
                continue
            rect = ao.get('/Rect')
            if not rect:
                continue
            rect = [float(x) for x in rect]
            ft = ao.get('/FT', '?')
            t = ao.get('/T', '')
            # Build full hierarchical name
            parent = ao.get('/Parent')
            names = [str(t)] if t else []
            while parent:
                p = parent.get_object() if hasattr(parent, 'get_object') else parent
                pt = p.get('/T')
                if pt:
                    names.insert(0, str(pt))
                parent = p.get('/Parent')
            full = '.'.join(names)
            leaf = full.split('.')[-1] if full else f'<unnamed_{pg_idx}>'
            mlen = ao.get('/MaxLen')
            flags = int(ao.get('/Ff') or 0)
            is_comb = bool(flags & (1 << 24))
            yield pg_idx, leaf, rect, str(ft), mlen, is_comb, full


def make_debug_overlay(width, height, widgets_on_page):
    buf = BytesIO()
    c = Canvas(buf, pagesize=(width, height))
    for leaf, rect, ft, mlen, is_comb, full in widgets_on_page:
        # Color: text=red, button=blue
        if ft == '/Btn':
            c.setStrokeColorRGB(0, 0, 1)
        else:
            c.setStrokeColorRGB(1, 0, 0)
        c.setLineWidth(0.4)
        c.rect(rect[0], rect[1], rect[2]-rect[0], rect[3]-rect[1], stroke=1, fill=0)
        # Tag: leaf name above rect
        c.setFillColorRGB(0, 0.5, 0)
        c.setFont('Helvetica', 4)
        tag = leaf
        if mlen is not None:
            tag += f' ML={mlen}'
        if is_comb:
            tag += ' C'
        c.drawString(rect[0], rect[3] + 0.5, tag)
        c.setFillColorRGB(0, 0, 0)
    c.showPage()
    c.save()
    return buf.getvalue()


def main():
    widgets = list(extract_widgets(PDF_IN))
    by_page = {}
    for pg_idx, leaf, rect, ft, mlen, is_comb, full in widgets:
        by_page.setdefault(pg_idx, []).append((leaf, rect, ft, mlen, is_comb, full))

    reader = PdfReader(str(PDF_IN))
    writer = PdfWriter(clone_from=reader)

    # Strip widget annots so they don't overlay our debug labels
    for page in writer.pages:
        if '/Annots' in page:
            annots = page['/Annots']
            if hasattr(annots, 'get_object'):
                annots = annots.get_object()
            kept = ArrayObject()
            for a in annots:
                ao = a.get_object() if hasattr(a, 'get_object') else a
                if ao.get('/Subtype') != '/Widget':
                    kept.append(a)
            page[NameObject('/Annots')] = kept

    for pg_idx in sorted(by_page.keys()):
        ov = make_debug_overlay(612, 792, by_page[pg_idx])
        ov_reader = PdfReader(BytesIO(ov))
        if pg_idx < len(writer.pages):
            writer.pages[pg_idx].merge_page(ov_reader.pages[0])

    PDF_OUT.parent.mkdir(exist_ok=True)
    with open(PDF_OUT, 'wb') as f:
        writer.write(f)
    print(f'Wrote {PDF_OUT}')
    print(f'Page 1 has {len(by_page.get(0, []))} widgets')
    print(f'Page 2 has {len(by_page.get(1, []))} widgets')


if __name__ == '__main__':
    main()
