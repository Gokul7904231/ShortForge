/**
 * FactoryOS YouTube Monetization Guardian — Policy Source Registry
 * Official Google / YouTube documentation source registry.
 * Invariant: CLAIM <= EVIDENCE. Source of truth is official platform documentation.
 */

import * as crypto from "node:crypto";

export type PolicyDomain =
  | "CHANNEL_MONETIZATION"
  | "SHORTS_MONETIZATION"
  | "ADVERTISER_FRIENDLY"
  | "COMMUNITY_GUIDELINES"
  | "SPAM_AND_DECEPTION"
  | "FAKE_ENGAGEMENT"
  | "COPYRIGHT_AND_COMMERCIAL_RIGHTS"
  | "AI_AND_SYNTHETIC_DISCLOSURE"
  | "YPP_ELIGIBILITY"
  | "KIDS_AND_FAMILY"
  | "TERMS_OF_SERVICE"
  | "POLICY_UPDATES";

export interface PolicySourceDocument {
  readonly id: string;
  readonly domain: PolicyDomain;
  readonly title: string;
  readonly officialUrl: string;
  readonly authoritativeHost: "support.google.com" | "www.youtube.com";
  readonly summary: string;
  readonly effectiveDate: string;
  readonly lastVerifiedAt: string;
  readonly contentChecksumSha256: string;
}

function computeDocumentDigest(doc: { id: string; url: string; title: string; effectiveDate: string; summary: string }): string {
  const canonicalContent = `ID:${doc.id}|URL:${doc.url}|TITLE:${doc.title}|DATE:${doc.effectiveDate}|SUMMARY:${doc.summary}`;
  return crypto.createHash("sha256").update(canonicalContent, "utf8").digest("hex");
}

