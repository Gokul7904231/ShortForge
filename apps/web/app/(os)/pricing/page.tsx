"use client";

import React, { useState } from "react";
import {
  Check,
  Zap,
  ShieldCheck,
  Calendar,
  HardDrive,
  Cpu,
  Layers,
  HelpCircle,
  ArrowRight,
  Flame,
  Star,
  Users,
  Building,
} from "lucide-react";
import BrandIcon from "@/components/BrandIcon";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/hooks";

export default function PricingPlansPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [annualBilling, setAnnualBilling] = useState(false);

  const role = (user?.role || "BASIC").toUpperCase();
  const isBasic = role === "BASIC" || role === "USER" || role === "VIEWER" || role === "EDITOR";
  const isPro = role === "PRO";
  const isAdmin = role === "ADMIN" || role === "OWNER";

  React.useEffect(() => {
    if (!loading && isAdmin) {
      router.replace("/admin/users");
    }
  }, [loading, isAdmin, router]);

  if (!loading && isAdmin) {
    return (
      <div className="p-8 text-center text-sm text-[#667085] dark:text-[#A8B2C1]">
        Redirecting to User Directory...
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-10 max-w-7xl mx-auto space-y-12 select-none text-[#111827] dark:text-[#F5F7FA] font-sans">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#1677FF]/10 text-[#1677FF] text-xs font-bold font-mono uppercase tracking-wider">
          <BrandIcon className="w-3.5 h-3.5" /> Simple, Creator-First Pricing
        </div>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight">
          Choose the plan that powers your content engine
        </h1>
        <p className="text-sm sm:text-base text-[#667085] dark:text-[#A8B2C1] leading-relaxed">
          From fast one-off shorts to fully automated daily scheduled production and enterprise rendering.
        </p>

        {/* Billing Cycle Toggle */}
        <div className="pt-4 flex items-center justify-center gap-3 text-xs font-bold">
          <span className={!annualBilling ? "text-[#111827] dark:text-[#F5F7FA]" : "text-[#667085]"}>
            Monthly Billing
          </span>
          <button
            onClick={() => setAnnualBilling(!annualBilling)}
            className="w-12 h-6 rounded-full bg-[#1677FF] p-1 transition-colors relative cursor-pointer"
            aria-label="Toggle Annual Billing"
          >
            <div
              className={`w-4 h-4 rounded-full bg-white transition-transform ${
                annualBilling ? "translate-x-6" : "translate-x-0"
              }`}
            />
          </button>
          <span className={annualBilling ? "text-[#111827] dark:text-[#F5F7FA] flex items-center gap-1.5" : "text-[#667085]"}>
            Annual Billing
            <span className="px-2 py-0.5 rounded-full bg-[#19C37D]/15 text-[#19C37D] text-[10px] font-mono">
              Save 20%
            </span>
          </span>
        </div>
      </div>

      {/* Pricing Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
        {/* 1. BASIC PLAN */}
        <div className="bg-white dark:bg-[#070D18] border border-black/[0.06] dark:border-white/[0.08] rounded-3xl p-7 flex flex-col justify-between space-y-6 relative hover:border-black/[0.15] dark:hover:border-white/[0.2] transition-all">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase font-bold text-[#667085] dark:text-[#A8B2C1]">
                Starter Creator
              </span>
              {isBasic && (
                <span className="px-2.5 py-0.5 rounded-full bg-[#1677FF]/10 text-[#1677FF] text-[10px] font-bold font-mono">
                  Current Plan
                </span>
              )}
            </div>

            <div>
              <h2 className="text-2xl font-black">Basic</h2>
              <p className="text-xs text-[#667085] dark:text-[#A8B2C1] mt-1">
                Perfect for trying out ShortForge and creating viral trivia shorts.
              </p>
            </div>

            <div className="pt-2">
              <span className="text-4xl font-black">$0</span>
              <span className="text-xs text-[#667085] dark:text-[#A8B2C1] ml-2">free forever</span>
            </div>

            <div className="p-3 rounded-2xl bg-black/[0.02] dark:bg-[#0E1728] border border-black/[0.04] dark:border-white/[0.04] text-xs font-mono">
              <span className="font-bold text-[#1677FF]">5 Lifetime Videos</span> included
            </div>

            <ul className="space-y-3 text-xs text-[#475467] dark:text-[#CBD5E1]">
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-[#19C37D] shrink-0 mt-0.5" />
                <span>5 Total Video Generations (Lifetime limit)</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-[#19C37D] shrink-0 mt-0.5" />
                <span>Active System Engines (Geo Quiz & Custom Quiz)</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-[#19C37D] shrink-0 mt-0.5" />
                <span>Single & Multi-Topic Equal Allocation</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-[#19C37D] shrink-0 mt-0.5" />
                <span>Inline Question Editing & Live Reverification</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-[#19C37D] shrink-0 mt-0.5" />
                <span>1080x1920 (9:16) Export & Media Library Access</span>
              </li>
              <li className="flex items-start gap-2.5 opacity-40">
                <span className="w-4 h-4 text-center shrink-0">—</span>
                <span>Pro Scheduler & Daily Automation</span>
              </li>
              <li className="flex items-start gap-2.5 opacity-40">
                <span className="w-4 h-4 text-center shrink-0">—</span>
                <span>Personal Google Drive OAuth Auto-Upload</span>
              </li>
            </ul>
          </div>

          <button
            disabled={isBasic}
            className={`w-full py-3 rounded-2xl font-bold text-xs transition-all ${
              isBasic
                ? "bg-black/[0.05] dark:bg-white/[0.05] text-[#667085] cursor-default"
                : "bg-black/[0.05] dark:bg-white/[0.08] hover:bg-black/[0.1] dark:hover:bg-white/[0.12] text-[#111827] dark:text-[#F5F7FA]"
            }`}
          >
            {isBasic ? "Active Plan" : "Downgrade to Basic"}
          </button>
        </div>

        {/* 2. PRO PLAN (FEATURED / RECOMMENDED) */}
        <div className="bg-gradient-to-b from-[#1677FF]/5 via-white dark:via-[#070D18] to-white dark:to-[#070D18] border-2 border-[#1677FF] rounded-3xl p-7 flex flex-col justify-between space-y-6 relative shadow-xl">
          {/* Most Popular Badge */}
          <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-[#1677FF] text-white text-[10px] font-bold font-mono uppercase tracking-wider flex items-center gap-1.5 shadow-md">
            <Flame className="w-3.5 h-3.5 fill-current" /> Most Popular for Creators
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase font-bold text-[#1677FF]">
                Active Creator
              </span>
              {isPro && (
                <span className="px-2.5 py-0.5 rounded-full bg-[#1677FF] text-white text-[10px] font-bold font-mono">
                  Current Plan
                </span>
              )}
            </div>

            <div>
              <h2 className="text-2xl font-black">Pro</h2>
              <p className="text-xs text-[#667085] dark:text-[#A8B2C1] mt-1">
                Automate your daily content channel with scheduled renders & Drive delivery.
              </p>
            </div>

            <div className="pt-2">
              <span className="text-4xl font-black">{annualBilling ? "$23" : "$29"}</span>
              <span className="text-xs text-[#667085] dark:text-[#A8B2C1] ml-2">/ month</span>
            </div>

            <div className="p-3 rounded-2xl bg-[#1677FF]/10 border border-[#1677FF]/20 text-xs font-mono text-[#1677FF]">
              <span className="font-bold">8 Video Generations</span> per month
            </div>

            <ul className="space-y-3 text-xs text-[#475467] dark:text-[#CBD5E1]">
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-[#1677FF] shrink-0 mt-0.5" />
                <span className="font-semibold text-[#111827] dark:text-[#F5F7FA]">8 Shorts per billing period</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-[#1677FF] shrink-0 mt-0.5" />
                <span className="font-semibold text-[#111827] dark:text-[#F5F7FA]">Personal Google Drive OAuth integration</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-[#1677FF] shrink-0 mt-0.5" />
                <span className="font-semibold text-[#111827] dark:text-[#F5F7FA]">Automated Pro Scheduler (Daily & Weekly)</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-[#1677FF] shrink-0 mt-0.5" />
                <span>Custom Engine Creation & Configuration</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-[#1677FF] shrink-0 mt-0.5" />
                <span>Multi-Topic Question Equal Allocation</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-[#1677FF] shrink-0 mt-0.5" />
                <span>Full AI Guardian Factuality & External Evidence RAG</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-[#1677FF] shrink-0 mt-0.5" />
                <span>Priority Video Render Queue</span>
              </li>
            </ul>
          </div>

          <button
            onClick={() => alert("Upgrading to Pro is currently open for limited beta creators. Contact support or use admin access.")}
            className="w-full py-3.5 rounded-2xl font-bold text-xs bg-[#1677FF] hover:bg-[#0F63D8] text-white shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
          >
            <Zap className="w-4 h-4 fill-current" />
            <span>{isPro ? "Manage Pro Subscription" : "Upgrade to Pro"}</span>
          </button>
        </div>

        {/* 3. ENTERPRISE PLAN */}
        <div className="bg-white dark:bg-[#070D18] border border-black/[0.06] dark:border-white/[0.08] rounded-3xl p-7 flex flex-col justify-between space-y-6 relative hover:border-black/[0.15] dark:hover:border-white/[0.2] transition-all">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase font-bold text-[#667085] dark:text-[#A8B2C1]">
                Media Studios & Teams
              </span>
              {isAdmin && (
                <span className="px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-500 text-[10px] font-bold font-mono">
                  Owner Tier
                </span>
              )}
            </div>

            <div>
              <h2 className="text-2xl font-black">Enterprise</h2>
              <p className="text-xs text-[#667085] dark:text-[#A8B2C1] mt-1">
                For production studios, agencies, and high-volume media operations.
              </p>
            </div>

            <div className="pt-2">
              <span className="text-4xl font-black">{annualBilling ? "$159" : "$199"}</span>
              <span className="text-xs text-[#667085] dark:text-[#A8B2C1] ml-2">/ month</span>
            </div>

            <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-xs font-mono text-purple-500">
              <span className="font-bold">Unlimited Generations</span> & Dedicated GPU Node
            </div>

            <ul className="space-y-3 text-xs text-[#475467] dark:text-[#CBD5E1]">
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
                <span className="font-semibold text-[#111827] dark:text-[#F5F7FA]">Unlimited Video Generations</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
                <span>Dedicated qualified GPU worker capacity</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
                <span>Full Factory Operations & SRE Telemetry</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
                <span>Multi-Account Team Scoping & Admin Control</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
                <span>Autonomous Overseer AI Engine & Tool Execution</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
                <span>Direct Social Media & YouTube Publishing API</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
                <span>99.9% Uptime SLA & Dedicated Account Engineer</span>
              </li>
            </ul>
          </div>

          <a
            href="mailto:support@shortforge.app?subject=Enterprise%20Inquiry"
            className="w-full py-3 rounded-2xl font-bold text-xs bg-black/[0.05] dark:bg-white/[0.08] hover:bg-black/[0.1] dark:hover:bg-white/[0.12] text-[#111827] dark:text-[#F5F7FA] transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Building className="w-4 h-4" />
            <span>Contact Enterprise Sales</span>
          </a>
        </div>
      </div>

      {/* Feature Comparison Table */}
      <div className="bg-white dark:bg-[#070D18] border border-black/[0.06] dark:border-white/[0.08] rounded-3xl p-6 sm:p-8 space-y-6">
        <div>
          <h3 className="text-lg font-bold text-[#111827] dark:text-[#F5F7FA]">Detailed Feature Comparison</h3>
          <p className="text-xs text-[#667085] dark:text-[#A8B2C1] mt-0.5">
            Compare capabilities across Basic, Pro, and Enterprise tiers.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-black/[0.06] dark:border-white/[0.08] text-[#667085] font-mono uppercase">
                <th className="py-3 pr-4 font-bold">Feature</th>
                <th className="py-3 px-4 font-bold">Basic</th>
                <th className="py-3 px-4 font-bold text-[#1677FF]">Pro</th>
                <th className="py-3 pl-4 font-bold text-purple-500">Enterprise</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
              <tr>
                <td className="py-3.5 pr-4 font-semibold text-[#111827] dark:text-[#F5F7FA]">Monthly Generation Quota</td>
                <td className="py-3.5 px-4 font-mono">5 Lifetime</td>
                <td className="py-3.5 px-4 font-mono font-bold text-[#1677FF]">8 per Month</td>
                <td className="py-3.5 pl-4 font-mono font-bold text-purple-500">Unlimited</td>
              </tr>
              <tr>
                <td className="py-3.5 pr-4 font-semibold text-[#111827] dark:text-[#F5F7FA]">Active System Engines</td>
                <td className="py-3.5 px-4"><Check className="w-4 h-4 text-[#19C37D]" /></td>
                <td className="py-3.5 px-4"><Check className="w-4 h-4 text-[#19C37D]" /></td>
                <td className="py-3.5 pl-4"><Check className="w-4 h-4 text-[#19C37D]" /></td>
              </tr>
              <tr>
                <td className="py-3.5 pr-4 font-semibold text-[#111827] dark:text-[#F5F7FA]">Custom Engine Creation</td>
                <td className="py-3.5 px-4 text-[#667085]">—</td>
                <td className="py-3.5 px-4"><Check className="w-4 h-4 text-[#1677FF]" /></td>
                <td className="py-3.5 pl-4"><Check className="w-4 h-4 text-purple-500" /></td>
              </tr>
              <tr>
                <td className="py-3.5 pr-4 font-semibold text-[#111827] dark:text-[#F5F7FA]">Personal Google Drive OAuth</td>
                <td className="py-3.5 px-4 text-[#667085]">—</td>
                <td className="py-3.5 px-4"><Check className="w-4 h-4 text-[#1677FF]" /></td>
                <td className="py-3.5 pl-4"><Check className="w-4 h-4 text-purple-500" /></td>
              </tr>
              <tr>
                <td className="py-3.5 pr-4 font-semibold text-[#111827] dark:text-[#F5F7FA]">Automated Pro Scheduler</td>
                <td className="py-3.5 px-4 text-[#667085]">—</td>
                <td className="py-3.5 px-4"><Check className="w-4 h-4 text-[#1677FF]" /></td>
                <td className="py-3.5 pl-4"><Check className="w-4 h-4 text-purple-500" /></td>
              </tr>
              <tr>
                <td className="py-3.5 pr-4 font-semibold text-[#111827] dark:text-[#F5F7FA]">Authoritative Evidence RAG & Guardian</td>
                <td className="py-3.5 px-4"><Check className="w-4 h-4 text-[#19C37D]" /></td>
                <td className="py-3.5 px-4"><Check className="w-4 h-4 text-[#19C37D]" /></td>
                <td className="py-3.5 pl-4"><Check className="w-4 h-4 text-[#19C37D]" /></td>
              </tr>
              <tr>
                <td className="py-3.5 pr-4 font-semibold text-[#111827] dark:text-[#F5F7FA]">Hardware Cloud Rendering</td>
                <td className="py-3.5 px-4">Standard CPU</td>
                <td className="py-3.5 px-4">Priority Node</td>
                <td className="py-3.5 pl-4 font-semibold text-purple-500">Dedicated qualified GPU node</td>
              </tr>
              <tr>
                <td className="py-3.5 pr-4 font-semibold text-[#111827] dark:text-[#F5F7FA]">Factory Operations & Telemetry</td>
                <td className="py-3.5 px-4 text-[#667085]">—</td>
                <td className="py-3.5 px-4 text-[#667085]">—</td>
                <td className="py-3.5 pl-4"><Check className="w-4 h-4 text-purple-500" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Frequently Asked Questions */}
      <div className="bg-white dark:bg-[#070D18] border border-black/[0.06] dark:border-white/[0.08] rounded-3xl p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-[#1677FF]" />
          <h3 className="text-lg font-bold text-[#111827] dark:text-[#F5F7FA]">Frequently Asked Questions</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs leading-relaxed">
          <div className="p-4 rounded-2xl bg-black/[0.02] dark:bg-[#0E1728] border border-black/[0.04] dark:border-white/[0.04] space-y-2">
            <h4 className="font-bold text-[#111827] dark:text-[#F5F7FA]">How does the Basic 5 lifetime quota work?</h4>
            <p className="text-[#667085] dark:text-[#A8B2C1]">
              Every new creator account is gifted 5 free high-definition video generations. Once you have rendered 5 videos, you can upgrade to Pro to unlock 8 shorts each month.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-black/[0.02] dark:bg-[#0E1728] border border-black/[0.04] dark:border-white/[0.04] space-y-2">
            <h4 className="font-bold text-[#111827] dark:text-[#F5F7FA]">How does Pro Google Drive auto-upload work?</h4>
            <p className="text-[#667085] dark:text-[#A8B2C1]">
              Pro creators can connect their personal Google Drive account via OAuth with minimal folder permissions. Every generated or scheduled short is uploaded directly to your chosen folder.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-black/[0.02] dark:bg-[#0E1728] border border-black/[0.04] dark:border-white/[0.04] space-y-2">
            <h4 className="font-bold text-[#111827] dark:text-[#F5F7FA]">When does the Pro monthly quota reset?</h4>
            <p className="text-[#667085] dark:text-[#A8B2C1]">
              Your 8 video generation quota resets automatically at the start of each calendar billing period in UTC, tracked transparently on your dashboard ledger.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-black/[0.02] dark:bg-[#0E1728] border border-black/[0.04] dark:border-white/[0.04] space-y-2">
            <h4 className="font-bold text-[#111827] dark:text-[#F5F7FA]">Can I edit questions and reverify claims?</h4>
            <p className="text-[#667085] dark:text-[#A8B2C1]">
              Yes! All tiers have access to our AI Guardian and External Evidence RAG. If you modify a quiz question, you can reverify the claim against authoritative evidence before rendering.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
