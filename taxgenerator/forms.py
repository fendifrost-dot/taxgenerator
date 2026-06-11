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
        # Individual expense lines (legacy d-dict keys for fill_1040sc)
        'adv':            expenses.get('L8_advertising', 0),
        'contractLabor':  expenses.get('L11_contract_labor', 0),
        'depreciation':   expenses.get('L13_depreciation', 0),
        'insurance':      expenses.get('L15_insurance', 0),
        'legalProf':      expenses.get('L17_legal_professional', 0),
        'rent':           expenses.get('L20b_rent_other', 0),
        'supplies':       expenses.get('L22_supplies', 0),
        'travel':         expenses.get('L24a_travel', 0),
        'meals50':        expenses.get('L24b_meals_50pct', 0),
        'utilities':      expenses.get('L25_utilities', 0),
        # Part V items (for fill_1040sc page 2)
        'partV_software':   _find_partv(sc, 'software'),
        'partV_education':  _find_partv(sc, 'education'),
        'partV_mailbox_az': _find_partv(sc, 'mailbox az'),
        'partV_mailbox_il': _find_partv(sc, 'mailbox il'),
        'partV_domain':     _find_partv(sc, 'domain'),
        'partV_misc':       _find_partv(sc, 'misc'),
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


def _find_partv(sc, keyword):
    """Find the amount of a Part V item whose description contains `keyword`."""
    if not sc:
        return 0
    for it in sc.get('part_v_items', []):
        if keyword.lower() in (it.get('description', '').lower()):
            return it.get('amount', 0)
    return 0


def generate_packet(cfg, year):
    """Generate the federal packet PDF bytes for a client config + tax year.

    Returns: bytes (merged PDF)."""
    # Lazy imports because fill_pasta_pals_python loads PDFs
    import fill_pasta_pals_python as fpp
    from .compute import compute_individual_return

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

        parts = [
            pkt_1040,
            fpp.fill_1040s1(d),
            fpp.fill_1040s2(d),
            fpp.fill_1040sc(d),
            fpp.fill_1040sse(d),
            fpp.fill_8959(d),
        ]
        merged = fpp.merge_pdfs(parts)
        return merged
    finally:
        _restore_identity(fpp, saved)


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
        parts = [pkt_1040x]
        # Schedule 1 (business income) and Schedule 2 (SE / other taxes) changed.
        parts.append(fpp.fill_1040s1(d))
        parts.append(fpp.fill_1040s2(d))
        # Schedule C and Schedule SE — net profit was corrected.
        parts.append(fpp.fill_1040sc(d))
        parts.append(fpp.fill_1040sse(d))
        # Form 8959 only when additional Medicare tax actually applies.
        if corrected.get('addl_med', 0) > 0:
            parts.append(fpp.fill_8959(d))
        return fpp.merge_pdfs(parts)
    finally:
        _restore_identity(fpp, saved)


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
