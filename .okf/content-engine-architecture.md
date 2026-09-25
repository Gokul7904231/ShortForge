# Content Engine -> Configuration Schema -> ProductionSpec

Document Class: Canonical Content Engine Architecture Specification  
Status: IMPLEMENTED / PARTIALLY-ROLLED-OUT BY ENGINE  
Primary implementation:
- apps/web/lib/core/EngineConfigurationContracts.ts
- apps/web/content-engines/_loader/index.ts
- apps/web/factoryos/core/engines/ProductionSpecCompiler.ts

## 1. Purpose

ShortForge treats a Content Engine as a versioned production contract, not as a flat UI form and not merely as a pile of runtime data.

The engine defines:
1. what kind of short is being manufactured;
2. what input data is required;
3. what creator-facing configuration is legal;
4. what evidence F00 must acquire;
5. what creative/cognitive structures are allowed;
6. what assets and voice are required;
7. how the result maps to TimelineIR;
8. what render profile is valid;
9. what verification rules must be satisfied.

The creator supplies intent inside those boundaries. FactoryOS compiles that intent into an immutable ProductionSpec.

## 2. Canonical object model

~~~text
Content Engine
    |
    +-- Engine Manifest
    |     +-- identity/version
    |     +-- capability profile
    |     +-- input/data contract
    |     +-- research contract
    |     +-- creative/cognitive contract
    |     +-- asset/voice contract
    |     +-- timeline/render contract
    |     +-- verification contract
    |
    +-- Configuration Schema
          +-- field type
          +-- default
          +-- options/range
          +-- basic/advanced visibility
          +-- authority domain
          +-- runtime binding

Creator Intent
    |
    v
Schema validation
    |
    v
ProductionSpecCompiler
    |
    +-- normalize
    +-- validate
    +-- partition
    +-- bind engine/version
    +-- hash
    |
    v
Immutable ProductionSpec
    |
    +-- F00 projection
    +-- F01 projection
    +-- F02 projection
    +-- F03 projection
    +-- F04 projection
    +-- F05 projection
    +-- F06 projection
    +-- F07 projection
~~~

## 3. Three canonical terms

### Engine Manifest
Versioned contract declaring what a Content Engine is and what it requires.

### ConfigurationSchema
Engine-owned declaration of legal creator controls, defaults, constraints, visibility, and bindings.

### ProductionSpec
Mission-specific compiled snapshot of creator intent plus engine/version/contract metadata.

Relationship:

~~~text
Engine Manifest
      +
Configuration Schema
      +
Creator Intent
      |
      v
ProductionSpec
~~~

## 4. Authority domains

Configuration is partitioned into:
- content: topic, difficulty, audience;
- creative: tone and future hook/pacing controls;
- media: voice, ratio, thumbnail style, duration;
- delivery: target platforms;
- runtime: request-level provider override;
- lifecycle: retention preference.

System routing policy, worker permissions, provider secrets, GPU assignment, leases, fencing, governance, and F07 authority are not creator configuration.

## 5. F00 and AgentReach

The Content Engine declares information requirements.

~~~text
Content Engine
    |
    v
Research Contract
    |
    v
F00 Research Specification
    |
    v
AgentReach
    |
    v
Approved external sources
    |
    v
Research Passport
    |
    v
Engine-specific data package
~~~

AgentReach remains an evidence-acquisition boundary. It must not become a generic search oracle that lets Ascalon invent engine requirements.

## 6. Immutability and reproducibility

Before mission execution:

~~~text
Creator configuration
    |
    v
Engine/schema validation
    |
    v
ProductionSpec compilation
    |
    v
SHA-256 hash
    |
    v
Mission creation
~~~

The mission records engine ID, manifest version, configuration version, normalized configuration, engine contracts, compilation time, and hash.

Changing configuration after mission start creates a new snapshot/version rather than mutating the running one.

## 7. Current implementation

Implemented:
- declarative configuration schema;
- server-side compiler;
- hash-bound ProductionSpec;
- schema-driven engine dashboard;
- basic/advanced UI;
- job manifest and FactoryOS mission propagation;
- engine registry propagation;
- compatibility support for legacy flat configuration fields.

Partial:
- Quiz Engine has a first-class engine-declared configuration;
- existing engines without declarations receive a compatibility schema;
- downstream floor workers still need progressive migration from legacy flat fields to typed ProductionSpec projections.

The presence of a field in ProductionSpec does not by itself prove every worker currently consumes that field.

## 8. Canonical implementation map

- Configuration types: apps/web/lib/core/EngineConfigurationContracts.ts
- Workflow/engine manifest: apps/web/content-engines/_loader/index.ts
- Engine registry: apps/web/lib/core/EngineRegistry.ts
- ProductionSpec contract: apps/web/factoryos/core/contracts/ProductionSpecContracts.ts
- ProductionSpec compiler: apps/web/factoryos/core/engines/ProductionSpecCompiler.ts
- API entry point: apps/web/app/api/generate-video/route.ts
- Dashboard: apps/web/app/(os)/engines/[id]/page.tsx
- Tests: apps/web/factoryos/tests/production-spec.test.ts

## 9. Security/governance invariant

ProductionSpec is intent, not authority.

It cannot:
- grant a worker new capabilities;
- bypass .okf policy;
- bypass Guardian;
- bypass Slayer lease revocation;
- bypass F07;
- mutate provider secrets;
- directly authorize publishing.

## 10. Eight-floor relationship

The canonical topology is unchanged:

~~~text
F00 -> F01 -> F02 -> (F03 || F04) -> F05 -> F06 -> F07
~~~

ProductionSpec is the configuration plane that the DAG consumes.