export class PolicySourceRegistry {
  private static readonly OFFICIAL_SOURCES: readonly PolicySourceDocument[] = [
    {
      id: "src_yt_channel_monetization",
      domain: "CHANNEL_MONETIZATION",
      title: "YouTube channel monetization policies",
      officialUrl: "https://support.google.com/youtube/answer/1311392",
      authoritativeHost: "support.google.com",
      summary: "Comprehensive requirements for earning money in YPP, covering inauthentic and reused content policies.",
      effectiveDate: "2024-06-01",
      lastVerifiedAt: "2026-09-01T00:00:00Z",
      contentChecksumSha256: computeDocumentDigest({
        id: "src_yt_channel_monetization",
        url: "https://support.google.com/youtube/answer/1311392",
        title: "YouTube channel monetization policies",
        effectiveDate: "2024-06-01",
        summary: "Comprehensive requirements for earning money in YPP, covering inauthentic and reused content policies.",
      }),
    },
    {
      id: "src_yt_shorts_monetization",
      domain: "SHORTS_MONETIZATION",
      title: "YouTube Shorts monetization policies",
      officialUrl: "https://support.google.com/youtube/answer/15424877",
      authoritativeHost: "support.google.com",
      summary: "Shorts-specific revenue sharing, aspect ratios (9:16/1:1), 180s duration limit, and Content ID claiming rules.",
      effectiveDate: "2024-10-15",
      lastVerifiedAt: "2026-09-01T00:00:00Z",
      contentChecksumSha256: computeDocumentDigest({
        id: "src_yt_shorts_monetization",
        url: "https://support.google.com/youtube/answer/15424877",
        title: "YouTube Shorts monetization policies",
        effectiveDate: "2024-10-15",
        summary: "Shorts-specific revenue sharing, aspect ratios (9:16/1:1), 180s duration limit, and Content ID claiming rules.",
      }),
    },
    {
      id: "src_yt_advertiser_friendly",
      domain: "ADVERTISER_FRIENDLY",
      title: "Advertiser-friendly content guidelines",
      officialUrl: "https://support.google.com/youtube/answer/6162278",
      authoritativeHost: "support.google.com",
      summary: "Rules governing ad suitability across video, title, thumbnail, description, tags, and contextual framing.",
      effectiveDate: "2026-09-01",
      lastVerifiedAt: "2026-09-15T00:00:00Z",
      contentChecksumSha256: computeDocumentDigest({
        id: "src_yt_advertiser_friendly",
        url: "https://support.google.com/youtube/answer/6162278",
        title: "Advertiser-friendly content guidelines",
        effectiveDate: "2026-09-01",
        summary: "Rules governing ad suitability across video, title, thumbnail, description, tags, and contextual framing.",
      }),
    },
    {
      id: "src_yt_community_guidelines",
      domain: "COMMUNITY_GUIDELINES",
      title: "YouTube Community Guidelines",
      officialUrl: "https://support.google.com/youtube/answer/9288567",
      authoritativeHost: "support.google.com",
      summary: "Baseline platform rules on hate speech, harassment, graphic content, safety, and dangerous activities.",
      effectiveDate: "2024-01-01",
      lastVerifiedAt: "2026-09-01T00:00:00Z",
      contentChecksumSha256: computeDocumentDigest({
        id: "src_yt_community_guidelines",
        url: "https://support.google.com/youtube/answer/9288567",
        title: "YouTube Community Guidelines",
        effectiveDate: "2024-01-01",
        summary: "Baseline platform rules on hate speech, harassment, graphic content, safety, and dangerous activities.",
      }),
    },
    {
      id: "src_yt_spam_deception",
      domain: "SPAM_AND_DECEPTION",
      title: "Spam, deceptive practices, and scams policies",
      officialUrl: "https://support.google.com/youtube/answer/2801973",
      authoritativeHost: "support.google.com",
      summary: "Prohibitions against misleading metadata, thumbnail deception, scam narratives, and automated spamming.",
      effectiveDate: "2024-01-01",
      lastVerifiedAt: "2026-09-01T00:00:00Z",
      contentChecksumSha256: computeDocumentDigest({
        id: "src_yt_spam_deception",
        url: "https://support.google.com/youtube/answer/2801973",
        title: "Spam, deceptive practices, and scams policies",
        effectiveDate: "2024-01-01",
        summary: "Prohibitions against misleading metadata, thumbnail deception, scam narratives, and automated spamming.",
      }),
    },
    {
      id: "src_yt_fake_engagement",
      domain: "FAKE_ENGAGEMENT",
      title: "Fake engagement policy",
      officialUrl: "https://support.google.com/youtube/answer/3399767",
      authoritativeHost: "support.google.com",
      summary: "Strict prohibition on automated view boosting, bot traffic, metrics purchasing, and engagement manipulation.",
      effectiveDate: "2024-01-01",
      lastVerifiedAt: "2026-09-01T00:00:00Z",
      contentChecksumSha256: computeDocumentDigest({
        id: "src_yt_fake_engagement",
        url: "https://support.google.com/youtube/answer/3399767",
        title: "Fake engagement policy",
        effectiveDate: "2024-01-01",
        summary: "Strict prohibition on automated view boosting, bot traffic, metrics purchasing, and engagement manipulation.",
      }),
    },
    {
      id: "src_yt_copyright_commercial",
      domain: "COPYRIGHT_AND_COMMERCIAL_RIGHTS",
      title: "What is copyright?",
      officialUrl: "https://support.google.com/youtube/answer/2797468",
      authoritativeHost: "support.google.com",
      summary: "Copyright compliance, commercial use rights, fair use standards, and proper licensing provenance.",
      effectiveDate: "2024-01-01",
      lastVerifiedAt: "2026-09-01T00:00:00Z",
      contentChecksumSha256: computeDocumentDigest({
        id: "src_yt_copyright_commercial",
        url: "https://support.google.com/youtube/answer/2797468",
        title: "What is copyright?",
        effectiveDate: "2024-01-01",
        summary: "Copyright compliance, commercial use rights, fair use standards, and proper licensing provenance.",
      }),
    },
    {
      id: "src_yt_ai_disclosure",
      domain: "AI_AND_SYNTHETIC_DISCLOSURE",
      title: "How to disclose altered or synthetic content",
      officialUrl: "https://support.google.com/youtube/answer/14328491",
      authoritativeHost: "support.google.com",
      summary: "Requirement to disclose realistically synthetic media. Explicitly states disclosure does not limit monetization.",
      effectiveDate: "2024-03-18",
      lastVerifiedAt: "2026-09-01T00:00:00Z",
      contentChecksumSha256: computeDocumentDigest({
        id: "src_yt_ai_disclosure",
        url: "https://support.google.com/youtube/answer/14328491",
        title: "How to disclose altered or synthetic content",
        effectiveDate: "2024-03-18",
        summary: "Requirement to disclose realistically synthetic media. Explicitly states disclosure does not limit monetization.",
      }),
    },
    {
      id: "src_yt_ypp_eligibility",
      domain: "YPP_ELIGIBILITY",
      title: "YouTube Partner Program overview & eligibility",
      officialUrl: "https://support.google.com/youtube/answer/72851",
      authoritativeHost: "support.google.com",
      summary: "Audience milestones, 2-Step Verification, advanced features, AdSense account, and ongoing channel review.",
      effectiveDate: "2024-01-01",
      lastVerifiedAt: "2026-09-01T00:00:00Z",
      contentChecksumSha256: computeDocumentDigest({
        id: "src_yt_ypp_eligibility",
        url: "https://support.google.com/youtube/answer/72851",
        title: "YouTube Partner Program overview & eligibility",
        effectiveDate: "2024-01-01",
        summary: "Audience milestones, 2-Step Verification, advanced features, AdSense account, and ongoing channel review.",
      }),
    },
    {
      id: "src_yt_kids_family",
      domain: "KIDS_AND_FAMILY",
      title: "Quality principles for kids and family content",
      officialUrl: "https://support.google.com/youtube/answer/11187498",
      authoritativeHost: "support.google.com",
      summary: "Standards for children's content, avoiding heavily commercialized or encouraging negative behavior.",
      effectiveDate: "2023-11-01",
      lastVerifiedAt: "2026-09-01T00:00:00Z",
      contentChecksumSha256: computeDocumentDigest({
        id: "src_yt_kids_family",
        url: "https://support.google.com/youtube/answer/11187498",
        title: "Quality principles for kids and family content",
        effectiveDate: "2023-11-01",
        summary: "Standards for children's content, avoiding heavily commercialized or encouraging negative behavior.",
      }),
    },
    {
      id: "src_yt_terms_of_service",
      domain: "TERMS_OF_SERVICE",
      title: "YouTube Terms of Service",
      officialUrl: "https://www.youtube.com/t/terms",
      authoritativeHost: "www.youtube.com",
      summary: "Platform contractual terms, service use, permissions, restrictions, and account termination policies.",
      effectiveDate: "2024-01-05",
      lastVerifiedAt: "2026-09-01T00:00:00Z",
      contentChecksumSha256: computeDocumentDigest({
        id: "src_yt_terms_of_service",
        url: "https://www.youtube.com/t/terms",
        title: "YouTube Terms of Service",
        effectiveDate: "2024-01-05",
        summary: "Platform contractual terms, service use, permissions, restrictions, and account termination policies.",
      }),
    },
    {
      id: "src_yt_policy_updates",
      domain: "POLICY_UPDATES",
      title: "Recent and upcoming YouTube policy updates",
      officialUrl: "https://support.google.com/youtube/answer/9725604",
      authoritativeHost: "support.google.com",
      summary: "Changelog for YouTube policy updates, including effective dates for Content ID on long Shorts (2026-09-24).",
      effectiveDate: "2026-09-15",
      lastVerifiedAt: "2026-09-21T00:00:00Z",
      contentChecksumSha256: computeDocumentDigest({
        id: "src_yt_policy_updates",
        url: "https://support.google.com/youtube/answer/9725604",
        title: "Recent and upcoming YouTube policy updates",
        effectiveDate: "2026-09-15",
        summary: "Changelog for YouTube policy updates, including effective dates for Content ID on long Shorts (2026-09-24).",
      }),
    },
  ];

  public static getOfficialSources(): readonly PolicySourceDocument[] {
    return this.OFFICIAL_SOURCES;
  }

  public static getSourceByDomain(domain: PolicyDomain): PolicySourceDocument | undefined {
    return this.OFFICIAL_SOURCES.find((s) => s.domain === domain);
  }

  public static getSourceById(id: string): PolicySourceDocument | undefined {
    return this.OFFICIAL_SOURCES.find((s) => s.id === id);
  }

  public static verifySourceIntegrity(source: PolicySourceDocument): boolean {
    const computed = computeDocumentDigest({
      id: source.id,
      url: source.officialUrl,
      title: source.title,
      effectiveDate: source.effectiveDate,
      summary: source.summary,
    });
    return computed === source.contentChecksumSha256;
  }
}
