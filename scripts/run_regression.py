"""Regression suite for the fill pipeline.

Run:  python3 scripts/run_regression.py

Covers CLAUDE.md roadmap item 8. Every case generates a real packet and puts
it through the reconciliation gate, so a LINE_MAPS edit that moves a value into
the wrong box fails here rather than in the mail.

Deliberately NOT covered: regenerating the frozen Pasta Pals 2024 return. That
file shipped to the client and is frozen at md5 69d6775e0a40d2f9c8ed1cb387d7c7a1
(CLAUDE.md invariant 1). The suite asserts the 2024 code paths are correct using
the synthetic client instead.
"""
import copy
import sys
import unittest
from pathlib import Path

REPO = Path(__file__).parent.parent
sys.path.insert(0, str(REPO))
sys.path.insert(0, str(REPO / 'scripts'))

from taxgenerator.config import load_client                      # noqa: E402
from taxgenerator.forms import (generate_packet,                 # noqa: E402
                                generate_amendment_packet)
from taxgenerator.reconcile import ReconcileError, FormReader     # noqa: E402
import fill_pasta_pals_python as fpp                              # noqa: E402

CLIENTS = REPO / 'clients'

# Sentinel: this map key was absent before the test put one there.
_ABSENT = object()

# Vehicle answers used ONLY to exercise the Jacques amendment end to end. The
# real client config must carry the taxpayer's own answers before anything is
# filed; see _schc_part_iv_draws, which refuses to invent them.
TEST_VEHICLE = {
    'date_placed_in_service': '2024-01-01',
    'business_miles': 60000,
    'commuting_miles': 0,
    'other_miles': 0,
    'available_for_personal_use': 'yes',
    'another_vehicle_available': 'no',
    'have_evidence': 'yes',
    'evidence_written': 'yes',
}


def schedule_c_of(parts_or_pdf, year):
    """Open a Schedule C FormReader over the generated Schedule C bytes."""
    return FormReader('1040sc', year, parts_or_pdf)


class FieldMapAudit(unittest.TestCase):
    """Every mapped money line must match the printed label on the template."""

    def test_line_maps_match_printed_labels(self):
        import verify_field_map
        self.assertEqual(
            verify_field_map.main(['verify_field_map']), 0,
            'scripts/verify_field_map.py reported a leaf that does not match '
            'its printed IRS label')


class SyntheticAllLines(unittest.TestCase):
    """A client that uses every Part II line, Part IV and a full Part V."""

    @classmethod
    def setUpClass(cls):
        cls.cfg = load_client(CLIENTS / '_synthetic_all_lines.json')

    def _generate(self, year):
        pdf, report = generate_packet(copy.deepcopy(self.cfg), year)
        self.assertIn('RESULT: PASS', report)
        return report

    def test_2024_every_line_prints(self):
        report = self._generate(2024)
        # 2024: Part V total belongs on 27a, energy-efficient on 27b.
        self.assertIn('p1.L27a                43,245         43,245  ok', report)
        self.assertIn('p1.L27b                 2,702          2,702  ok', report)
        # Net profit in the line 31 box, not the square-footage box.
        self.assertIn('p1.L31                412,727        412,727  ok', report)
        # Line 29 and line 31 differ because home office is claimed.
        self.assertIn('p1.L29                415,728        415,728  ok', report)
        self.assertIn('p1.L30                  3,001          3,001  ok', report)
        # Part IV filled.
        self.assertIn('p2.L44a                12,345         12,345  ok', report)
        self.assertIn('p2.L45_yes                  X              X  ok', report)

    def test_2025_27a_27b_are_swapped_relative_to_2024(self):
        report = self._generate(2025)
        # 2025: the IRS swapped them — other expenses on 27b, 7205 on 27a.
        self.assertIn('p1.L27b                43,245         43,245  ok', report)
        self.assertIn('p1.L27a                 2,702          2,702  ok', report)

    def test_every_part_ii_line_is_mapped_for_both_years(self):
        for year in (2024, 2025):
            registry = fpp.schc_part_ii_lines(year)
            for key, line_key in registry.items():
                self.assertIsNotNone(
                    fpp.get_rect('1040sc', year, line_key),
                    f'{year}: {key} -> {line_key} has no leaf in LINE_MAPS')


class PastaPals2025(unittest.TestCase):
    """The live 2025 return still reconciles after the Schedule C rework."""

    def test_generates_and_reconciles(self):
        cfg = load_client(CLIENTS / 'pasta_pals.json')
        pdf, report = generate_packet(cfg, 2025)
        self.assertIn('RESULT: PASS', report)
        self.assertGreater(len(pdf), 100_000)


