/**
 * F07 physical artifact truth boundary.
 *
 * F06 may provide an artifact identity, but F07 does not trust provider-declared
 * measurements. This verifier resolves the immutable CAS object (or an explicitly
 * supplied local test path), hashes the physical bytes, and independently probes
 * the media. Any mismatch fails closed.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { ContentAddressedStore } from "../../../compute/cas/ContentAddressedStore";
import { VerificationEngine, MediaProbeMeasurements } from "../../VerificationEngine";

export type F07PhysicalSource = "CAS" | "LOCAL_DEV" | "TEST_FIXTURE";

export interface F07PhysicalArtifactVerification {
  readonly source: F07PhysicalSource;
  readonly physicalPath: string;
  readonly expectedSha256: string;
  readonly actualSha256: string;
  readonly sha256MatchesExpected: boolean;
  readonly casBound: boolean;
  readonly casRef?: string;
  readonly byteLength: number;
  readonly casByteLength?: number;
  readonly measurements: MediaProbeMeasurements;
}

export class F07PhysicalArtifactVerifier {
  private static readonly SHA256_RE = /^[a-f0-9]{64}$/i;

  public static async verify(params: {
    artifactSha256?: string;
    artifactCasRef?: string;
    localMediaPath?: string;
  }): Promise<F07PhysicalArtifactVerification> {
    const hasLocal = Boolean(params.localMediaPath);
    const hasCas = Boolean(params.artifactCasRef);

    if (!hasLocal && !hasCas) {
      throw new Error("F07 physical verification requires an artifactCasRef or localMediaPath.");
    }
    if (hasLocal && hasCas) {
      throw new Error("F07 physical verification accepts exactly one source: CAS or localMediaPath.");
    }

    if (hasCas) {
      return this.verifyCas(params.artifactCasRef!, params.artifactSha256);
    }

    return this.verifyLocal(params.localMediaPath!, params.artifactSha256);
  }

  private static async verifyCas(casRef: string, declaredSha?: string): Promise<F07PhysicalArtifactVerification> {
    if (!casRef.startsWith("cas://")) {
      throw new Error("Invalid F07 CAS reference " + casRef + ". Expected cas://<sha256>.");
    }

    const casSha = casRef.slice("cas://".length).trim().toLowerCase();
    if (!this.SHA256_RE.test(casSha)) {
      throw new Error("Invalid F07 CAS identity " + casSha + ".");
    }

    const expectedSha = (declaredSha || casSha).toLowerCase();
    if (!this.SHA256_RE.test(expectedSha)) {
      throw new Error("F07 expected artifact SHA-256 is not a valid 64-character digest.");
    }
    if (expectedSha !== casSha) {
      throw new Error("F07 CAS identity mismatch: casRef=" + casSha + " expected=" + expectedSha + ".");
    }

    const cas = ContentAddressedStore.getInstance();
    const ref = cas.getByHash(expectedSha);
    if (!ref?.uri) {
      throw new Error("F07 CAS artifact " + expectedSha + " is not physically resolvable.");
    }
    if (!fs.existsSync(ref.uri)) {
      throw new Error("F07 CAS artifact " + expectedSha + " is missing at its registered path.");
    }

    const firstIntegrity = await cas.verifyArtifactIntegrity(ref);
    if (!firstIntegrity.valid || firstIntegrity.actualSha256 !== expectedSha) {
      throw new Error(firstIntegrity.error || ("F07 CAS digest mismatch for " + expectedSha + "."));
    }

    const measurements = await VerificationEngine.probeMediaFile(ref.uri);
    if (!measurements.fileExists || measurements.byteLength <= 0 || !measurements.decodeSmokePassed) {
      throw new Error("F07 CAS physical probe failed: missing bytes, zero length, or decode smoke failure.");
    }

    const secondIntegrity = await cas.verifyArtifactIntegrity(ref);
    if (!secondIntegrity.valid || secondIntegrity.actualSha256 !== expectedSha) {
      throw new Error(secondIntegrity.error || ("F07 CAS digest changed during verification for " + expectedSha + "."));
    }

    if (ref.byteLength !== measurements.byteLength) {
      throw new Error("F07 CAS byte-length mismatch: CAS=" + ref.byteLength + ", probe=" + measurements.byteLength + ".");
    }

    return Object.freeze({
      source: "CAS",
      physicalPath: ref.uri,
      expectedSha256: expectedSha,
      actualSha256: secondIntegrity.actualSha256!,
      sha256MatchesExpected: true,
      casBound: true,
      casRef,
      byteLength: measurements.byteLength,
      casByteLength: ref.byteLength,
      measurements,
    });
  }

  private static async verifyLocal(localPath: string, declaredSha?: string): Promise<F07PhysicalArtifactVerification> {
    const absolute = path.resolve(localPath);
    if (!path.isAbsolute(absolute)) {
      throw new Error("F07 local physical verification requires an absolute path.");
    }
    if (!fs.existsSync(absolute)) {
      throw new Error("F07 local media file not found: " + absolute);
    }

    const expectedSha = declaredSha?.toLowerCase() || "";
    if (expectedSha && !this.SHA256_RE.test(expectedSha)) {
      throw new Error("F07 local expected artifact SHA-256 is invalid.");
    }

    const firstSha = await ContentAddressedStore.computeFileSha256(absolute);
    if (expectedSha && firstSha !== expectedSha) {
      throw new Error("F07 local artifact SHA-256 mismatch: expected " + expectedSha + ", actual " + firstSha + ".");
    }

    const measurements = await VerificationEngine.probeMediaFile(absolute);
    if (!measurements.fileExists || measurements.byteLength <= 0 || !measurements.decodeSmokePassed) {
      throw new Error("F07 local physical probe failed: missing bytes, zero length, or decode smoke failure.");
    }

    const secondSha = await ContentAddressedStore.computeFileSha256(absolute);
    if (secondSha !== firstSha) {
      throw new Error("F07 local artifact changed during physical verification (TOCTOU detected).");
    }

    return Object.freeze({
      source: process.env.NODE_ENV === "test" ? "TEST_FIXTURE" : "LOCAL_DEV",
      physicalPath: absolute,
      expectedSha256: expectedSha || secondSha,
      actualSha256: secondSha,
      sha256MatchesExpected: expectedSha ? secondSha === expectedSha : true,
      casBound: false,
      byteLength: measurements.byteLength,
      measurements,
    });
  }
}
