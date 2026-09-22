# Canonical Development Loop (Inspired by affaan-m/ECC)

```
REQUEST
  ↓
INSPECT (Check existing code, architecture, and tests)
  ↓
MAP (Create internal mapping from existing concepts to change points)
  ↓
PLAN (Formulate minimal bounded change plan)
  ↓
IMPLEMENT (Execute clean-room changes)
  ↓
TEST (Run canonical testing system)
  ↓
OBSERVE (Collect events and physical disk state)
  ↓
GRAPH (Construct MissionGraph & EvidenceGraph)
  ↓
EVIDENCE (Ground all claims with physical digests)
  ↓
REVIEW (Audit findings and hard gate scores)
  ↓
VERIFY (Run authoritative verification gates)
  ↓
.OFK RECORD (Update repository mappings if research used)
  ↓
DONE
```
