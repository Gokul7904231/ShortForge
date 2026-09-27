# Ascalon Artifact Acquisition & Model Supply Chain

> Status: IMPLEMENTED HELPER / NON-AUTHORITATIVE ACQUISITION

## Why this exists

Ascalon training and inference depend on large model checkpoints, embedding datasets and evaluation assets. Download reliability is a separate problem from artifact truth.

aria2 is adopted only as an optional transfer accelerator for large, resumable acquisition. It does not become the source of truth.

## Canonical flow

~~~
approved manifest
  -> explicit HTTPS source allowlist
  -> aria2c isolated acquisition
  -> staging file
  -> independent SHA-256 + byte-length check
  -> CAS / immutable manifest
  -> training or inference consumer
~~~

## Integrity rule

A transfer is not accepted because aria2 reports exit code 0. The Ascalon helper recomputes SHA-256 and validates file size after the process exits.

Whenever an expected SHA-256 exists, it is passed to aria2 integrity checking and then independently recomputed by ShortForge.

## Security rule

The helper rejects non-HTTPS URLs, credential-bearing URLs and origins outside an explicit allowlist. No public unauthenticated aria2 RPC is permitted.

## Separation from training eligibility

Artifact integrity answers only: “Did we obtain these bytes?” It does not answer: “Is this dataset/trajectory trusted training data?”

Training eligibility remains governed by Ascalon provenance, secret scanning, Claim <= Evidence, simulation labeling, mission-family splitting and verification policy.

## Runtime boundary

This helper is for acquisition of models/datasets/evaluation artifacts. It does not replace F06 provider transfers or F07 verification of rendered media.