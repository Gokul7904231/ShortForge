# Repository Mapping: microsoft/markitdown

- **Repository**: `microsoft/markitdown`
- **URL**: `https://github.com/microsoft/markitdown`
- **Owner**: `microsoft`
- **Reviewed Version**: `v0.0.1a4` (Snapshot 2026)
- **Date Studied**: `2026-09-09`
- **Upstream License**: `MIT`
- **Adoption Mode**: `ISOLATED_PROVIDER`
- **Implementation Status**: `ABSTRACTED_DEFERRED`

---

## 1. Problem Solved
Multi-modal document formats (PDF, DOCX, PPTX, XLSX, HTML, images with EXIF) need consistent normalization into clean, structured Markdown for text extraction, fact extraction, and RAG ingestion.

## 2. Important Mechanisms
- Unified document-to-markdown conversion pipelines.
- Multi-engine format parsing with fallback text extraction.
- Structured preservation of tables, headings, lists, and metadata.

## 3. FactoryOS Mapping
- **FactoryOS Concept**: Document Normalization Boundary.
- **FactoryOS Destination**:
  - `apps/web/factoryos/core/research/DocumentNormalizer.ts` (Interface & safe mock/clean-room boundary)
- **Existing Agents/Capabilities Affected**:
  - `ResearchRuntime` (Floor 00 Analyst): External document and whitepaper digestion.
  - `ExternalEvidenceRetriever`: Normalization of external research documents into grounded claims.

## 4. What Was Adopted
- Clean interface design: `DocumentNormalizer.normalize(source, options): Promise<NormalizedDocument>`.
- Isolation boundary: MarkItDown operates as an untrusted subprocess or worker, preventing file disclosure or SSRF.

## 5. What Was NOT Adopted
- Did NOT install python `markitdown` package into core Node/Next.js production runtime.
- Did NOT grant direct file-system execution access to arbitrary untrusted document streams.
- Deferred full Python worker integration until complex multi-format document RAG is required in production.

## 6. Security & Licensing Considerations
- MIT License.
- Security Boundary: Document conversion runs with strict timeout, byte-length caps, and path sanitization to prevent memory exhaustion and path traversal.

## 7. Validation Performed
- Validated `DocumentNormalizer` interface with test inputs, preserving Markdown structure and extracting metadata safely.
