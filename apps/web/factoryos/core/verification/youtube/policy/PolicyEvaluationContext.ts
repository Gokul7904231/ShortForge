/**
 * FactoryOS YouTube Monetization Guardian — Policy Evaluation Clocks Context
 * Defines distinct temporal boundaries across content creation, upload, publication, and YPP state.
 */

export interface PolicyEvaluationContext {
  readonly contentCreatedAt: string;
  readonly uploadIntentAt: string;
  readonly uploadSubmittedAt?: string;
  readonly publicationIntentAt: string;
  readonly channelObservationAt: string;
  readonly yppEligibilityEvaluationAt: string;
  readonly yppApplicationAt?: string;
  readonly policyEvaluationAt: string;
}

export class PolicyEvaluationContextBuilder {
  public static build(params: {
    contentCreatedAt?: string;
    uploadIntentAt?: string;
    uploadSubmittedAt?: string;
    publicationIntentAt?: string;
    channelObservationAt?: string;
    yppEligibilityEvaluationAt?: string;
    yppApplicationAt?: string;
    policyEvaluationAt?: string;
  }): PolicyEvaluationContext {
    const now = new Date().toISOString();
    return Object.freeze({
      contentCreatedAt: params.contentCreatedAt || now,
      uploadIntentAt: params.uploadIntentAt || now,
      uploadSubmittedAt: params.uploadSubmittedAt,
      publicationIntentAt: params.publicationIntentAt || now,
      channelObservationAt: params.channelObservationAt || now,
      yppEligibilityEvaluationAt: params.yppEligibilityEvaluationAt || now,
      yppApplicationAt: params.yppApplicationAt,
      policyEvaluationAt: params.policyEvaluationAt || now,
    });
  }

  /**
   * Resolves the authoritative timestamp for a given policy rule based on its appliesBy clock.
   */
  public static resolveTimestampForRule(
    clock: "UPLOAD_DATE" | "PUBLICATION_DATE" | "CHANNEL_STATE" | "YPP_APPLICATION_DATE",
    context: PolicyEvaluationContext
  ): string {
    switch (clock) {
      case "UPLOAD_DATE":
        return context.uploadIntentAt;
      case "PUBLICATION_DATE":
        return context.publicationIntentAt;
      case "CHANNEL_STATE":
        return context.channelObservationAt;
      case "YPP_APPLICATION_DATE":
        return context.yppApplicationAt || context.yppEligibilityEvaluationAt;
      default:
        return context.publicationIntentAt;
    }
  }
}
