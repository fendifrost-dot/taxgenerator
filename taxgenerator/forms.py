"""Federal-form fill orchestration. Wraps the existing fill_pasta_pals_python.py
script (which has tested 2024 + 2025 logic) and parameterizes it from a
client config + computed return values.

The wrapping strategy: temporarily mutate the module-level identity globals
in fill_pasta_pals_python (TAXPAYER_*, ENTITY_*, etc.) for the duration of
one fill call. This is less invasive than a full refactor and keeps the
2024-frozen output byte-identical when called with the Pasta Pals config.

For 2025, the dedicated fill_1040_2025 module is invoked via the same path
(since fill_pasta_pals_python.py already branches on year).
"""
import sys
import os
from pathlib import Path
from io import BytesIO

# Ensure scripts/ is importable so we can pick up the existing fill modules
REPO = Path(__file__).parent.parent
SCRIPTS = REPO / 'scripts'
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))


def _identity_from_config(cfg):
    """Map a client config dict to the global identity values that the
    fill_pasta_pals_python module expects."""
    filer = cfg['filer']
    addr = cfg['address']
    sc = cfg.get('schedule_c') or {}
    return {
        'TAXPAYER_NAME':  f"{filer['first_name']} {filer['last_name']}".strip(),
        'TAXPAYER_FIRST': filer['first_name'],
        'TAXPAYER_LAST':  filer['last_name'],
        'TAXPAYER_SSN':   filer['ssn'],
        'HOME_ADDRESS':   addr.get('street', ''),
        'HOME_CITY':      addr.get('city', ''),
        'HOME_STATE':     addr.get('state', ''),
        'HOME_ZIP':       addr.get('zip', ''),
        'OCCUPATION':     filer.get('occupation', ''),
        'ENTITY_NAME':    sc.get('entity_name', ''),
        'EIN':            sc.get('ein', ''),
        'BIZ_ADDRESS':    sc.get('biz_address', ''),
        'BIZ_CSZ':        sc.get('biz_csz', ''),
        'PRINCIPAL_BUSINESS': sc.get('principal_business', ''),
        'NAICS_CODE':     sc.get('naics_code', ''),
        'MADE_PAYMENTS_1099': sc.get('made_payments_requiring_1099', 'yes'),
        'FILED_1099S':    sc.get('filed_required_1099s', 'no'),
        # Schedule C questions F and G were drawn as "Cash" / "Yes" no matter
        # what the config said.
        'ACCOUNTING_METHOD': sc.get('accounting_method', 'cash'),
        'MATERIAL_PARTICIPATION': sc.get('material_participation', 'yes'),
    }


def _set_identity(module, identity):
    """Temporarily replace module identity globals; return previous values."""
    saved = {}
    for k, v in identity.items():
        saved[k] = getattr(module, k, None)
        setattr(module, k, v)
    return saved


def _restore_identity(module, saved):
    for k, v in saved.items():
        setattr(module, k, v)


