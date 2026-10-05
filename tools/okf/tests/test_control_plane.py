import unittest
from pathlib import Path

from tools.okf.drift import DIGESTS, check_exceptions, check_rule_coverage, check_source_drift, load_rules
from tools.okf.sweep import RULE_INDEX, validate_rules

class OKFControlPlaneTests(unittest.TestCase):
    def test_rule_index_exists_and_is_valid(self):
        self.assertTrue(RULE_INDEX.exists())
        errors=validate_rules(load_rules())
        self.assertEqual(errors,[],errors)

    def test_critical_high_rules_have_verification_bindings(self):
        errors=check_rule_coverage(load_rules())
        self.assertEqual(errors,[],errors)

    def test_source_digest_snapshot_is_present_and_current(self):
        self.assertTrue(DIGESTS.exists())
        errors=check_source_drift(load_rules())
        self.assertEqual(errors,[],errors)

    def test_governance_exceptions_are_not_expired_or_unauthorized(self):
        errors=check_exceptions()
        self.assertEqual(errors,[],errors)

if __name__=='__main__':
    unittest.main()
