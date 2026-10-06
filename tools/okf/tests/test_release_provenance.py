import json
import tempfile
import unittest
from pathlib import Path

from tools.okf.provenance import build_provenance, build_release_authorization_binding


class OKFReleaseProvenanceTests(unittest.TestCase):
    def _write_fixture(self, directory: Path) -> tuple[Path, Path, Path]:
        sweep = directory / "okf-sweep.json"
        drift = directory / "okf-drift.json"
        auth = directory / "release-authorization.json"

        sweep.write_text(json.dumps({
            "corpusSha256": "a" * 64,
            "envelopeSha256": "b" * 64,
            "relevantRules": ["OKF.RELEASE.F07_VERIFIED"],
            "okfSweep": "COMPLETE",
        }), encoding="utf-8")
        drift.write_text(json.dumps({
            "status": "PASS",
            "criticalHighRules": 16,
            "coveredCriticalHigh": 16,
        }), encoding="utf-8")
        auth.write_text(json.dumps({
            "authorizationId": "auth_yt_fixture",
            "issuedAt": "2026-10-06T05:00:00Z",
            "issuer": "F07_RELEASE_GUARDIAN",
            "authorizationVersion": 1,
            "nonce": "fixture-nonce",
            "receiptId": "rcpt_fixture",
            "receiptDigestSha256": "c" * 64,
            "receiptSignature": "d" * 128,
            "artifactId": "video-fixture",
            "artifactSha256": "e" * 64,
            "artifactCasRef": "cas://fixture",
            "targetChannelId": "channel-fixture",
            "targetPlatform": "youtube",
            "publicationIntentId": "pi_fixture",
            "publicationIntentHash": "f" * 64,
            "canonicalPayloadHash": "1" * 64,
            "scope": {
                "allowedPrivacy": "unlisted",
                "containsSyntheticMedia": True,
                "selfDeclaredMadeForKids": False,
                "title": "fixture",
            },
            "policySnapshotIds": ["youtube-policy-v1"],
            "evidenceVersion": "1.0",
            "status": "ACTIVE",
            "expiresAt": "2026-10-06T06:00:00Z",
            "signature": "a" * 128,
            "signerKeyId": "f07_guardian_root_v1",
        }), encoding="utf-8")
        return sweep, drift, auth

    def test_binds_real_release_authorization_shape_without_granting_authority(self):
        with tempfile.TemporaryDirectory() as tmp:
            sweep, drift, auth = self._write_fixture(Path(tmp))
            binding = build_release_authorization_binding(str(auth))
            self.assertEqual(binding["source"], "F07_RELEASE_AUTHORIZATION")
            self.assertEqual(binding["authorizationId"], "auth_yt_fixture")
            self.assertEqual(binding["receiptDigestSha256"], "c" * 64)
            self.assertEqual(binding["artifactSha256"], "e" * 64)
            self.assertEqual(binding["artifactCasRef"], "cas://fixture")
            self.assertEqual(binding["targetPlatform"], "youtube")
            self.assertTrue(binding["authorizationBodySha256"])

            provenance = build_provenance(str(sweep), str(drift), str(auth))
            self.assertIn("releaseAuthorizationBinding", provenance)
            self.assertEqual(
                provenance["releaseAuthorizationBinding"]["receiptId"],
                "rcpt_fixture",
            )
            self.assertFalse(provenance["productionReleaseEligible"])
            self.assertEqual(provenance["authority"], "EVIDENCE_ONLY")

    def test_rejects_non_f07_authorization(self):
        with tempfile.TemporaryDirectory() as tmp:
            _, _, auth = self._write_fixture(Path(tmp))
            raw = json.loads(auth.read_text(encoding="utf-8"))
            raw["issuer"] = "NOT_F07"
            auth.write_text(json.dumps(raw), encoding="utf-8")
            with self.assertRaises(ValueError):
                build_release_authorization_binding(str(auth))

    def test_rejects_invalidated_authorization(self):
        with tempfile.TemporaryDirectory() as tmp:
            _, _, auth = self._write_fixture(Path(tmp))
            raw = json.loads(auth.read_text(encoding="utf-8"))
            raw["status"] = "INVALIDATED"
            auth.write_text(json.dumps(raw), encoding="utf-8")
            with self.assertRaises(ValueError):
                build_release_authorization_binding(str(auth))


if __name__ == "__main__":
    unittest.main()
