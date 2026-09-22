/**
 * FactoryOS YouTube Monetization Guardian — YPP Eligibility Evaluator
 * Evaluates channel monetization eligibility across higher tier (Ads/Premium), expanded tier (Fan Funding),
 * prerequisites (2SV, advanced features, AdSense, strikes), and future 2027 policy shifts.
 */

import { ChannelContext } from "../policy/YouTubePolicyEvaluator";

export interface ChannelMonetizationEvaluation {
  readonly isEligibleForAds: boolean;
  readonly isEligibleForFanFunding: boolean;
  readonly yppTier: "FULL_ADS_PREMIUM" | "EXPANDED_FAN_FUNDING" | "INELIGIBLE";
  readonly unmetRequirements: readonly string[];
  readonly effectiveThresholds: {
    readonly requiredSubscribers: number;
    readonly requiredWatchHours: number;
    readonly requiredShortsViews: number;
  };
  readonly observedMetrics: {
    readonly subscriberCount: number;
    readonly validWatchHours: number;
    readonly shortsViews: number;
    readonly strikes: number;
  };
}

export class YPPEligibilityEvaluator {
  /**
   * Evaluates complete YPP eligibility against policy date.
   */
  public static evaluate(
    channel: ChannelContext,
    evaluationDateIso: string = new Date().toISOString()
  ): ChannelMonetizationEvaluation {
    const unmet: string[] = [];
    const evalTime = new Date(evaluationDateIso).getTime();
    const feb2027Boundary = new Date("2027-02-01T00:00:00Z").getTime();
    const isPostFeb2027 = evalTime >= feb2027Boundary;

    // Prerequisites check
    if (!channel.isTwoStepVerificationEnabled) {
      unmet.push("2-Step Verification is not enabled on Google account");
    }
    if (!channel.hasAdvancedFeaturesAccess) {
      unmet.push("Advanced features access not unlocked in YouTube Studio");
    }
    if (!channel.hasLinkedAdSense) {
      unmet.push("No active, approved AdSense for YouTube account linked");
    }
    if (channel.activeCommunityGuidelinesStrikes > 0) {
      unmet.push(`Channel has ${channel.activeCommunityGuidelinesStrikes} active Community Guidelines strike(s)`);
    }

    const subCount = channel.subscriberCount || 0;
    const watchHours = channel.validWatchHoursLast365Days || 0;
    const shortsViews = channel.shortsViewsLast90Days || 0;

    // Thresholds: Higher tier (Ads & Premium)
    const requiredSubs = 1000;
    const requiredWatchHours = isPostFeb2027 ? 8000 : 4000;
    const requiredShortsViews = isPostFeb2027 ? 20000000 : 10000000;

    const meetsAudienceForAds =
      subCount >= requiredSubs && (watchHours >= requiredWatchHours || shortsViews >= requiredShortsViews);

    // Expanded tier (Fan funding: 500 subs, 3000 watch hours or 3M shorts views)
    const meetsAudienceForFanFunding =
      subCount >= 500 && (watchHours >= 3000 || shortsViews >= 3000000);

    const prerequisitesMet = unmet.length === 0;
    const isEligibleForAds = prerequisitesMet && meetsAudienceForAds;
    const isEligibleForFanFunding = prerequisitesMet && (meetsAudienceForAds || meetsAudienceForFanFunding);

    let yppTier: "FULL_ADS_PREMIUM" | "EXPANDED_FAN_FUNDING" | "INELIGIBLE" = "INELIGIBLE";
    if (isEligibleForAds) {
      yppTier = "FULL_ADS_PREMIUM";
    } else if (isEligibleForFanFunding) {
      yppTier = "EXPANDED_FAN_FUNDING";
    }

    if (!meetsAudienceForAds && !meetsAudienceForFanFunding) {
      unmet.push(
        `Audience thresholds not met: has ${subCount}/${requiredSubs} subs, ` +
        `${watchHours}/${requiredWatchHours} watch hours, ${shortsViews}/${requiredShortsViews} shorts views`
      );
    }

    return {
      isEligibleForAds,
      isEligibleForFanFunding,
      yppTier,
      unmetRequirements: Object.freeze(unmet),
      effectiveThresholds: {
        requiredSubscribers: requiredSubs,
        requiredWatchHours,
        requiredShortsViews,
      },
      observedMetrics: {
        subscriberCount: subCount,
        validWatchHours: watchHours,
        shortsViews,
        strikes: channel.activeCommunityGuidelinesStrikes || 0,
      },
    };
  }
}