def _build_d(computed):
    """Convert the computed-return dict into the legacy `d` dict shape that
    fill_pasta_pals_python.compute_year() produces. Both shapes overlap
    significantly; this just smooths over key naming."""
    sc = computed.get('sch_c') or {}
    expenses = sc.get('expenses', {}) if sc else {}
    return {
        'taxYear': computed['taxYear'],
        # Schedule C totals
        'gross':           computed['gross'],
        'net_profit':      computed['net_profit'],
        'total_expenses':  sc.get('L28_total_expenses', 0) if sc else 0,
        'partV_total':     sc.get('part_v_total', 0) if sc else 0,
        # Every computed Part II line, passed straight through. This used to be
        # a hand-picked subset of ten keys — the lines Pasta Pals happened to
        # use — so any other line a client claimed was silently dropped from
        # the printed form while still counting in line 28.
        'sch_c_expenses':  dict(expenses),
        # Part I income lines, so lines 2-6 are the client's own figures
        # rather than hard-coded zeros.
        'sch_c_income': {
            'gross_receipts':     sc.get('gross_receipts', 0) if sc else 0,
            'returns_allowances': sc.get('returns_allowances', 0) if sc else 0,
            'L3_subtract':        sc.get('L3_subtract', 0) if sc else 0,
            'cogs':               sc.get('cogs', 0) if sc else 0,
            'L5_gross_profit':    sc.get('L5_gross_profit', 0) if sc else 0,
            'L6_other_income':    sc.get('L6_other_income', 0) if sc else 0,
            'L7_gross_income':    sc.get('L7_gross_income', 0) if sc else 0,
        },
        # Line 29 and line 31 differ once home-office expense is claimed.
        'tentative_profit': sc.get('L29_tentative_profit', 0) if sc else 0,
        'home_office':      sc.get('L30_home_office', 0) if sc else 0,
        # Part V items verbatim (description + amount), not matched by keyword
        # against Pasta Pals' category names.
        'partV_items':     list(sc.get('part_v_items', []) or []),
        # Part IV vehicle answers.
        'vehicle':         sc.get('vehicle') or {},
        # Schedule SE / 8959
        'se_earn':       computed['se_earn'],
        'ss_tax':        computed['ss_tax'],
        'med_tax':       computed['med_tax'],
        'se_total':      computed['se_total'],
        'half_se':       computed['half_se'],
        'addl_med':      computed['addl_med'],
        'threshold':     computed['threshold'],
        'ss_base':       computed['ss_base'],
        # Form 1040
        'agi':           computed['agi'],
        'std_ded':       computed['std_ded'],
        'taxable':       computed['taxable'],
        'fed_tax':       computed['fed_tax'],
        'sch2_total':    computed['sch2_total'],
        'total_tax':     computed['total_tax'],
    }


def generate_packet(cfg, year):
    """Generate the federal packet PDF bytes for a client config + tax year.

    Returns: bytes (merged PDF)."""
    # Lazy imports because fill_pasta_pals_python loads PDFs
    import fill_pasta_pals_python as fpp
    from .compute import compute_individual_return
    from .reconcile import reconcile

    computed = compute_individual_return(cfg, year)
    d = _build_d(computed)

    identity = _identity_from_config(cfg)
    saved = _set_identity(fpp, identity)
    try:
        # Build the 6 form parts in IRS filing order
        if year == 2025:
            # Use the dedicated 2025 1040 filler
            from fill_1040_2025 import fill_1040_2025
            saved_2025 = _set_identity_module('fill_1040_2025', identity)
            try:
                pkt_1040 = fill_1040_2025({
                    'name_first': identity['TAXPAYER_FIRST'],
                    'name_last':  identity['TAXPAYER_LAST'],
                    'ssn':        identity['TAXPAYER_SSN'],
                    'address':    identity['HOME_ADDRESS'],
                    'city':       identity['HOME_CITY'],
                    'state':      identity['HOME_STATE'],
                    'zip':        identity['HOME_ZIP'],
                    'net_profit': d['net_profit'],
                    'half_se':    d['half_se'],
                    'agi':        d['agi'],
                    'std_ded':    d['std_ded'],
                    'taxable':    d['taxable'],
                    'fed_tax':    d['fed_tax'],
                    'sch2_total': d['sch2_total'],
                    'total_tax':  d['total_tax'],
                    'filing_status': cfg['filer']['filing_status'],
                })
            finally:
                _restore_identity_module('fill_1040_2025', saved_2025)
        else:
            pkt_1040 = fpp.fill_1040(d)

        named = [
            ('1040', pkt_1040),
            ('1040s1', fpp.fill_1040s1(d)),
            ('1040s2', fpp.fill_1040s2(d)),
            ('1040sc', fpp.fill_1040sc(d)),
            ('1040sse', fpp.fill_1040sse(d)),
            ('8959', fpp.fill_8959(d)),
        ]
        # Gate: read the pages back and prove they print the computed return.
        # Raises ReconcileError, so no caller can write a packet that does not
        # reconcile.
        report = reconcile(named, computed, year,
                           label=cfg.get('display_name') or cfg['client_id'],
                           decisions=_recorded_decisions(computed))
        merged = fpp.merge_pdfs([pdf for _, pdf in named])
        return merged, report
    finally:
        _restore_identity(fpp, saved)


