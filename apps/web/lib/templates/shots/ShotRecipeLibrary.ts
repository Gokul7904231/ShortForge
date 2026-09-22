import { ShotRecipeContract, ShotRecipeId } from '../schemas/TemplateSchema';

export const SHOT_RECIPES: Record<ShotRecipeId, ShotRecipeContract> = {
  KINETIC_HOOK: {
    id: 'KINETIC_HOOK',
    version: '1.0.0',
    name: 'Kinetic Hook',
    description: 'High-energy hook card with explosive typography and subtle background zoom',
    inputContract: {
      headline: 'string',
      subtitle: 'string?',
      highlightWord: 'string?'
    },
    durationPolicy: { minDuration: 1.5, maxDuration: 3.5, defaultDuration: 2.2, syncToAudio: true },
    layout: {
      safeArea: { top: 180, bottom: 340, left: 60, right: 120 },
      aspect: '9:16',
      zIndex: 10
    },
    motion: {
      enterTransition: 'ZOOM_IN_BOUNCE',
      exitTransition: 'FADE_QUICK',
      textAnimation: 'POP_WORD_STAGGER',
      cameraMotion: 'SLOW_PULL_BACK'
    },
    assetRequirements: [
      {
        role: 'background',
        type: 'IMAGE',
        optional: true,
        queryTemplate: 'dramatic cinematic background {headline}',
        semanticFallback: 'dark_gradient'
      }
    ],
    captionBehavior: { mode: 'WORD_HIGHLIGHT', position: 'LOWER_THIRD' },
    fallbackRecipeId: 'BIG_NUMBER'
  },

  BIG_NUMBER: {
    id: 'BIG_NUMBER',
    version: '1.0.0',
    name: 'Big Number Stat',
    description: 'Massive highlighted numerical stat with count-up animation and descriptive label',
    inputContract: {
      number: 'string | number',
      suffix: 'string?',
      label: 'string',
      context: 'string?'
    },
    durationPolicy: { minDuration: 1.5, maxDuration: 4.0, defaultDuration: 2.5, syncToAudio: true },
    layout: {
      safeArea: { top: 160, bottom: 320, left: 60, right: 120 },
      aspect: '9:16',
      zIndex: 5
    },
    motion: {
      enterTransition: 'SCALE_UP',
      exitTransition: 'SLIDE_DOWN',
      textAnimation: 'COUNT_UP',
      cameraMotion: 'NONE'
    },
    assetRequirements: [],
    captionBehavior: { mode: 'MINIMAL', position: 'LOWER_THIRD' },
    fallbackRecipeId: 'STAT'
  },

  IMAGE_WITH_CAPTION: {
    id: 'IMAGE_WITH_CAPTION',
    version: '1.0.0',
    name: 'Image with Caption Card',
    description: 'Framed visual focal element paired with clear lower-third or central narrative caption',
    inputContract: {
      caption: 'string',
      imageRef: 'string'
    },
    durationPolicy: { minDuration: 2.0, maxDuration: 6.0, defaultDuration: 3.5, syncToAudio: true },
    layout: {
      safeArea: { top: 160, bottom: 320, left: 60, right: 120 },
      aspect: '9:16',
      zIndex: 5
    },
    motion: {
      enterTransition: 'FADE_IN',
      exitTransition: 'CROSSFADE',
      textAnimation: 'FADE_UP',
      cameraMotion: 'KEN_BURNS_PAN'
    },
    assetRequirements: [
      {
        role: 'primaryImage',
        type: 'IMAGE',
        optional: false,
        queryTemplate: '{caption}',
        semanticFallback: 'informative_card'
      }
    ],
    captionBehavior: { mode: 'WORD_HIGHLIGHT', position: 'LOWER_THIRD' }
  },

  FULL_BLEED_IMAGE: {
    id: 'FULL_BLEED_IMAGE',
    version: '1.0.0',
    name: 'Full Bleed Image',
    description: 'Edge-to-edge high-resolution imagery with subtle parallax motion',
    inputContract: {
      imageRef: 'string',
      overlayOpacity: 'number?'
    },
    durationPolicy: { minDuration: 2.0, maxDuration: 6.0, defaultDuration: 3.5, syncToAudio: true },
    layout: {
      safeArea: { top: 160, bottom: 320, left: 60, right: 120 },
      aspect: '9:16',
      zIndex: 1
    },
    motion: {
      enterTransition: 'DISSOLVE',
      exitTransition: 'DISSOLVE',
      cameraMotion: 'KEN_BURNS_ZOOM_IN'
    },
    assetRequirements: [
      {
        role: 'heroImage',
        type: 'IMAGE',
        optional: false,
        semanticFallback: 'solid_background'
      }
    ],
    captionBehavior: { mode: 'WORD_HIGHLIGHT', position: 'CENTER' }
  },

  FULL_BLEED_BROLL: {
    id: 'FULL_BLEED_BROLL',
    version: '1.0.0',
    name: 'Full Bleed B-Roll Video',
    description: 'Dynamic edge-to-edge looping or timed ambient video footage',
    inputContract: {
      videoRef: 'string',
      playbackRate: 'number?'
    },
    durationPolicy: { minDuration: 2.0, maxDuration: 8.0, defaultDuration: 4.0, syncToAudio: true },
    layout: {
      safeArea: { top: 160, bottom: 320, left: 60, right: 120 },
      aspect: '9:16',
      zIndex: 1
    },
    motion: {
      enterTransition: 'CROSSFADE',
      exitTransition: 'CROSSFADE',
      cameraMotion: 'NONE'
    },
    assetRequirements: [
      {
        role: 'brollVideo',
        type: 'VIDEO',
        optional: false,
        semanticFallback: 'FULL_BLEED_IMAGE'
      }
    ],
    captionBehavior: { mode: 'WORD_HIGHLIGHT', position: 'LOWER_THIRD' },
    fallbackRecipeId: 'FULL_BLEED_IMAGE'
  },

  QUOTE_CARD: {
    id: 'QUOTE_CARD',
    version: '1.0.0',
    name: 'Quote Card',
    description: 'Elegant typography framing an inspirational or historical quotation with author attribution',
    inputContract: {
      quote: 'string',
      author: 'string',
      sourceOrTitle: 'string?'
    },
    durationPolicy: { minDuration: 2.5, maxDuration: 6.0, defaultDuration: 4.0, syncToAudio: true },
    layout: {
      safeArea: { top: 200, bottom: 340, left: 80, right: 120 },
      aspect: '9:16',
      zIndex: 5
    },
    motion: {
      enterTransition: 'SLIDE_UP_FADE',
      exitTransition: 'FADE_OUT',
      textAnimation: 'TYPEWRITER'
    },
    assetRequirements: [
      {
        role: 'authorPortrait',
        type: 'IMAGE',
        optional: true,
        queryTemplate: 'portrait of {author}',
        semanticFallback: 'monogram_avatar'
      }
    ],
    captionBehavior: { mode: 'HIDDEN', position: 'LOWER_THIRD' }
  },

  STAT: {
    id: 'STAT',
    version: '1.0.0',
    name: 'Comparative Stat',
    description: 'Clean data card displaying comparative percentage or metric breakdown',
    inputContract: {
      headline: 'string',
      value: 'string',
      trend: 'string?' // 'UP' | 'DOWN' | 'NEUTRAL'
    },
    durationPolicy: { minDuration: 1.8, maxDuration: 4.5, defaultDuration: 3.0, syncToAudio: true },
    layout: {
      safeArea: { top: 180, bottom: 320, left: 60, right: 120 },
      aspect: '9:16',
      zIndex: 5
    },
    motion: {
      enterTransition: 'SLIDE_LEFT',
      exitTransition: 'SLIDE_RIGHT',
      textAnimation: 'FADE_IN'
    },
    assetRequirements: [],
    captionBehavior: { mode: 'WORD_HIGHLIGHT', position: 'LOWER_THIRD' }
  },

  CODE_REVEAL: {
    id: 'CODE_REVEAL',
    version: '1.0.0',
    name: 'Syntax Highlighted Code Card',
    description: 'Deterministic syntax highlighted code block with line focus or typewriter typing',
    inputContract: {
      language: 'string',
      codeSnippet: 'string',
      highlightLines: 'number[]?'
    },
    durationPolicy: { minDuration: 2.5, maxDuration: 7.0, defaultDuration: 4.5, syncToAudio: true },
    layout: {
      safeArea: { top: 160, bottom: 340, left: 50, right: 120 },
      aspect: '9:16',
      zIndex: 5
    },
    motion: {
      enterTransition: 'WINDOW_EXPAND',
      exitTransition: 'FADE_OUT',
      textAnimation: 'TYPEWRITER'
    },
    assetRequirements: [
      {
        role: 'codeSnippet',
        type: 'CODE',
        optional: false,
        semanticFallback: 'TERMINAL_SCREEN'
      }
    ],
    captionBehavior: { mode: 'GROUPED', position: 'TOP' },
    fallbackRecipeId: 'TERMINAL_SCREEN'
  },

  TERMINAL_SCREEN: {
    id: 'TERMINAL_SCREEN',
    version: '1.0.0',
    name: 'Terminal Screen',
    description: 'Dark terminal window with retro command line output and pulsing cursor',
    inputContract: {
      command: 'string',
      output: 'string'
    },
    durationPolicy: { minDuration: 2.0, maxDuration: 6.0, defaultDuration: 3.5, syncToAudio: true },
    layout: {
      safeArea: { top: 180, bottom: 320, left: 50, right: 120 },
      aspect: '9:16',
      zIndex: 5
    },
    motion: {
      enterTransition: 'FADE_IN',
      exitTransition: 'FADE_OUT',
      textAnimation: 'TYPEWRITER'
    },
    assetRequirements: [],
    captionBehavior: { mode: 'MINIMAL', position: 'TOP' }
  },

  MAP_ZOOM: {
    id: 'MAP_ZOOM',
    version: '1.0.0',
    name: 'Map Location Zoom',
    description: 'Geographic map card with pin reveal and smooth zoom into region/country',
    inputContract: {
      countryOrRegion: 'string',
      pinLabel: 'string'
    },
    durationPolicy: { minDuration: 2.5, maxDuration: 6.0, defaultDuration: 4.0, syncToAudio: true },
    layout: {
      safeArea: { top: 160, bottom: 320, left: 60, right: 120 },
      aspect: '9:16',
      zIndex: 5
    },
    motion: {
      enterTransition: 'ZOOM_IN_SMOOTH',
      exitTransition: 'CROSSFADE',
      cameraMotion: 'PAN_TO_PIN'
    },
    assetRequirements: [
      {
        role: 'mapImage',
        type: 'IMAGE',
        optional: false,
        queryTemplate: 'map of {countryOrRegion}',
        semanticFallback: 'FLAG_REVEAL'
      }
    ],
    captionBehavior: { mode: 'WORD_HIGHLIGHT', position: 'LOWER_THIRD' },
    fallbackRecipeId: 'FLAG_REVEAL'
  },

  TIMELINE_BUILD: {
    id: 'TIMELINE_BUILD',
    version: '1.0.0',
    name: 'Timeline Milestone',
    description: 'Vertical or horizontal sequential timeline node highlighting year/era and pivotal event',
    inputContract: {
      yearOrEra: 'string',
      title: 'string',
      description: 'string'
    },
    durationPolicy: { minDuration: 2.0, maxDuration: 5.0, defaultDuration: 3.5, syncToAudio: true },
    layout: {
      safeArea: { top: 180, bottom: 320, left: 60, right: 120 },
      aspect: '9:16',
      zIndex: 5
    },
    motion: {
      enterTransition: 'SLIDE_DOWN_GROW',
      exitTransition: 'SLIDE_UP',
      textAnimation: 'FADE_IN'
    },
    assetRequirements: [
      {
        role: 'milestoneImage',
        type: 'IMAGE',
        optional: true,
        queryTemplate: '{title} {yearOrEra}',
        semanticFallback: 'informative_card'
      }
    ],
    captionBehavior: { mode: 'WORD_HIGHLIGHT', position: 'LOWER_THIRD' }
  },

  HEADLINE_CARD: {
    id: 'HEADLINE_CARD',
    version: '1.0.0',
    name: 'News Headline Card',
    description: 'Authoritative breaking news or evidence banner with source logo and publication tag',
    inputContract: {
      headline: 'string',
      sourceName: 'string',
      dateStr: 'string?'
    },
    durationPolicy: { minDuration: 2.0, maxDuration: 4.5, defaultDuration: 3.0, syncToAudio: true },
    layout: {
      safeArea: { top: 180, bottom: 320, left: 60, right: 120 },
      aspect: '9:16',
      zIndex: 10
    },
    motion: {
      enterTransition: 'SLIDE_DOWN',
      exitTransition: 'FADE_OUT',
      textAnimation: 'POP_WORD_STAGGER'
    },
    assetRequirements: [
      {
        role: 'sourceLogo',
        type: 'LOGO',
        optional: true,
        queryTemplate: 'logo of {sourceName}',
        semanticFallback: 'text_source_badge'
      }
    ],
    captionBehavior: { mode: 'WORD_HIGHLIGHT', position: 'LOWER_THIRD' }
  },

  SOURCE_CARD: {
    id: 'SOURCE_CARD',
    version: '1.0.0',
    name: 'Source Evidence Card',
    description: 'Citation and research provenance display groundable in verified research pack',
    inputContract: {
      title: 'string',
      url: 'string?',
      snippet: 'string'
    },
    durationPolicy: { minDuration: 2.0, maxDuration: 4.5, defaultDuration: 3.0, syncToAudio: true },
    layout: {
      safeArea: { top: 200, bottom: 340, left: 70, right: 120 },
      aspect: '9:16',
      zIndex: 5
    },
    motion: {
      enterTransition: 'FADE_IN',
      exitTransition: 'FADE_OUT'
    },
    assetRequirements: [],
    captionBehavior: { mode: 'MINIMAL', position: 'LOWER_THIRD' }
  },

  REDDIT_POST: {
    id: 'REDDIT_POST',
    version: '1.0.0',
    name: 'Reddit Post Card',
    description: 'Pixel-accurate native Reddit post header with subreddit icon, upvote badge, and question',
    inputContract: {
      subreddit: 'string',
      author: 'string',
      title: 'string',
      upvotes: 'string?'
    },
    durationPolicy: { minDuration: 2.5, maxDuration: 6.0, defaultDuration: 4.0, syncToAudio: true },
    layout: {
      safeArea: { top: 180, bottom: 340, left: 50, right: 120 },
      aspect: '9:16',
      zIndex: 10
    },
    motion: {
      enterTransition: 'POP_IN',
      exitTransition: 'SLIDE_UP',
      textAnimation: 'FADE_IN'
    },
    assetRequirements: [
      {
        role: 'subredditIcon',
        type: 'LOGO',
        optional: true,
        queryTemplate: 'r/{subreddit} icon',
        semanticFallback: 'reddit_default_avatar'
      }
    ],
    captionBehavior: { mode: 'WORD_HIGHLIGHT', position: 'LOWER_THIRD' }
  },

  REDDIT_COMMENT: {
    id: 'REDDIT_COMMENT',
    version: '1.0.0',
    name: 'Reddit Comment Thread',
    description: 'Threaded Reddit comment reply with avatar, username, and highlighted answer text',
    inputContract: {
      author: 'string',
      commentText: 'string',
      upvotes: 'string?'
    },
    durationPolicy: { minDuration: 2.5, maxDuration: 6.0, defaultDuration: 4.0, syncToAudio: true },
    layout: {
      safeArea: { top: 180, bottom: 340, left: 50, right: 120 },
      aspect: '9:16',
      zIndex: 8
    },
    motion: {
      enterTransition: 'SLIDE_LEFT',
      exitTransition: 'FADE_OUT',
      textAnimation: 'FADE_UP'
    },
    assetRequirements: [],
    captionBehavior: { mode: 'WORD_HIGHLIGHT', position: 'LOWER_THIRD' }
  },

  QUESTION_CARD: {
    id: 'QUESTION_CARD',
    version: '1.0.0',
    name: 'Trivia Question Card',
    description: 'Engaging multiple choice or open trivia challenge card with suspenseful countdown prompt',
    inputContract: {
      question: 'string',
      options: 'string[]?',
      categoryBadge: 'string?'
    },
    durationPolicy: { minDuration: 2.5, maxDuration: 6.0, defaultDuration: 4.0, syncToAudio: true },
    layout: {
      safeArea: { top: 180, bottom: 320, left: 60, right: 120 },
      aspect: '9:16',
      zIndex: 10
    },
    motion: {
      enterTransition: 'ZOOM_IN_BOUNCE',
      exitTransition: 'FADE_OUT',
      textAnimation: 'POP_WORD_STAGGER'
    },
    assetRequirements: [],
    captionBehavior: { mode: 'WORD_HIGHLIGHT', position: 'TOP' }
  },

  ANSWER_REVEAL: {
    id: 'ANSWER_REVEAL',
    version: '1.0.0',
    name: 'Answer Reveal',
    description: 'Punchy reveal card highlighting correct answer with celebration particle effect and explanation',
    inputContract: {
      correctOption: 'string',
      explanation: 'string'
    },
    durationPolicy: { minDuration: 2.0, maxDuration: 5.0, defaultDuration: 3.5, syncToAudio: true },
    layout: {
      safeArea: { top: 180, bottom: 320, left: 60, right: 120 },
      aspect: '9:16',
      zIndex: 10
    },
    motion: {
      enterTransition: 'PULSE_GROW',
      exitTransition: 'FADE_OUT',
      textAnimation: 'EXPLODING_LETTER_HIGHLIGHT'
    },
    assetRequirements: [],
    captionBehavior: { mode: 'WORD_HIGHLIGHT', position: 'LOWER_THIRD' }
  },

  COUNTDOWN: {
    id: 'COUNTDOWN',
    version: '1.0.0',
    name: 'Visual Countdown Timer',
    description: 'Dynamic circular or bar timer counting down 3... 2... 1... with tick sound sync',
    inputContract: {
      seconds: 'number'
    },
    durationPolicy: { minDuration: 1.5, maxDuration: 5.0, defaultDuration: 3.0, syncToAudio: false },
    layout: {
      safeArea: { top: 200, bottom: 340, left: 100, right: 140 },
      aspect: '9:16',
      zIndex: 8
    },
    motion: {
      enterTransition: 'FADE_IN',
      exitTransition: 'FADE_OUT',
      textAnimation: 'RADIAL_SWEEP'
    },
    assetRequirements: [],
    captionBehavior: { mode: 'HIDDEN', position: 'CENTER' }
  },

  FLAG_REVEAL: {
    id: 'FLAG_REVEAL',
    version: '1.0.0',
    name: 'National Flag Reveal',
    description: 'High-res country flag visual with wavy cloth motion and country label reveal',
    inputContract: {
      countryCode: 'string',
      countryName: 'string'
    },
    durationPolicy: { minDuration: 2.0, maxDuration: 5.0, defaultDuration: 3.5, syncToAudio: true },
    layout: {
      safeArea: { top: 160, bottom: 320, left: 60, right: 120 },
      aspect: '9:16',
      zIndex: 5
    },
    motion: {
      enterTransition: 'ROTATE_FLIP_IN',
      exitTransition: 'FADE_OUT',
      cameraMotion: 'SLOW_PULL_BACK'
    },
    assetRequirements: [
      {
        role: 'flagAsset',
        type: 'FLAG',
        optional: false,
        queryTemplate: '{countryCode}',
        semanticFallback: 'IMAGE_WITH_CAPTION'
      }
    ],
    captionBehavior: { mode: 'WORD_HIGHLIGHT', position: 'LOWER_THIRD' }
  },

  LOGO_REVEAL: {
    id: 'LOGO_REVEAL',
    version: '1.0.0',
    name: 'Brand Logo Reveal',
    description: 'Silhouette, blurred, or fragment logo that resolves into full color brand asset',
    inputContract: {
      brandName: 'string',
      mode: 'string?' // 'BLUR_REVEAL' | 'FRAGMENT' | 'COLOR_BURST'
    },
    durationPolicy: { minDuration: 2.0, maxDuration: 5.0, defaultDuration: 3.5, syncToAudio: true },
    layout: {
      safeArea: { top: 180, bottom: 320, left: 60, right: 120 },
      aspect: '9:16',
      zIndex: 5
    },
    motion: {
      enterTransition: 'BLUR_DISSOLVE',
      exitTransition: 'FADE_OUT'
    },
    assetRequirements: [
      {
        role: 'logoAsset',
        type: 'LOGO',
        optional: false,
        queryTemplate: '{brandName}',
        semanticFallback: 'IMAGE_WITH_CAPTION'
      }
    ],
    captionBehavior: { mode: 'WORD_HIGHLIGHT', position: 'LOWER_THIRD' }
  },

  PROGRESSIVE_CLUE: {
    id: 'PROGRESSIVE_CLUE',
    version: '1.0.0',
    name: 'Progressive Clue List',
    description: 'Sequentially revealed clue cards (Clue 1, Clue 2, Clue 3) with checkmarks',
    inputContract: {
      clueIndex: 'number',
      totalClues: 'number',
      clueText: 'string'
    },
    durationPolicy: { minDuration: 2.0, maxDuration: 4.5, defaultDuration: 3.0, syncToAudio: true },
    layout: {
      safeArea: { top: 180, bottom: 320, left: 60, right: 120 },
      aspect: '9:16',
      zIndex: 6
    },
    motion: {
      enterTransition: 'SLIDE_RIGHT_STAGGER',
      exitTransition: 'FADE_OUT'
    },
    assetRequirements: [],
    captionBehavior: { mode: 'WORD_HIGHLIGHT', position: 'LOWER_THIRD' }
  },

  CHART: {
    id: 'CHART',
    version: '1.0.0',
    name: 'Deterministic Animated Chart',
    description: 'Rendered bar chart or pie breakdown with animated bar growth and percentage labels',
    inputContract: {
      chartType: 'string', // 'BAR' | 'PIE' | 'LINE'
      data: 'Array<{ label: string, value: number }>',
      title: 'string'
    },
    durationPolicy: { minDuration: 2.5, maxDuration: 6.0, defaultDuration: 4.0, syncToAudio: true },
    layout: {
      safeArea: { top: 180, bottom: 320, left: 60, right: 120 },
      aspect: '9:16',
      zIndex: 5
    },
    motion: {
      enterTransition: 'GROW_FROM_BOTTOM',
      exitTransition: 'FADE_OUT'
    },
    assetRequirements: [
      {
        role: 'chartData',
        type: 'CHART',
        optional: false,
        semanticFallback: 'STAT'
      }
    ],
    captionBehavior: { mode: 'WORD_HIGHLIGHT', position: 'TOP' },
    fallbackRecipeId: 'STAT'
  },

  AUDIO_WAVEFORM: {
    id: 'AUDIO_WAVEFORM',
    version: '1.0.0',
    name: 'Reactive Audio Waveform',
    description: 'Pulsing vertical audio bar visualizer driven by narrator voice frequency envelope',
    inputContract: {
      speakerLabel: 'string?'
    },
    durationPolicy: { minDuration: 2.0, maxDuration: 10.0, defaultDuration: 4.0, syncToAudio: true },
    layout: {
      safeArea: { top: 220, bottom: 360, left: 80, right: 120 },
      aspect: '9:16',
      zIndex: 4
    },
    motion: {
      enterTransition: 'FADE_IN',
      exitTransition: 'FADE_OUT'
    },
    assetRequirements: [],
    captionBehavior: { mode: 'WORD_HIGHLIGHT', position: 'CENTER' }
  },

  OUTRO_CTA: {
    id: 'OUTRO_CTA',
    version: '1.0.0',
    name: 'Outro Call To Action',
    description: 'Closing call to action card with subscribe/follow pulse, avatar badge, and next video hook',
    inputContract: {
      ctaText: 'string',
      channelHandle: 'string?'
    },
    durationPolicy: { minDuration: 2.0, maxDuration: 4.5, defaultDuration: 3.0, syncToAudio: true },
    layout: {
      safeArea: { top: 200, bottom: 340, left: 60, right: 120 },
      aspect: '9:16',
      zIndex: 10
    },
    motion: {
      enterTransition: 'BOUNCE_UP',
      exitTransition: 'FADE_OUT',
      textAnimation: 'PULSE_GLOW'
    },
    assetRequirements: [],
    captionBehavior: { mode: 'MINIMAL', position: 'LOWER_THIRD' }
  }
};