class Jacques2024Amendment(unittest.TestCase):
    """The return that drew the IRS math-error notice."""

    def setUp(self):
        self.original = load_client(CLIENTS / 'jacques_potts_original.json')
        self.amended = load_client(CLIENTS / 'jacques_potts.json')

    def test_part_iv_is_required_and_not_invented(self):
        """With no vehicle block at all, generation must refuse and name every
        missing field — it must never guess the taxpayer's answers."""
        amended = copy.deepcopy(self.amended)
        amended['years'][2024]['schedule_c'].pop('vehicle', None)
        with self.assertRaises(fpp.FormFillError) as ctx:
            generate_amendment_packet(self.original, amended, 2024)
        msg = str(ctx.exception)
        for field in ('date_placed_in_service', 'business_miles',
                      'commuting_miles', 'other_miles',
                      'available_for_personal_use'):
            self.assertIn(field, msg)

    def test_omitting_part_iv_requires_a_written_reason(self):
        """A blank Part IV is allowed, but only as a recorded decision."""
        amended = copy.deepcopy(self.amended)
        amended['years'][2024]['schedule_c']['vehicle'] = {'omitted': True}
        with self.assertRaises(fpp.FormFillError) as ctx:
            generate_amendment_packet(self.original, amended, 2024)
        self.assertIn('reason', str(ctx.exception))

    def test_part_iv_omitted_as_filed_reconciles(self):
        """The shipping configuration: Part IV blank, as on the filed return,
        because the IRS did not ask for it. The reason must reach the report."""
        pdf, report = generate_amendment_packet(
            self.original, self.amended, 2024)
        self.assertIn('RESULT: PASS', report)
        self.assertIn('Recorded decisions', report)
        self.assertIn('Part IV', report)
        # The four figures the IRS changed still print where it can see them.
        self.assertIn('p1.L9                  40,200         40,200  ok', report)
        self.assertIn('p1.L31                  2,869          2,869  ok', report)

    def test_schedule_2_is_now_read_back(self):
        """Schedule 2 carries SE tax to total tax and used to sit outside the
        gate entirely."""
        pdf, report = generate_amendment_packet(
            self.original, self.amended, 2024)
        self.assertIn('1040s2', report)
        self.assertIn('p1.L4', report)

    def test_reconciles_once_vehicle_answers_exist(self):
        amended = copy.deepcopy(self.amended)
        amended['years'][2024]['schedule_c']['vehicle'] = dict(TEST_VEHICLE)
        pdf, report = generate_amendment_packet(self.original, amended, 2024)
        self.assertIn('RESULT: PASS', report)

        # The four figures the IRS changed must now print where it can see them.
        self.assertIn('p1.L9                  40,200         40,200  ok', report)
        self.assertIn('p1.L23                  1,015          1,015  ok', report)
        self.assertIn('p1.L27a                   244            244  ok', report)
        self.assertIn('p1.L31                  2,869          2,869  ok', report)
        # Schedule 1's total-adjustments line, previously printed on 24g.
        self.assertIn('p2.L26                    203            203  ok', report)
        # Printed Part II now accounts for the whole of line 28.
        self.assertIn('printed Part II lines sum to 68,631; line 28 reads 68,631',
                      report)


class GateCatchesTheOriginalDefects(unittest.TestCase):
    """Re-introduce each shipped defect and prove the gate refuses it.

    Without this, the gate could silently stop working and nobody would know
    until another notice arrived.
    """

    def setUp(self):
        self.cfg = load_client(CLIENTS / '_synthetic_all_lines.json')
        self._saved = {}

    def tearDown(self):
        for (form, year, key), leaf in self._saved.items():
            fpp.LINE_MAPS[(form, year)][key] = leaf
        fpp._FIELD_CACHE.clear()

    def _remap(self, form, year, key, leaf):
        self._saved[(form, year, key)] = fpp.LINE_MAPS[(form, year)][key]
        fpp.LINE_MAPS[(form, year)][key] = leaf

    def test_net_profit_in_the_square_footage_box_is_caught(self):
        # The exact defect on the filed Jacques return: line 31 -> f1_44_0.
        self._remap('1040sc', 2024, 'p1.L31', 'f1_44_0')
        with self.assertRaises(ReconcileError) as ctx:
            generate_packet(copy.deepcopy(self.cfg), 2024)
        self.assertTrue(
            any('p1.L31' in str(f) for f in ctx.exception.findings),
            f'gate did not flag line 31: {[str(f) for f in ctx.exception.findings]}')

    def test_half_se_on_schedule_1_line_24g_is_caught(self):
        self._remap('1040s1', 2024, 'p2.L26', 'f2_22_0')
        with self.assertRaises(ReconcileError) as ctx:
            generate_packet(copy.deepcopy(self.cfg), 2024)
        self.assertTrue(any('p2.L26' in str(f) or '24g' in str(f)
                            for f in ctx.exception.findings))

    def test_a_dropped_expense_line_is_caught(self):
        """Simulate the old hand-picked-subset filler: drop line 23 from the
        registry and confirm the packet is refused rather than shipped."""
        registry = fpp.SCHC_PART_II_LINES[2024]
        saved = registry.pop('L23_taxes_licenses')
        try:
            with self.assertRaises(fpp.FormFillError) as ctx:
                generate_packet(copy.deepcopy(self.cfg), 2024)
            self.assertIn('L23_taxes_licenses', str(ctx.exception))
        finally:
            registry['L23_taxes_licenses'] = saved