def _recorded_decisions(computed):
    """Deliberate omissions the config asked for, for the print-check report.

    These are preparer decisions, not defects: the gate cannot tell a box left
    blank on purpose from one left blank by a bug, so the reason is carried
    into the report where a reviewer will see it.
    """
    out = []
    v = (computed.get('sch_c') or {}).get('vehicle') or {}
    if v.get('omitted'):
        out.append('Schedule C Part IV (lines 43-47b) left blank: '
                   + str(v.get('reason') or '').strip())
    return out


def generate_amendment_packet(original_cfg, amended_cfg, year):
    """Generate a Form 1040-X amendment packet for a client.

    Produces the filled 1040-X followed by ONLY the corrected schedules that
    changed between the original and amended returns (Schedule 1, Schedule 2,
    Schedule C, Schedule SE, and Form 8959 if additional Medicare applies).
    Unchanged forms are not re-emitted.

    Returns: bytes (merged PDF)."""
    import fill_pasta_pals_python as fpp
    from fill_1040x_2024 import fill_1040x_2024
    from .compute import compute_amendment
    from .reconcile import reconcile

    if year != 2024:
        raise ValueError(
            f"Amendment support is currently 1040-X for tax year 2024 only "
            f"(got {year}). Add a year-specific 1040-X filler to extend.")

    model = compute_amendment(original_cfg, amended_cfg, year)

    filer = amended_cfg['filer']
    addr = amended_cfg['address']
    spouse = amended_cfg.get('spouse') or {}
    identity = {
        'name_first': filer['first_name'],
        'name_last':  filer['last_name'],
        'ssn':        filer['ssn'],
        'spouse_first': spouse.get('first_name', ''),
        'spouse_last':  spouse.get('last_name', ''),
        'spouse_ssn':   spouse.get('ssn', ''),
        'address':    addr.get('street', ''),
        'apt':        addr.get('apt', ''),
        'city':       addr.get('city', ''),
        'state':      addr.get('state', ''),
        'zip':        addr.get('zip', ''),
        'filing_status': filer['filing_status'],
    }

    pkt_1040x = fill_1040x_2024(model, identity)

    # Corrected schedules — built from the AMENDED config's computed return.
    corrected = model['_corrected']
    d = _build_d(corrected)

    fpp_identity = _identity_from_config(amended_cfg)
    saved = _set_identity(fpp, fpp_identity)
    try:
        named = [('1040x', pkt_1040x)]
        # Schedule 1 (business income) and Schedule 2 (SE / other taxes) changed.
        named.append(('1040s1', fpp.fill_1040s1(d)))
        named.append(('1040s2', fpp.fill_1040s2(d)))
        # Schedule C and Schedule SE — net profit was corrected.
        named.append(('1040sc', fpp.fill_1040sc(d)))
        named.append(('1040sse', fpp.fill_1040sse(d)))
        # Form 8959 only when additional Medicare tax actually applies.
        if corrected.get('addl_med', 0) > 0:
            named.append(('8959', fpp.fill_8959(d)))

        report = reconcile(
            named, corrected, year,
            label=(amended_cfg.get('display_name')
                   or amended_cfg['client_id']) + ' 1040-X',
            decisions=_recorded_decisions(corrected))
        report += _amendment_column_c_report(model, corrected, pkt_1040x)
        merged = fpp.merge_pdfs([pdf for _, pdf in named])
        return merged, report
    finally:
        _restore_identity(fpp, saved)


