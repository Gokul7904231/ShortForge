#!/usr/bin/env python3
"""
Unit & Integration Tests for FactoryOS Delivery Contract & Drive Provider
========================================================================
Validates:
1. Google Drive OAuth vs Service Account Shared Drive provider logic
2. Triple-Key appProperties + SHA-256 idempotency reuse
3. Strict DeliveryTarget contract & explicit fallback audit trail
4. Error taxonomy & retryable classification
5. Zero-leakage error sanitization
6. Secret hygiene regression checks
"""

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

# Ensure services/rendering-engine root is on sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from worker_daemon import (
    handle_delivery,
    compute_sha256,
    DriveAuthenticationError,
    DriveFolderError,
    DriveQuotaError,
    DriveDeliveryError,
)

class TestStrictDeliveryContract(unittest.TestCase):
    def setUp(self):
        self.test_dir = Path(__file__).parent / "scratch_test"
        self.test_dir.mkdir(parents=True, exist_ok=True)
        self.dummy_mp4 = self.test_dir / "test_video.mp4"
        self.dummy_mp4.write_bytes(b"TEST_MP4_BINARY_DATA_FOR_SHA256_HASHING_" * 5000)
        self.sha256 = compute_sha256(self.dummy_mp4)
        self.meta = {"sizeBytes": self.dummy_mp4.stat().st_size, "sizeMb": 0.2, "durationSeconds": 15.0}

    def tearDown(self):
        import shutil
        import gc
        gc.collect()
        if self.test_dir.exists():
            shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_sha256_calculation_deterministic(self):
        sha1 = compute_sha256(self.dummy_mp4)
        sha2 = compute_sha256(self.dummy_mp4)
        self.assertEqual(sha1, sha2)
        self.assertEqual(len(sha1), 64)

    @patch("worker_daemon.GoogleDriveDeliveryProvider.get_credentials")
    @patch("googleapiclient.discovery.build")
    def test_oauth_user_my_drive_delivery_success(self, mock_build, mock_get_creds):
        mock_creds = MagicMock()
        mock_get_creds.return_value = mock_creds

        mock_drive = MagicMock()
        mock_build.return_value = mock_drive

        # 1. Folder Check Mock
        mock_drive.files().get().execute.return_value = {
            "id": "folder_123",
            "name": "FactoryOS Renders",
            "mimeType": "application/vnd.google-apps.folder",
            "trashed": False,
        }

        # 2. Idempotency List Mock (empty initially)
        mock_drive.files().list().execute.return_value = {"files": []}

        # 3. Create File Mock
        mock_drive.files().create().execute.return_value = {
            "id": "1RealDriveFileId",
            "name": "job_123_Test.mp4",
            "mimeType": "video/mp4",
            "size": str(self.dummy_mp4.stat().st_size),
            "webViewLink": "https://drive.google.com/file/d/1RealDriveFileId/view",
            "webContentLink": "https://drive.google.com/uc?id=1RealDriveFileId",
            "createdTime": "2026-08-23T10:00:00Z",
        }

        with patch.dict(os.environ, {"GOOGLE_DRIVE_FOLDER_ID": "folder_123"}):
            job = {
                "jobId": "job_123",
                "topic": "Test Short",
                "delivery": {
                    "target": "GOOGLE_DRIVE",
                    "authMode": "OAUTH_USER",
                    "artifactVersion": "v1",
                    "allowFallback": False,
                }
            }
            res = handle_delivery(job, self.dummy_mp4, self.meta, self.sha256)

        self.assertEqual(res["provider"], "google_drive")
        self.assertEqual(res["driveFileId"], "1RealDriveFileId")
        self.assertEqual(res["artifactSha256"], self.sha256)
        self.assertFalse(res["idempotentReused"])

    @patch("worker_daemon.GoogleDriveDeliveryProvider.get_credentials")
    @patch("googleapiclient.discovery.build")
    def test_triple_key_idempotency_reuse(self, mock_build, mock_get_creds):
        mock_creds = MagicMock()
        mock_get_creds.return_value = mock_creds

        mock_drive = MagicMock()
        mock_build.return_value = mock_drive

        # Folder check
        mock_drive.files().get().execute.return_value = {
            "id": "folder_123",
            "name": "Renders",
            "mimeType": "application/vnd.google-apps.folder",
            "trashed": False,
        }

        # Existing file with matching appProperties
        mock_drive.files().list().execute.return_value = {
            "files": [{
                "id": "1ExistingId",
                "name": "job_existing_Test.mp4",
                "mimeType": "video/mp4",
                "size": str(self.dummy_mp4.stat().st_size),
                "webViewLink": "https://drive.google.com/file/d/1ExistingId/view",
                "createdTime": "2026-08-23T09:00:00Z",
                "appProperties": {
                    "factoryosJobId": "job_existing",
                    "factoryosArtifactVersion": "v1",
                    "factoryosSha256": self.sha256,
                }
            }]
        }

        with patch.dict(os.environ, {"GOOGLE_DRIVE_FOLDER_ID": "folder_123"}):
            job = {
                "jobId": "job_existing",
                "topic": "Test Short",
                "delivery": {
                    "target": "GOOGLE_DRIVE",
                    "artifactVersion": "v1",
                    "allowFallback": False,
                }
            }
            res = handle_delivery(job, self.dummy_mp4, self.meta, self.sha256)

        self.assertEqual(res["driveFileId"], "1ExistingId")
        self.assertTrue(res["idempotentReused"])
        # Should not have called create()
        mock_drive.files().create.assert_not_called()

    @patch("worker_daemon.GoogleDriveDeliveryProvider.deliver")
    def test_strict_contract_failure_when_fallback_is_false(self, mock_deliver):
        mock_deliver.side_effect = DriveDeliveryError("Google Drive upload failed", http_status=500, retryable=True)

        job = {
            "jobId": "job_fail",
            "delivery": {
                "target": "GOOGLE_DRIVE",
                "allowFallback": False,
            }
        }

        with self.assertRaises(DriveDeliveryError):
            handle_delivery(job, self.dummy_mp4, self.meta, self.sha256)

    @patch("worker_daemon.GoogleDriveDeliveryProvider.deliver")
    @patch("worker_daemon.deliver_to_cloudinary")
    def test_strict_contract_routes_to_fallback_when_explicitly_configured(self, mock_cloud, mock_drive_deliver):
        mock_drive_deliver.side_effect = DriveDeliveryError("Google Drive API unavailable", http_status=503, retryable=True)
        mock_cloud.return_value = {
            "provider": "cloudinary",
            "videoUrl": "https://res.cloudinary.com/demo/video/upload/job_fallback.mp4",
            "publicId": "job_fallback",
            "sizeBytes": 5000,
        }

        job = {
            "jobId": "job_fallback",
            "delivery": {
                "target": "GOOGLE_DRIVE",
                "allowFallback": {
                    "target": "CLOUDINARY",
                    "reason": "User requested backup delivery on failure",
                },
            }
        }

        res = handle_delivery(job, self.dummy_mp4, self.meta, self.sha256)
        self.assertEqual(res["provider"], "cloudinary")
        self.assertTrue(res["fallbackUsed"])
        self.assertEqual(res["originalTarget"], "GOOGLE_DRIVE")
        self.assertEqual(res["actualTarget"], "CLOUDINARY")
        self.assertEqual(res["fallbackReason"], "User requested backup delivery on failure")

    def test_error_taxonomy_retryable_classification(self):
        auth_err = DriveAuthenticationError("Invalid credentials", http_status=401)
        self.assertFalse(auth_err.retryable)
        self.assertEqual(auth_err.code, "DRIVE_AUTH_ERROR")

        quota_err = DriveQuotaError("Quota exceeded", http_status=403)
        self.assertFalse(quota_err.retryable)
        self.assertEqual(quota_err.code, "DRIVE_QUOTA_ERROR")

        folder_err = DriveFolderError("Folder not found", http_status=404)
        self.assertFalse(folder_err.retryable)

        transient_err = DriveDeliveryError("Rate limit exceeded", http_status=429, retryable=True)
        self.assertTrue(transient_err.retryable)

        safe_dict = transient_err.to_safe_dict()
        self.assertEqual(safe_dict["code"], "DRIVE_DELIVERY_ERROR")
        self.assertEqual(safe_dict["httpStatus"], 429)
        self.assertTrue(safe_dict["retryable"])
        self.assertIn("credentialVersion", safe_dict)
        # Verify no token fields present in safe dictionary
        self.assertNotIn("access_token", safe_dict)
        self.assertNotIn("refresh_token", safe_dict)
        self.assertNotIn("client_secret", safe_dict)

    def test_no_default_secret_string_in_codebase(self):
        """Regression test ensuring old hardcoded worker secret fallback does not exist in production code."""
        with open(BASE_DIR / "worker_daemon.py", "r", encoding="utf-8") as f:
            content = f.read()
        self.assertNotIn("factoryos-render-worker-secret-key-2026", content)

if __name__ == "__main__":
    unittest.main()
