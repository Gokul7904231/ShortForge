"use client";

import React, { memo } from "react";
import type { ExpressionConfig } from "./OverseerStateMachine";

interface StatusRingProps {
  expression: ExpressionConfig;
}

export const OverseerStatusRing: React.FC<StatusRingProps> = memo(({ expression }) => {
  const { primaryColor, secondaryColor, ringMode, ringSpeed } = expression;

  return (
    <g className="overseer-status-ring">
      <defs>
        <linearGradient id="ring-glow-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={primaryColor} stopOpacity="0.85" />
          <stop offset="50%" stopColor={secondaryColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={primaryColor} stopOpacity="0.05" />
        </linearGradient>
      </defs>



      {/* Outer Fine Dash Circle */}
      <circle
        cx="140"
        cy="85"
        r="80"
        fill="none"
        stroke={primaryColor}
        strokeWidth="0.75"
        strokeDasharray="2 10"
        strokeOpacity="0.2"
      />

      {/* 4 Cardinal Telemetry Ticks */}
      <g stroke={primaryColor} strokeWidth="1.5" strokeOpacity="0.4">
        {/* Top Tick */}
        <line x1="140" y1="6" x2="140" y2="11" />
        {/* Bottom Tick */}
        <line x1="140" y1="159" x2="140" y2="164" />
        {/* Left Tick */}
        <line x1="61" y1="85" x2="66" y2="85" />
        {/* Right Tick */}
        <line x1="214" y1="85" x2="219" y2="85" />
      </g>


    </g>
  );
});

OverseerStatusRing.displayName = "OverseerStatusRing";