def _amendment_column_c_report(model, corrected, pdf_1040x):
    """Read Form 1040-X's three money columns back and check them.

    Column C is what the IRS keys in, so a disagreement between the 1040-X and
    the corrected schedules behind it is the one error the schedules alone
    cannot reveal. Column B must also be C - A, since that is the arithmetic
    the service centre re-performs.

    Every figure here is located by the line number the form prints beside it,
    never by the leaf that drew it. The leaf-based version of this check shared
    its authority with the filler: point a leaf at the wrong box and the check
    read back the box the filler had just written and agreed with itself.
    Pointing line 11 column C at the reserved line-9 box printed the total tax
    on line 9, left line 11 empty, and still reported "ok".
    """
    from fill_1040x_2024 import GRID_LEAVES
    from .reconcile import Finding, ReconcileError, read_1040x_grid

    findings = []
    out = ['', 'Form 1040-X — columns read back from the printed page',
           '(located by the line number printed beside each figure, not by '
           'the field map):', '',
           f'  {"line":<5} {"A as filed":>12} {"B change":>12} '
           f'{"C corrected":>12}  {"model C":>12}  status']
    out.append(f'  {"-"*5} {"-"*12} {"-"*12} {"-"*12}  {"-"*12}  ------')

    printed, labels, unplaced = read_1040x_grid(pdf_1040x)
    if not labels:
        findings.append(Finding(
            'placed', '1040x 2024',
            'no printed line numbers were found on page 1 — the template '
            'layout is not what this check expects, so nothing was verified'))

    def show(v):
        return f'{v:,}' if isinstance(v, int) else '(blank)'

    seen = set()
    for ln in model['lines']:
        line_id = ln['line']
        a, b, c = (printed.get((line_id, k)) for k in ('a', 'b', 'c'))
        for col in ('a', 'b', 'c'):
            seen.add((line_id, col))
        status = 'ok'

        # A model line that carries a figure must have somewhere to print it.
        if GRID_LEAVES.get(line_id) is None and any(
                ln.get(k) is not None for k in ('a', 'b', 'c')):
            status = 'FAIL'
            findings.append(Finding(
                'placed', '1040x 2024',
                f'line {line_id} carries a figure but has no GRID_LEAVES '
                'entry, so nothing could print it'))

        for col, got in (('a', a), ('b', b), ('c', c)):
            want = ln.get(col)
            if got == want:
                continue
            status = 'FAIL'
            label = f'line {line_id} column {col.upper()}'
            if ln.get('label') and col == 'c':
                label += f' ({ln["label"]})'
            if want is None:
                findings.append(Finding(
                    'placed', '1040x 2024',
                    f'{label} should be blank but reads {show(got)}'))
            else:
                findings.append(Finding(
                    'placed', '1040x 2024',
                    f'{label} should print {want:,} but reads {show(got)}'))

        # B must equal C - A wherever all three printed.
        if None not in (a, b, c) and b != c - a:
            status = 'FAIL'
            findings.append(Finding(
                'math', '1040x 2024',
                f'line {line_id} column B reads {b:,} but column C {c:,} '
                f'- column A {a:,} = {c - a:,}'))

        if (a, b, c) == (None, None, None) and all(
                ln.get(k) is None for k in ('a', 'b', 'c')):
            continue          # nothing expected, nothing printed
        out.append(f'  {line_id:<5} {show(a):>12} {show(b):>12} '
                   f'{show(c):>12}  {show(ln.get("c")):>12}  {status}')

    # A figure on a line the model does not know about, or on no line at all.
    for (line_id, col) in sorted(set(printed) - seen):
        findings.append(Finding(
            'stray', '1040x 2024',
            f'line {line_id} column {col.upper()} reads '
            f'{printed[(line_id, col)]:,}, but the model has no such line'))
    for text, col, top in unplaced:
        findings.append(Finding(
            'stray', '1040x 2024',
            f'the figure {text} printed in column {col.upper()} (y={top:.0f}) '
            'does not sit beside any printed line number'))

    out.append('')
    # Line 9 is reserved on the 2024 revision and must stay empty.
    reserved = [col for col in ('a', 'b', 'c') if ('9', col) in printed]
    if reserved:
        findings.append(Finding(
            'placed', '1040x 2024',
            'line 9 is reserved on this revision of the form but carries a '
            f'figure in column {", ".join(c.upper() for c in reserved)}'))
    out.append('Line 9 (reserved on this revision): '
               + ('EMPTY, as it must be' if not reserved else 'CARRIES A FIGURE'))

    out.append('')
    # Tie the 1040-X back to the schedules behind it -- against the page.
    ties = [('line 1 (AGI)', '1', 'agi'),
            ('line 5 (taxable income)', '5', 'taxable'),
            ('line 11 (total tax)', '11', 'total_tax')]
    out.append('Column C read off the page vs the corrected computed return:')
    for label, line_id, computed_key in ties:
        want = corrected.get(computed_key)
        col_c = printed.get((line_id, 'c'))
        ok = col_c == want
        out.append(f'  - {label}: page reads {show(col_c)} vs computed '
                   f'{show(want)}  {"ok" if ok else "FAIL"}')
        if not ok:
            findings.append(Finding(
                'math', '1040x 2024',
                f'{label}: the page reads {show(col_c)} in column C but the '
                f'corrected return computes {show(want)}'))
    out.append('')

    if findings:
        raise ReconcileError(findings, '\n'.join(out))
    return '\n'.join(out)


