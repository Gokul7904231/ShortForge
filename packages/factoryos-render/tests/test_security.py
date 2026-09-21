import unittest
import os
from factoryos_render.security.paths import PathSandbox

class TestSecurity(unittest.TestCase):
    def test_sanitize_path_allows_valid_subpath(self):
        cwd = os.path.abspath(".")
        sub = os.path.join(cwd, "output.mp4")
        norm = PathSandbox.sanitize_path(sub, allowed_roots=[cwd])
        self.assertEqual(norm, os.path.normpath(sub))

    def test_sanitize_path_rejects_outside_path(self):
        cwd = os.path.abspath(".")
        outside = "C:\\Windows\\System32\\cmd.exe" if os.name == "nt" else "/etc/passwd"
        with self.assertRaises(PermissionError):
            PathSandbox.sanitize_path(outside, allowed_roots=[cwd])

if __name__ == "__main__":
    unittest.main()
