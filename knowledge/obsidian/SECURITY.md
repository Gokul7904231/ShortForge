---
id: shortforge-obsidian-security
type: Reference
title: ShortForge Obsidian Security Boundary
status: stable
sf_id: shortforge-obsidian-security
sf_lifecycle: active
sf_epistemic_state: sourced
sf_verification_state: verified
created_at: 2026-09-26T00:00:00Z
updated_at: 2026-09-26T00:00:00Z
tags:
  - obsidian
  - security
  - memory
---

# ShortForge Obsidian Security Boundary

## Rules

1. Never place secrets, API keys, tokens, private keys or customer PII into durable memory.
2. Raw sources are immutable from the perspective of the memory compiler.
3. Community plugins are optional and must be reviewed before enablement.
4. The Obsidian desktop application is not a production runtime dependency.
5. Obsidian content cannot mint FactoryOS capabilities.
6. Obsidian content cannot bypass Guardian, leases/fencing, CAS, F07 or ReleaseAuthorization.
7. Training eligibility requires deterministic evidence.
8. Headless Sync is only used on controlled automation hosts.
9. Git history is retained for review/rollback of knowledge.
10. Public Publish is never enabled for private engineering memory by default.

## Threat model

~~~text
Untrusted source
   ↓
secret scan
   ↓
raw/
   ↓
verification / provenance
   ↓
compiled memory
   ↓
Ascalon projection
~~~

The vault is a knowledge surface, not an execution sandbox.

## Plugin policy

Prefer Obsidian core plugins first. Community plugins are admitted only when:
- functionality is needed;
- source is auditable;
- permissions are understood;
- maintenance is acceptable;
- the plugin does not expand production authority.

Recommended optional extensions are documented in [[SETUP]].
