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
        """Line 9 is claimed, so generation must refuse until Fendi supplies
        the vehicle answers — it must never guess them."""
        with self.assertRaises(fpp.FormFillError) as ctx:
            generate_amendment_packet(self.original, self.amended, 2024)
        msg = str(ctx.exception)
        for field in ('date_placed_in_service', 'business_miles',
                      'commuting_miles', 'other_miles',
                      'available_for_personal_use'):
            self.assertIn(field, msg)

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