def _set_identity_module(mod_name, identity):
    """Variant for modules other than fpp."""
    if mod_name not in sys.modules:
        __import__(mod_name)
    mod = sys.modules[mod_name]
    saved = {}
    for k, v in identity.items():
        saved[k] = getattr(mod, k, None)
        setattr(mod, k, v)
    return saved


def _restore_identity_module(mod_name, saved):
    if mod_name in sys.modules:
        mod = sys.modules[mod_name]
        for k, v in saved.items():
            setattr(mod, k, v)


def generate_il_amendment_packet(original_cfg, amended_cfg, year):
    """Generate a Form IL-1040-X (Illinois Amended Individual Income Tax Return).

    Illinois flows from federal AGI, so this reuses the federal computed return
    for the corrected AGI and applies the IL flat-tax chain. Produces the filled
    2-page IL-1040-X; the taxpayer attaches the federal finalization (the
    amended federal 1040-X) per the form's own instructions.

    Returns: bytes (the IL-1040-X PDF)."""
    from fill_il1040x_2024 import fill_il1040x_2024
    from .state_il import compute_il_amendment

    if year != 2024:
        raise ValueError(
            f"IL amendment support is currently IL-1040-X for tax year 2024 only "
            f"(got {year}). Add a year-specific IL-1040-X filler to extend.")

    model = compute_il_amendment(original_cfg, amended_cfg, year)

    filer = amended_cfg['filer']
    addr = amended_cfg['address']
    spouse = amended_cfg.get('spouse') or {}
    identity = {
        'name_first': filer['first_name'],
        'name_last':  filer['last_name'],
        'ssn':        filer['ssn'],
        'spouse_first': spouse.get('first_name', ''),
        'spouse_last':  spouse.get('last_name', ''),
        'spouse_ssn':   spouse.get('ssn', ''),
        'address':    addr.get('street', ''),
        'apt':        addr.get('apt', ''),
        'city':       addr.get('city', ''),
        'state':      addr.get('state', ''),
        'zip':        addr.get('zip', ''),
        'filing_status': filer['filing_status'],
        # IL Step 11C: this IL amendment is driven by an amended federal return.
        'filed_federal_1040x': True,
    }
    return fill_il1040x_2024(model, identity)
