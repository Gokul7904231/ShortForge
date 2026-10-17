import unittest
from datetime import datetime, timezone, timedelta

from tools.okf.drift import DIGESTS, check_exceptions, check_rule_coverage, check_source_digest_pair, check_source_drift, load_rules, validate_exception_data
from tools.okf.sweep import RULE_INDEX, validate_rules

class OKFControlPlaneTests(unittest.TestCase):
    def test_rule_index_exists_and_is_valid(self):
        self.assertTrue(RULE_INDEX.exists())
        errors=validate_rules(load_rules())
        self.assertEqual(errors,[],errors)

    def test_critical_high_rules_have_verification_bindings(self):
        self.assertEqual(check_rule_coverage(load_rules()),[])

    def test_source_digest_snapshot_is_present_and_current(self):
        self.assertTrue(DIGESTS.exists())
        self.assertEqual(check_source_drift(load_rules()),[])

    def test_missing_verification_binding_is_rejected(self):
        rules=[dict(load_rules()[0])]
        rules[0].pop('verificationRefs',None)
        self.assertTrue(check_rule_coverage(rules))

    def test_source_drift_is_rejected(self):
        source='.okf/principles.md'
        errors=check_source_digest_pair(DIGESTS.parent.parent.parent / source,'0'*40)
        self.assertIsNotNone(errors)

    def test_expired_approved_exception_is_rejected(self):
        now=datetime(2026,10,5,12,0,tzinfo=timezone.utc)
        record={'exceptionId':'EXC-TEST-EXPIRY','ruleRefs':['OKF.PROCESS.FULL_SWEEP'],'scope':{'paths':['**']},'approver':'Human/Overseer','startsAt':'2026-10-04T12:00:00Z','expiresAt':'2026-10-05T11:00:00Z','compensatingControls':['temporary manual gate'],'closureEvidence':[],'status':'APPROVED'}
        errors=validate_exception_data(record,'fixture',now)
        self.assertTrue(any('expired' in e for e in errors))

    def test_open_exception_is_not_authorization(self):
        now=datetime.now(timezone.utc)
        record={'exceptionId':'EXC-TEST-OPEN','ruleRefs':['OKF.PROCESS.FULL_SWEEP'],'scope':{'paths':['**']},'approver':'Human/Overseer','startsAt':(now-timedelta(minutes=1)).isoformat(),'expiresAt':(now+timedelta(hours=1)).isoformat(),'compensatingControls':['temporary manual gate'],'closureEvidence':[],'status':'OPEN'}
        errors=validate_exception_data(record,'fixture',now)
        self.assertTrue(any('not an authorization' in e for e in errors))

    def test_current_exceptions_are_valid(self):
        self.assertEqual(check_exceptions(),[])

if __name__=='__main__':
    unittest.main()
