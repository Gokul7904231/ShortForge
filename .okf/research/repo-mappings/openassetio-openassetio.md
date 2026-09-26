# Repository Mapping: OpenAssetIO/OpenAssetIO

Status: selected F03 architecture reference
Adoption: logical asset identity and resolver boundary

OpenAssetIO describes media-pipeline interoperability around stable entity references rather than brittle file paths, with resolution into traits and related metadata.

F03 adoption:
- ReferenceBinding now carries an opaque entity_ref.
- References may carry version_selector and traits.
- F03 describes the asset identity; a downstream resolver decides where/how to obtain it.
- F03 never stores provider credentials or storage paths as semantic truth.

This gives ShortForge portable references while preserving provider neutrality.

URL: https://github.com/OpenAssetIO/OpenAssetIO