class GateCatchesWrongBoxDefects(unittest.TestCase):
    """Defects where a figure or an answer lands in the wrong box.

    These all passed the gate until 2026-11-10. Each is a figure printed
    somewhere the IRS does not read it, with arithmetic that still ties out —
    the same shape as the defect that drew the Letter 474C assessment, which is
    why none of them could be allowed to stay invisible.

    The label check used to ask only whether the claimed line number appeared
    somewhere near the box, in a band that reached three or four printed rows.
    Pointing every mapped line at every other box on its page, that rule
    accepted 97 of 2,852 wrong boxes. It now accepts none.
    """

    def setUp(self):
        self.cfg = load_client(CLIENTS / '_synthetic_all_lines.json')
        self.original = load_client(CLIENTS / 'jacques_potts_original.json')
        self.amended = load_client(CLIENTS / 'jacques_potts.json')
        self._saved = {}
        self._saved_grid = {}

    def tearDown(self):
        import fill_1040x_2024 as f1040x
        for (form, year, key), leaf in self._saved.items():
            fpp.LINE_MAPS[(form, year)][key] = leaf
        for line, triple in self._saved_grid.items():
            if triple is _ABSENT:
                f1040x.GRID_LEAVES.pop(line, None)
            else:
                f1040x.GRID_LEAVES[line] = triple
        fpp._FIELD_CACHE.clear()

    def _remap(self, form, year, key, leaf):
        self._saved[(form, year, key)] = fpp.LINE_MAPS[(form, year)][key]
        fpp.LINE_MAPS[(form, year)][key] = leaf

    def _leaf(self, form, year, key):
        return fpp.LINE_MAPS[(form, year)][key]

    def _regrid(self, line, triple):
        import fill_1040x_2024 as f1040x
        self._saved_grid[line] = f1040x.GRID_LEAVES.get(line, _ABSENT)
        if triple is _ABSENT:
            f1040x.GRID_LEAVES.pop(line, None)
        else:
            f1040x.GRID_LEAVES[line] = triple

    def _details(self, findings):
        return ' | '.join(str(f) for f in findings)

    # ── Schedule C: a figure in the neighbouring line's box ──────────────────
    def test_car_and_truck_in_the_commissions_box_is_caught(self):
        """Line 9 pointed at line 10's box. Line 10 is zero for this client, so
        Part II still sums to line 28 and every arithmetic check passes."""
        self._remap('1040sc', 2024, 'p1.L9',
                    self._leaf('1040sc', 2024, 'p1.L10'))
        with self.assertRaises(ReconcileError) as ctx:
            generate_packet(copy.deepcopy(self.cfg), 2024)
        detail = self._details(ctx.exception.findings)
        self.assertIn('p1.L9', detail)
        self.assertIn('"10"', detail)

    # ── Schedule C: an answer against the wrong option ───────────────────────
    def test_a_yes_box_swapped_for_its_no_box_is_caught(self):
        """Both boxes share question I's row, so a phrase check cannot tell
        them apart: the form would state the opposite of what was intended."""
        self._remap('1040sc', 2024, 'p1.I_yes',
                    self._leaf('1040sc', 2024, 'p1.I_no'))
        with self.assertRaises(ReconcileError) as ctx:
            generate_packet(copy.deepcopy(self.cfg), 2024)
        detail = self._details(ctx.exception.findings)
        self.assertIn('p1.I_yes', detail)
        self.assertIn('No', detail)

    def test_accounting_method_box_swap_is_caught(self):
        self._remap('1040sc', 2024, 'p1.F_cash',
                    self._leaf('1040sc', 2024, 'p1.F_accrual'))
        with self.assertRaises(ReconcileError) as ctx:
            generate_packet(copy.deepcopy(self.cfg), 2024)
        detail = self._details(ctx.exception.findings)
        self.assertIn('p1.F_cash', detail)
        self.assertIn('Accrual', detail)

    def test_date_cells_out_of_order_are_caught(self):
        """The three line 43 cells carry no label of their own, so only their
        printed order keeps the month out of the year's box."""
        month = self._leaf('1040sc', 2024, 'p2.L43_month')
        year_cell = self._leaf('1040sc', 2024, 'p2.L43_year')
        self._remap('1040sc', 2024, 'p2.L43_month', year_cell)
        self._remap('1040sc', 2024, 'p2.L43_year', month)
        with self.assertRaises(ReconcileError) as ctx:
            generate_packet(copy.deepcopy(self.cfg), 2024)
        self.assertIn('date cells', self._details(ctx.exception.findings))

    # ── Form 1040-X: the grid the IRS keys in ───────────────────────────────
    def test_total_tax_in_the_reserved_line_9_box_is_caught(self):
        """Line 11 column C pointed at line 9's box. The old column check read
        the figure back through the same leaf it was drawn with, so it printed
        the total tax on a reserved line and reported "ok"."""
        import fill_1040x_2024 as f1040x
        a, b, _c = f1040x.GRID_LEAVES['11']
        self._regrid('11', (a, b, 'f1_48_0'))
        with self.assertRaises(ReconcileError) as ctx:
            generate_amendment_packet(self.original, self.amended, 2024)
        detail = self._details(ctx.exception.findings)
        self.assertIn('line 11', detail)
        self.assertIn('line 9', detail)
        self.assertIn('reserved', detail)

    def test_a_1040x_line_with_no_leaf_raises(self):
        """A figure with nowhere to print used to be skipped in silence."""
        self._regrid('11', _ABSENT)
        with self.assertRaises(fpp.FormFillError) as ctx:
            generate_amendment_packet(self.original, self.amended, 2024)
        self.assertIn('line 11', str(ctx.exception))
        self.assertIn('print', str(ctx.exception))

    def test_a_1040x_leaf_that_is_not_a_widget_raises(self):
        import fill_1040x_2024 as f1040x
        a, b, _c = f1040x.GRID_LEAVES['11']
        self._regrid('11', (a, b, 'f1_999_0'))
        with self.assertRaises(fpp.FormFillError) as ctx:
            generate_amendment_packet(self.original, self.amended, 2024)
        self.assertIn('f1_999_0', str(ctx.exception))

    # ── A blank box is not a zero ───────────────────────────────────────────
    def test_an_empty_box_reads_as_blank_not_zero(self):
        """parse_money reports 0 for an empty box, which is right for summing
        and wrong for a read-back: it made the column report claim figures were
        printed in boxes that are empty."""
        from taxgenerator.reconcile import parse_money, parse_money_strict
        self.assertEqual(parse_money(''), 0)
        self.assertIsNone(parse_money_strict(''))
        self.assertEqual(parse_money_strict('406'), 406)
        _pdf, report = generate_amendment_packet(
            self.original, self.amended, 2024)
        # Line 2 column B is genuinely empty: the deduction did not change.
        self.assertIn('2           14,600      (blank)       14,600', report)

    def test_the_1040x_grid_is_located_without_the_leaf_map(self):
        """The column report must find its figures by the line number printed
        beside them, so that it cannot agree with a wrong leaf."""
        from taxgenerator.reconcile import read_1040x_grid
        pdf, _report = generate_amendment_packet(
            self.original, self.amended, 2024)
        printed, labels, unplaced = read_1040x_grid(pdf)
        self.assertEqual(unplaced, [], f'unplaced figures: {unplaced}')
        self.assertIn(('11', 'c'), printed)
        self.assertEqual(printed[('11', 'c')], 406)
        self.assertEqual(printed[('1', 'c')], 2666)
        self.assertNotIn(('9', 'c'), printed)   # reserved row stays empty
        self.assertGreaterEqual(len(labels), 20)


class FrozenReturnUntouched(unittest.TestCase):
    """The Pasta Pals 2024 return shipped to the client and is frozen."""

    FROZEN_MD5 = '69d6775e0a40d2f9c8ed1cb387d7c7a1'

    def test_frozen_2024_pdf_is_unchanged_if_present(self):
        import hashlib
        path = REPO / 'dist' / 'Pasta_Pals_2024_RETURN.pdf'
        if not path.exists():
            self.skipTest(f'{path} not present in this checkout — nothing to '
                          'compare. The frozen copy lives outside the repo.')
        got = hashlib.md5(path.read_bytes()).hexdigest()
        self.assertEqual(
            got, self.FROZEN_MD5,
            'the frozen 2024 Pasta Pals return has been rewritten (CLAUDE.md '
            'invariant 1). Restore it; do not regenerate it.')


if __name__ == '__main__':
    unittest.main(verbosity=2)
