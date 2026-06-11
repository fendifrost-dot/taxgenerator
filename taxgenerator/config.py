"""Client config loader + validator. Reads JSON, normalizes fields, and
returns a typed dict suitable for the rest of the pipeline."""
import json
from pathlib import Path

from .tax_tables import normalize_filing_status, FILING_STATUSES


REQUIRED_TOP_LEVEL = {'client_id', 'filer', 'address', 'years'}
REQUIRED_FILER = {'first_name', 'last_name', 'ssn', 'filing_status'}
REQUIRED_ADDR = {'street', 'city', 'state', 'zip'}


class ConfigError(ValueError):
    pass


def load_client(path):
    """Load a client JSON file from disk and validate it."""
    p = Path(path)
    if not p.exists():
        raise ConfigError(f"Client config not found: {path}")
    with open(p) as f:
        cfg = json.load(f)
    return validate_config(cfg)


def validate_config(cfg):
    """Validate a parsed config dict and normalize fields."""
    missing = REQUIRED_TOP_LEVEL - set(cfg.keys())
    if missing:
        raise ConfigError(f"Missing required top-level keys: {missing}")

    # Filer
    filer = cfg.get('filer', {})
    miss = REQUIRED_FILER - set(filer.keys())
    if miss:
        raise ConfigError(f"filer missing keys: {miss}")
    filer['filing_status'] = normalize_filing_status(filer['filing_status'])

    fs = filer['filing_status']
    if fs in ('mfj', 'mfs') and not cfg.get('spouse'):
        raise ConfigError(f"filing_status={fs!r} requires a spouse block")

    # Address
    addr = cfg.get('address', {})
    miss = REQUIRED_ADDR - set(addr.keys())
    if miss:
        raise ConfigError(f"address missing keys: {miss}")

    # Years
    years = cfg.get('years', {})
    if not years:
        raise ConfigError("At least one tax year must be present in 'years'")
    # JSON keys are strings — normalize to int where used
    cfg['years'] = {int(y): data for y, data in years.items()}

    # Defaults for optional sections
    cfg.setdefault('spouse', None)
    cfg.setdefault('dependents', [])
    cfg.setdefault('schedule_c', None)
    cfg.setdefault('other_income', {})
    cfg.setdefault('payments', {})
    # Optional Form 1040-X column-A source: figures as actually filed on the
    # original return. When present, compute_amendment uses these for column A
    # instead of recomputing the original. See _resolve_as_filed in compute.py.
    cfg.setdefault('as_filed', None)
    # Optional Illinois data blocks (state amendment path — see state_il.py).
    # `illinois`: IL-specific figures (exemption persons, additions/subtractions,
    # IL payments, use tax). `il_as_filed`: the original IL return's figures
    # (overpayment on Line 32, total tax) used for the IL-1040-X reconciliation.
    cfg.setdefault('illinois', None)
    cfg.setdefault('il_as_filed', None)

    # Defaults inside other_income
    oi_defaults = {
        'w2_wages': 0, 'taxable_interest': 0, 'ordinary_dividends': 0,
        'qualified_dividends': 0, 'ira_distributions': 0, 'ira_taxable': 0,
        'pensions': 0, 'pensions_taxable': 0,
        'social_security': 0, 'social_security_taxable': 0,
        'capital_gain_loss': 0,
    }
    for k, v in oi_defaults.items():
        cfg['other_income'].setdefault(k, v)

    # Defaults inside payments
    pay_defaults = {
        'federal_withholding': 0, 'estimated_payments': 0,
        'earned_income_credit': 0, 'child_tax_credit': 0,
        'qbi_deduction': 0, 'additional_deductions_sch1a': 0,
        'use_itemized_deductions': False, 'itemized_deductions_total': 0,
    }
    for k, v in pay_defaults.items():
        cfg['payments'].setdefault(k, v)

    return cfg


def has_schedule_c(cfg):
    return cfg.get('schedule_c') is not None


def get_year_data(cfg, year):
    """Get the per-year financial data for a tax year. Raises if not present."""
    if year not in cfg['years']:
        raise ConfigError(f"No data for tax year {year} in client config "
                          f"(available: {list(cfg['years'].keys())})")
    return cfg['years'][year]
