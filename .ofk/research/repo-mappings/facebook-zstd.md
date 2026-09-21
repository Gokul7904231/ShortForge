# Repository Mapping: facebook/zstd

- **Repository**: `facebook/zstd` (Zstandard Compression Algorithm)
- **URL**: `https://github.com/facebook/zstd`
- **Owner**: `facebook`
- **Reviewed Version**: `v1.5.6` (Snapshot 2026)
- **Date Studied**: `2026-09-09`
- **Upstream License**: `BSD-3-Clause / GPL-2.0`
- **Adoption Mode**: `PATTERN_EXTRACTION`
- **Implementation Status**: `ABSTRACTED_DEFERRED`

---

## 1. Problem Solved
Long-running agent systems generate massive volumes of telemetry, durable event bus logs, trajectory datasets, and mission history snapshots, creating disk and memory bloat if stored as uncompressed JSON.

## 2. Important Mechanisms
- Fast real-time compression with high compression ratios and ultra-fast decompression speed.
- Dictionary training for repetitive structured JSON schemas.
- Frame-based streaming compression.

## 3. FactoryOS Mapping
- **FactoryOS Concept**: Historical Mission & Telemetry Compression Boundary.
- **FactoryOS Destination**:
  - `apps/web/factoryos/core/database/HistoryCompressionProvider.ts` (Interface & passthrough boundary)
- **Existing Agents/Capabilities Affected**:
  - `ProductionHistoryStore` / `MissionManager`: Archive storage of completed missions.
  - `DurableEventBus`: Long-term cold storage of historical event streams.

## 4. What Was Adopted
- Clean provider interface: `IHistoryCompressionProvider { compress(data: Buffer | string): Promise<Buffer>; decompress(buffer: Buffer): Promise<Buffer>; }`.
- Default lightweight passthrough and native Node.js zlib/gzip fallback during Phase 1.

## 5. What Was NOT Adopted
- Did NOT install heavy native C++ bindings for Zstandard into live production web application before storage volume demands it.
- Did NOT compress hot runtime state in `WorldStateEngine` (which must remain fast, transparent, and debuggable).

## 6. Security & Licensing Considerations
- BSD-3-Clause license is business-friendly.
- C++ bindings introduce native compilation risks on Windows/Linux; isolated behind TypeScript interface so it can be enabled when required.

## 7. Validation Performed
- Validated `HistoryCompressionProvider` interface contracts with JSON serialization and deserialization tests.
