"""
Security and Path Sandboxing for FactoryOS Render Engine.
Ensures file system operations remain within allowed project or scratch directories.
"""

import os
from pathlib import Path
from typing import Optional, List

class PathSandbox:
    @staticmethod
    def sanitize_path(target_path: str, allowed_roots: Optional[list] = None) -> str:
        """
        Resolves absolute path and rejects dangerous directory traversals.
        """
        abs_path = os.path.abspath(target_path)
        # Normalize Windows path separators
        norm = os.path.normpath(abs_path)

        if allowed_roots:
            is_allowed = any(
                norm.startswith(os.path.normpath(os.path.abspath(root)))
                for root in allowed_roots
            )
            if not is_allowed:
                raise PermissionError(f"Access denied: path '{target_path}' is outside allowed roots")

        return norm
