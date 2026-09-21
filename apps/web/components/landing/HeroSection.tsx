"use client";

import React, { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { ArrowRight, Play, Pause, Volume2, VolumeX } from "lucide-react";
import HeroBackgroundCanvas from "./HeroBackgroundCanvas";

export default function HeroSection() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const video = videoRef.current;
    if (!video) return;

    // Guarantee muted before any play attempt — required for browser autoplay policies
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.loop = true;
    setIsMuted(true);

    const attemptPlay = () => {
      if (!video) return;
      video.muted = true;
      const p = video.play();
      if (p !== undefined) {
        p.then(() => setIsPlaying(true)).catch(() => {
          // If browser policy initially blocks before interaction, keep muted and retry on user interaction
          setIsPlaying(false);
        });
      }
    };

    if (video.readyState >= 2) {
      attemptPlay();
    } else {
      video.addEventListener("loadeddata", attemptPlay, { once: true });
      video.addEventListener("canplay", attemptPlay, { once: true });
    }

    // Fallback: trigger playback on first user interaction if still paused
    const handleFirstInteraction = () => {
      if (video && video.paused) {
        attemptPlay();
      }
    };

    window.addEventListener("pointerdown", handleFirstInteraction, { once: true, passive: true });
    window.addEventListener("scroll", handleFirstInteraction, { once: true, passive: true });
    window.addEventListener("keydown", handleFirstInteraction, { once: true, passive: true });

    // Resume when tab becomes visible again
    const onVisibility = () => {
      if (!document.hidden && video.paused) attemptPlay();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      video.removeEventListener("loadeddata", attemptPlay);
      video.removeEventListener("canplay", attemptPlay);
      window.removeEventListener("pointerdown", handleFirstInteraction);
      window.removeEventListener("scroll", handleFirstInteraction);
      window.removeEventListener("keydown", handleFirstInteraction);
    };
  }, []);

  const togglePlay = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {
        setIsPlaying(false);
      });
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;

    const willUnmute = video.muted;
    video.muted = !video.muted;
    setIsMuted(video.muted);
    // If user unmutes while paused, resume so they hear sound immediately
    if (willUnmute && video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  return (
    <section className="relative min-h-[92vh] flex items-center justify-center pt-36 pb-28 overflow-hidden select-none bg-[#f5f5f7]">
      {/* Living Ambient Production Background */}
      <HeroBackgroundCanvas />

      {/* Hero Radial Glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[550px] bg-sky-500/10 rounded-full blur-[160px] pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 lg:gap-12 items-center">
          
          {/* Left Column: Positioning & Headlines */}
          <div className="lg:col-span-7 space-y-8 text-left">
            
            {/* Frontier Category Badge */}
            <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-white border border-[#e8e8ed] text-xs font-text text-[#1d1d1f] shadow-xs">
              <span className="w-2 h-2 rounded-full bg-[#34c759] animate-pulse" />
              <span className="text-[#86868b] font-medium">NOW LIVE:</span>
              <span className="text-[#1d1d1f] font-semibold tracking-wide">QUIZ SHORTS GENERATION</span>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full bg-[#0071e3]/10 border border-[#0071e3]/20 text-[10px] font-bold tracking-wider text-[#0071e3]">MORE FORMATS COMING SOON</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-6xl lg:text-[72px] font-bold text-[#1d1d1f] font-display tracking-[-0.035em] leading-[1.04]">
              YOUR IDEA. <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#0071e3] via-sky-600 to-indigo-600 font-bold">
                INTO PRODUCTION.
              </span>
            </h1>

            {/* Concise Product Explanation */}
            <p className="text-lg sm:text-xl font-text text-[#6e6e73] max-w-2xl leading-relaxed tracking-apple-body">
              <strong className="text-[#1d1d1f] font-semibold">ShortForge</strong> is an autonomous AI video-production platform. Give the factory a natural brief and it orchestrates the entire lifecycle — from script and voice to rendered, validated 9:16 shorts.
            </p>

            {/* Core Workflow Pipeline Ribbon */}
            <div className="space-y-2 pt-1">
              <span className="text-[11px] font-text uppercase tracking-widest text-[#86868b] font-bold">
                CORE PRODUCTION WORKFLOW
              </span>
              <div className="flex flex-wrap items-center gap-1.5 p-3 rounded-2xl bg-white border border-[#e8e8ed] shadow-xs">
                {[
                  { name: "Idea", highlight: false },
                  { name: "Script", highlight: false },
                  { name: "Voice", highlight: false },
                  { name: "Visuals", highlight: false },
                  { name: "Subtitles", highlight: false },
                  { name: "Render", highlight: false },
                  { name: "Validate", highlight: false },
                  { name: "Deliver", highlight: true },
                ].map((step, idx, arr) => (
                  <React.Fragment key={step.name}>
                    <span
                      className={`px-2.5 py-1 rounded-lg text-xs font-text font-semibold transition-colors ${
                        step.highlight
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-[#f5f5f7] text-[#1d1d1f] border border-[#e8e8ed]"
                      }`}
                    >
                      {step.name}
                    </span>
                    {idx < arr.length - 1 && (
                      <span className="text-[#86868b] font-bold text-xs select-none">→</span>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-5 pt-2">
              <Link
                href="/login"
                className="px-9 py-4 rounded-2xl bg-[#0071e3] hover:bg-[#0066cc] text-white font-text text-base font-semibold tracking-wide transition-[transform,background-color,box-shadow] duration-160 ease-out shadow-xl shadow-sky-500/20 flex items-center justify-center gap-3 min-h-[52px] active:scale-[0.97]"
              >
                <span>START CREATING</span>
                <ArrowRight className="w-5 h-5" />
              </Link>

              <a
                href="#how-it-works"
                className="px-8 py-4 rounded-2xl bg-white hover:bg-[#f2f2f7] text-[#1d1d1f] border border-[#e8e8ed] font-text text-base font-medium transition-[transform,background-color,border-color] duration-160 ease-out flex items-center justify-center gap-2.5 min-h-[52px] active:scale-[0.98] shadow-xs"
              >
                <span>SEE HOW IT WORKS</span>
              </a>
            </div>

            {/* Production Promise Pills */}
            <div className={`grid grid-cols-3 gap-4 sm:gap-6 p-5 sm:p-6 bg-white rounded-2xl border border-[#e8e8ed] font-text text-xs text-[#6e6e73] shadow-xs reveal reveal-d4 ${mounted ? "visible" : ""}`}>
              <div>
                <span className="block text-[#86868b] text-[10px] uppercase tracking-wider mb-1 font-bold">INPUT</span>
                <span className="font-semibold text-[#1d1d1f] text-xs sm:text-sm">Natural Brief / Idea</span>
              </div>
              <div>
                <span className="block text-[#86868b] text-[10px] uppercase tracking-wider mb-1 font-bold">EXECUTION</span>
                <span className="font-semibold text-[#1d1d1f] text-xs sm:text-sm">Autonomous Factory</span>
              </div>
              <div>
                <span className="block text-[#86868b] text-[10px] uppercase tracking-wider mb-1 font-bold">OUTPUT</span>
                <span className="font-semibold text-[#1d1d1f] text-xs sm:text-sm">Rendered 9:16 Short</span>
              </div>
            </div>

          </div>

          {/* Right Column: Real 9:16 Vertical Video Showcase */}
          <div className="lg:col-span-5 flex justify-center">
            <div className={`relative w-full max-w-[320px] sm:max-w-[350px] aspect-[9/16] rounded-[36px] bg-[#1a1a1e] border-4 border-[#2c2c30] p-2.5 shadow-2xl shadow-black/25 group reveal reveal-d2 ${mounted ? "visible" : ""}`}>
              {/* Subtle outer frame highlight */}
              <div className="absolute inset-0 rounded-[32px] border border-white/10 pointer-events-none" />

              {/* Video Player Container */}
              <div 
                onClick={togglePlay}
                className="relative w-full h-full rounded-[26px] overflow-hidden bg-black flex items-center justify-center cursor-pointer select-none"
              >
                <video
                  ref={videoRef}
                  src="/german-quiz.mp4"
                  poster="/german-quiz-poster.jpg"
                  preload="auto"
                  autoPlay
                  loop
                  muted
                  playsInline
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onVolumeChange={(e) => setIsMuted(e.currentTarget.muted)}
                  className="w-full h-full object-cover"
                />

                {/* Translucent Overlay Badge */}
                <div className="absolute top-3.5 left-3.5 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-[11px] font-text text-white/90 flex items-center gap-2 z-20 shadow-xs pointer-events-none">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-medium tracking-wide">REAL SHORTFORGE RENDER</span>
                </div>

                {/* Center Big Play Button if Paused */}
                {!isPlaying && (
                  <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px] flex items-center justify-center z-15 transition-opacity">
                    <div className="w-16 h-16 rounded-full bg-[#0071e3]/90 hover:bg-[#0071e3] text-white flex items-center justify-center shadow-xl shadow-sky-500/30 transform transition-transform hover:scale-105 active:scale-95">
                      <Play className="w-7 h-7 fill-white ml-1" />
                    </div>
                  </div>
                )}

                {/* Playback Controls Overlay */}
                <div className="absolute bottom-3.5 right-3.5 flex items-center gap-2 z-20" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={togglePlay}
                    className="p-2.5 rounded-full bg-black/70 hover:bg-black/90 backdrop-blur-md border border-white/20 text-white transition-[transform,background-color] cursor-pointer active:scale-90 shadow-md"
                    title={isPlaying ? "Pause" : "Play"}
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={toggleMute}
                    className="p-2.5 rounded-full bg-black/70 hover:bg-black/90 backdrop-blur-md border border-white/20 text-white transition-[transform,background-color] cursor-pointer active:scale-90 shadow-md"
                    title={isMuted ? "Unmute Sound" : "Mute Sound"}
                  >
                    {isMuted ? <VolumeX className="w-4 h-4 text-white/80" /> : <Volume2 className="w-4 h-4 text-white" />}
                  </button>
                </div>
              </div>

              {/* Bottom Caption */}
              <div className="mt-2 text-center">
                <p className="text-[11px] font-text text-zinc-400">
                  Topic: "German Quiz" · Rendered by ShortForge Pipeline
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
