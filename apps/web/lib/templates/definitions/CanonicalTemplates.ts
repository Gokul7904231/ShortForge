import { TemplateDefinition } from '../schemas/TemplateSchema';

export const CANONICAL_TEMPLATES: TemplateDefinition[] = [
  // 1. Facts - Rapid Facts
  {
    identity: {
      id: 'facts.rapid-facts.v1',
      version: '1.0.0',
      name: 'Rapid Fire Facts',
      slug: 'rapid-facts',
      author: 'FactoryOS Core',
      isSystem: true
    },
    category: 'FACTS',
    formatFamily: 'Rapid Fire Information',
    description: 'High-octane barrage of mind-blowing verified facts with bold stat highlights and punchy sound design',
    tags: ['facts', 'viral', 'educational', 'fast-paced'],
    storyStructure: [
      { stepName: 'Hook', purpose: 'Grab immediate attention with counter-intuitive premise', shotRecipeId: 'KINETIC_HOOK', recommendedDurationSeconds: 2.5 },
      { stepName: 'Fact 1', purpose: 'Introduce first rapid fact with image and caption', shotRecipeId: 'IMAGE_WITH_CAPTION', recommendedDurationSeconds: 4.0 },
      { stepName: 'Stat Highlight', purpose: 'Punch the core metric with massive big number', shotRecipeId: 'BIG_NUMBER', recommendedDurationSeconds: 2.5 },
      { stepName: 'Fact 2', purpose: 'Introduce second rapid fact with visual context', shotRecipeId: 'IMAGE_WITH_CAPTION', recommendedDurationSeconds: 4.0 },
      { stepName: 'Comparative Stat', purpose: 'Show comparative scale or trend', shotRecipeId: 'STAT', recommendedDurationSeconds: 3.0 },
      { stepName: 'Mindblower Payoff', purpose: 'Deliver the climax fact', shotRecipeId: 'FULL_BLEED_IMAGE', recommendedDurationSeconds: 4.5 },
      { stepName: 'Call To Action', purpose: 'Closing engagement loop', shotRecipeId: 'OUTRO_CTA', recommendedDurationSeconds: 2.5 }
    ],
    inputContract: {
      variables: [
        { name: 'topic', type: 'string', label: 'Topic / Subject', required: true, description: 'Subject of the facts (e.g. Deep Sea Creatures, Black Holes)' },
        { name: 'factCount', type: 'number', label: 'Fact Count', required: false, default: 3, description: 'Number of discrete facts to pack' }
      ],
      promptSeed: 'Generate 3 rapid, mind-blowing, verified facts about {topic} with exact statistics and vivid visual imagery.'
    },
    visualPolicy: {
      colorPalette: ['#090A0F', '#1E1B4B', '#6366F1', '#A5B4FC', '#F8FAFC'],
      typography: { headerFont: 'Inter-Black', bodyFont: 'Inter-SemiBold', accentColor: '#6366F1' },
      motionIntensity: 'HIGH'
    },
    captionPolicy: {
      style: 'TiktokBouncy',
      defaultPosition: 'LOWER_THIRD',
      maxWordsPerLine: 3,
      highlightColor: '#FDE047'
    },
    voicePolicy: {
      paceMultiplier: 1.12,
      tone: 'urgent, energized, breathless delivery',
      suggestedVoices: ['en-US-Neural2-F', 'en-US-Journey-F']
    },
    outputPolicy: {
      width: 1080,
      height: 1920,
      fps: 30,
      targetDurationRange: [25, 45]
    },
    capabilityStatus: 'READY',
    statusReason: 'Production qualified with full native render and Wikimedia provider.'
  },

  // 2. History - Timeline Documentary
  {
    identity: {
      id: 'history.timeline.v1',
      version: '1.0.0',
      name: 'Historical Timeline',
      slug: 'historical-timeline',
      author: 'FactoryOS Core',
      isSystem: true
    },
    category: 'HISTORY',
    formatFamily: 'Timeline Documentary',
    description: 'Cinematic chronological descent through pivotal historical events with authentic archival imagery and geographic context',
    tags: ['history', 'documentary', 'timeline', 'educational'],
    storyStructure: [
      { stepName: 'Pivotal Question Hook', purpose: 'Open on turning point in human history', shotRecipeId: 'KINETIC_HOOK', recommendedDurationSeconds: 3.0 },
      { stepName: 'Geographic Context', purpose: 'Zoom into geographic map of the conflict/empire', shotRecipeId: 'MAP_ZOOM', recommendedDurationSeconds: 4.0 },
      { stepName: 'Milestone 1', purpose: 'First historical inflection point', shotRecipeId: 'TIMELINE_BUILD', recommendedDurationSeconds: 4.5 },
      { stepName: 'Archival Focus', purpose: 'High impact historical artifact or painting', shotRecipeId: 'FULL_BLEED_IMAGE', recommendedDurationSeconds: 4.0 },
      { stepName: 'Milestone 2', purpose: 'Climax of the historical sequence', shotRecipeId: 'TIMELINE_BUILD', recommendedDurationSeconds: 4.5 },
      { stepName: 'Historical Quotation', purpose: 'Direct quote from historical eyewitness', shotRecipeId: 'QUOTE_CARD', recommendedDurationSeconds: 4.0 },
      { stepName: 'Legacy Payoff', purpose: 'How this echoes into the modern world', shotRecipeId: 'IMAGE_WITH_CAPTION', recommendedDurationSeconds: 4.5 },
      { stepName: 'Outro', purpose: 'Closing reflection', shotRecipeId: 'OUTRO_CTA', recommendedDurationSeconds: 2.5 }
    ],
    inputContract: {
      variables: [
        { name: 'historicalEvent', type: 'string', label: 'Historical Event / Era', required: true, description: 'Event or figure (e.g. Fall of Constantinople 1453, Apollo 11)' },
        { name: 'keyYear', type: 'string', label: 'Key Year / Era', required: true, description: 'Primary date milestone' }
      ],
      promptSeed: 'Chronicle the pivotal timeline of {historicalEvent} ({keyYear}) with dramatic historical milestones and primary source quotes.'
    },
    visualPolicy: {
      colorPalette: ['#1C1917', '#292524', '#D97706', '#F59E0B', '#FAF7ED'],
      typography: { headerFont: 'Cinzel-Bold', bodyFont: 'PlayfairDisplay-Regular', accentColor: '#D97706' },
      motionIntensity: 'MEDIUM'
    },
    captionPolicy: {
      style: 'CinematicSubtitles',
      defaultPosition: 'LOWER_THIRD',
      maxWordsPerLine: 5,
      highlightColor: '#F59E0B'
    },
    voicePolicy: {
      paceMultiplier: 0.96,
      tone: 'deep, grave, cinematic narrator',
      suggestedVoices: ['en-US-Neural2-D', 'en-US-Wavenet-D']
    },
    outputPolicy: {
      width: 1080,
      height: 1920,
      fps: 30,
      targetDurationRange: [35, 55]
    },
    capabilityStatus: 'READY',
    statusReason: 'Production qualified with Wikimedia archival imagery and map resolver.'
  },

  // 3. Motivation - Story to Lesson
  {
    identity: {
      id: 'motivation.story-to-lesson.v1',
      version: '1.0.0',
      name: 'Story to Hard Lesson',
      slug: 'story-to-lesson',
      author: 'FactoryOS Core',
      isSystem: true
    },
    category: 'MOTIVATION',
    formatFamily: 'Philosophical Storytelling',
    description: 'Gripping parable or real adversity narrative that crystallizes into an unforgettable life rule',
    tags: ['motivation', 'mindset', 'stoicism', 'discipline'],
    storyStructure: [
      { stepName: 'Harsh Truth Hook', purpose: 'Call out uncomfortable reality immediately', shotRecipeId: 'KINETIC_HOOK', recommendedDurationSeconds: 3.0 },
      { stepName: 'The Struggle', purpose: 'Introduce the figure at their lowest breaking point', shotRecipeId: 'IMAGE_WITH_CAPTION', recommendedDurationSeconds: 4.5 },
      { stepName: 'Atmospheric Mood', purpose: 'Build tension through ambient b-roll', shotRecipeId: 'FULL_BLEED_BROLL', recommendedDurationSeconds: 4.0 },
      { stepName: 'Core Rule', purpose: 'Deliver the foundational quote or mindset shift', shotRecipeId: 'QUOTE_CARD', recommendedDurationSeconds: 4.5 },
      { stepName: 'Actionable Lesson', purpose: 'Break down how to apply this tomorrow morning', shotRecipeId: 'STAT', recommendedDurationSeconds: 3.5 },
      { stepName: 'Closing Call', purpose: 'Call to discipline and reflection', shotRecipeId: 'OUTRO_CTA', recommendedDurationSeconds: 3.0 }
    ],
    inputContract: {
      variables: [
        { name: 'theme', type: 'string', label: 'Mindset Theme', required: true, description: 'Core theme (e.g. Overcoming Betrayal, The Cost of Discipline)' },
        { name: 'protagonist', type: 'string', label: 'Figure / Protagonist', required: false, description: 'Optional real figure (e.g. Marcus Aurelius, David Goggins)' }
      ],
      promptSeed: 'Construct a gripping story illustrating {theme} featuring {protagonist}, concluding with an uncompromising rule for life.'
    },
    visualPolicy: {
      colorPalette: ['#000000', '#18181B', '#27272A', '#E4E4E7', '#FFFFFF'],
      typography: { headerFont: 'Inter-ExtraBold', bodyFont: 'Inter-Medium', accentColor: '#E4E4E7' },
      motionIntensity: 'LOW'
    },
    captionPolicy: {
      style: 'MinimalClean',
      defaultPosition: 'CENTER',
      maxWordsPerLine: 3,
      highlightColor: '#FFFFFF'
    },
    voicePolicy: {
      paceMultiplier: 0.92,
      tone: 'stoic, deliberate, grounded authority',
      suggestedVoices: ['en-US-Neural2-J', 'en-US-Studio-M']
    },
    outputPolicy: {
      width: 1080,
      height: 1920,
      fps: 30,
      targetDurationRange: [30, 50]
    },
    capabilityStatus: 'READY',
    statusReason: 'Production qualified with full monochrome aesthetic and quote card engine.'
  },

  // 4. Reddit - Native Reddit Story
  {
    identity: {
      id: 'reddit.story.v1',
      version: '1.0.0',
      name: 'Reddit Viral Story',
      slug: 'reddit-story',
      author: 'FactoryOS Core',
      isSystem: true
    },
    category: 'REDDIT',
    formatFamily: 'First-Person Confessional',
    description: 'Pixel-perfect Reddit UI card opening into dramatic conversational confession with comment reactions',
    tags: ['reddit', 'storytime', 'drama', 'aita', 'viral'],
    storyStructure: [
      { stepName: 'Reddit Post Hook', purpose: 'Native Reddit post card with viral title and upvotes', shotRecipeId: 'REDDIT_POST', recommendedDurationSeconds: 3.5 },
      { stepName: 'The Context', purpose: 'Narrator begins unpacking the crazy situation', shotRecipeId: 'IMAGE_WITH_CAPTION', recommendedDurationSeconds: 4.5 },
      { stepName: 'Escalation', purpose: 'Ambient visual tension as the conflict peaks', shotRecipeId: 'FULL_BLEED_IMAGE', recommendedDurationSeconds: 4.0 },
      { stepName: 'Top Comment Reaction', purpose: 'Hilarious or scathing community comment thread', shotRecipeId: 'REDDIT_COMMENT', recommendedDurationSeconds: 4.0 },
      { stepName: 'The Twist', purpose: 'Unexpected revelation', shotRecipeId: 'IMAGE_WITH_CAPTION', recommendedDurationSeconds: 4.5 },
      { stepName: 'Outro Poll', purpose: 'Ask viewer: Who was in the wrong?', shotRecipeId: 'OUTRO_CTA', recommendedDurationSeconds: 2.5 }
    ],
    inputContract: {
      variables: [
        { name: 'subreddit', type: 'string', label: 'Subreddit', required: true, default: 'AmItheAsshole', description: 'Source subreddit (e.g. AmItheAsshole, confessions, MaliciousCompliance)' },
        { name: 'postTitle', type: 'string', label: 'Post Title', required: true, description: 'Viral title of the Reddit post' }
      ],
      promptSeed: 'Transform this Reddit post from r/{subreddit}: "{postTitle}" into a punchy, dramatic 45-second first-person story with a top comment twist.'
    },
    visualPolicy: {
      colorPalette: ['#030303', '#1A1A1B', '#FF4500', '#D7DADC', '#FFFFFF'],
      typography: { headerFont: 'NotoSans-Bold', bodyFont: 'NotoSans-Regular', accentColor: '#FF4500' },
      motionIntensity: 'MEDIUM'
    },
    captionPolicy: {
      style: 'RedditHighlight',
      defaultPosition: 'LOWER_THIRD',
      maxWordsPerLine: 4,
      highlightColor: '#FF4500'
    },
    voicePolicy: {
      paceMultiplier: 1.05,
      tone: 'conversational, bewildered, authentic first-person storytelling',
      suggestedVoices: ['en-US-Neural2-F', 'en-US-Journey-O']
    },
    outputPolicy: {
      width: 1080,
      height: 1920,
      fps: 30,
      targetDurationRange: [35, 55]
    },
    capabilityStatus: 'READY',
    statusReason: 'Production qualified with pixel-accurate Reddit UI cards and comment threads.'
  },

  // 5. News - Why It Matters
  {
    identity: {
      id: 'news.why-it-matters.v1',
      version: '1.0.0',
      name: 'Why It Matters News',
      slug: 'why-it-matters',
      author: 'FactoryOS Core',
      isSystem: true
    },
    category: 'NEWS',
    formatFamily: 'Evidence-Grounded Explainer',
    description: 'Current affairs breakdown cutting past the noise to explain the real financial, tech, or geopolitical consequence',
    tags: ['news', 'finance', 'tech', 'geopolitics', 'current-events'],
    storyStructure: [
      { stepName: 'Breaking Headline', purpose: 'Authoritative headline banner with publisher citation', shotRecipeId: 'HEADLINE_CARD', recommendedDurationSeconds: 3.0 },
      { stepName: 'Source Citation', purpose: 'Evidence and data citation card', shotRecipeId: 'SOURCE_CARD', recommendedDurationSeconds: 3.5 },
      { stepName: 'Data Impact', purpose: 'Chart or stat proving real scale', shotRecipeId: 'STAT', recommendedDurationSeconds: 3.5 },
      { stepName: 'Context Visual', purpose: 'High-res news b-roll or photo', shotRecipeId: 'IMAGE_WITH_CAPTION', recommendedDurationSeconds: 4.0 },
      { stepName: 'Why It Matters', purpose: 'Direct explanation of how this affects viewer wallet or future', shotRecipeId: 'QUOTE_CARD', recommendedDurationSeconds: 4.5 },
      { stepName: 'Outro', purpose: 'Closing discussion prompt', shotRecipeId: 'OUTRO_CTA', recommendedDurationSeconds: 2.5 }
    ],
    inputContract: {
      variables: [
        { name: 'headline', type: 'string', label: 'News Headline', required: true, description: 'Core breaking headline' },
        { name: 'source', type: 'string', label: 'News Source', required: true, default: 'Reuters', description: 'Primary journalistic citation' }
      ],
      promptSeed: 'Break down "{headline}" (Source: {source}) into why it genuinely matters to ordinary people, with hard data points.'
    },
    visualPolicy: {
      colorPalette: ['#0B0F19', '#111827', '#EF4444', '#38BDF8', '#F9FAFB'],
      typography: { headerFont: 'Inter-Black', bodyFont: 'Inter-Medium', accentColor: '#EF4444' },
      motionIntensity: 'MEDIUM'
    },
    captionPolicy: {
      style: 'NewsTicker',
      defaultPosition: 'LOWER_THIRD',
      maxWordsPerLine: 4,
      highlightColor: '#38BDF8'
    },
    voicePolicy: {
      paceMultiplier: 1.08,
      tone: 'urgent, sharp, journalistic credibility',
      suggestedVoices: ['en-US-Neural2-A', 'en-US-News-M']
    },
    outputPolicy: {
      width: 1080,
      height: 1920,
      fps: 30,
      targetDurationRange: [30, 50]
    },
    capabilityStatus: 'READY',
    statusReason: 'Production qualified with Reach RSS feeds, headline cards, and source citations.'
  },

  // 6. Coding - Syntax Highlighted Explainer
  {
    identity: {
      id: 'coding.code-explainer.v1',
      version: '1.0.0',
      name: 'Code Snippet Explainer',
      slug: 'code-explainer',
      author: 'FactoryOS Core',
      isSystem: true
    },
    category: 'CODING',
    formatFamily: 'Developer Tutorial',
    description: 'Clean syntax highlighted terminal and IDE breakdown explaining subtle bugs or elegant modern patterns',
    tags: ['coding', 'programming', 'developer', 'software', 'tutorial'],
    storyStructure: [
      { stepName: 'Problem Hook', purpose: 'Show terrible or broken code snippet', shotRecipeId: 'KINETIC_HOOK', recommendedDurationSeconds: 3.0 },
      { stepName: 'Code Walkthrough', purpose: 'Syntax highlighted code reveal with line focus', shotRecipeId: 'CODE_REVEAL', recommendedDurationSeconds: 5.0 },
      { stepName: 'Terminal Execution', purpose: 'Show console error or benchmark output', shotRecipeId: 'TERMINAL_SCREEN', recommendedDurationSeconds: 4.0 },
      { stepName: 'Solution Code', purpose: 'Syntax highlighted modern one-liner or fix', shotRecipeId: 'CODE_REVEAL', recommendedDurationSeconds: 5.0 },
      { stepName: 'Key Rule', purpose: 'Summary quote card on programming best practice', shotRecipeId: 'QUOTE_CARD', recommendedDurationSeconds: 3.5 },
      { stepName: 'Outro', purpose: 'Next trick call to action', shotRecipeId: 'OUTRO_CTA', recommendedDurationSeconds: 2.5 }
    ],
    inputContract: {
      variables: [
        { name: 'language', type: 'string', label: 'Programming Language', required: true, default: 'typescript', description: 'e.g. python, typescript, rust' },
        { name: 'concept', type: 'string', label: 'Concept / Bug', required: true, description: 'e.g. Memory Leaks with useEffect, Rust Ownership in 30 Seconds' }
      ],
      promptSeed: 'Explain {concept} in {language} with broken code vs elegant idiomatic solution, step-by-step.'
    },
    visualPolicy: {
      colorPalette: ['#0D1117', '#161B22', '#30363D', '#58A6FF', '#3FB950'],
      typography: { headerFont: 'JetBrainsMono-Bold', bodyFont: 'JetBrainsMono-Regular', accentColor: '#58A6FF' },
      motionIntensity: 'MEDIUM'
    },
    captionPolicy: {
      style: 'CodeSubtitles',
      defaultPosition: 'TOP',
      maxWordsPerLine: 4,
      highlightColor: '#3FB950'
    },
    voicePolicy: {
      paceMultiplier: 1.05,
      tone: 'crisp, pragmatic senior developer',
      suggestedVoices: ['en-US-Neural2-D', 'en-US-Journey-F']
    },
    outputPolicy: {
      width: 1080,
      height: 1920,
      fps: 30,
      targetDurationRange: [30, 50]
    },
    capabilityStatus: 'READY',
    statusReason: 'Production qualified with deterministic syntax highlighter and terminal simulator.'
  },

  // 7. Guess Flag - Progressive Reveal
  {
    identity: {
      id: 'guess-flag.progressive-reveal.v1',
      version: '1.0.0',
      name: 'Guess the Flag Challenge',
      slug: 'guess-flag',
      author: 'FactoryOS Core',
      isSystem: true
    },
    category: 'GUESS_FLAG',
    formatFamily: 'Interactive Guessing Game',
    description: '3 clues of escalating ease leading into a dramatic flag unroll and country reveal',
    tags: ['quiz', 'flags', 'geography', 'trivia', 'game'],
    storyStructure: [
      { stepName: 'Game Hook', purpose: 'Can you guess this country before the timer ends?', shotRecipeId: 'KINETIC_HOOK', recommendedDurationSeconds: 2.5 },
      { stepName: 'Clue 1 (Hard)', purpose: 'Obscure historical or cultural clue', shotRecipeId: 'PROGRESSIVE_CLUE', recommendedDurationSeconds: 3.5 },
      { stepName: 'Clue 2 (Medium)', purpose: 'Geographic or demographic clue', shotRecipeId: 'PROGRESSIVE_CLUE', recommendedDurationSeconds: 3.5 },
      { stepName: 'Clue 3 (Easy)', purpose: 'Famous landmark clue', shotRecipeId: 'PROGRESSIVE_CLUE', recommendedDurationSeconds: 3.5 },
      { stepName: 'Countdown', purpose: '3-second visual countdown', shotRecipeId: 'COUNTDOWN', recommendedDurationSeconds: 3.0 },
      { stepName: 'Flag & Country Reveal', purpose: 'High-res national flag reveal with celebration', shotRecipeId: 'FLAG_REVEAL', recommendedDurationSeconds: 4.5 },
      { stepName: 'Outro', purpose: 'Comment how many clues you needed', shotRecipeId: 'OUTRO_CTA', recommendedDurationSeconds: 2.5 }
    ],
    inputContract: {
      variables: [
        { name: 'countryCode', type: 'string', label: 'ISO Country Code', required: true, description: '2-letter country code (e.g. JP, BR, IS)' },
        { name: 'countryName', type: 'string', label: 'Country Name', required: true, description: 'Full country name' }
      ],
      promptSeed: 'Generate 3 clues (hard, medium, easy) to guess {countryName}, ending with the reveal of the {countryCode} flag.'
    },
    visualPolicy: {
      colorPalette: ['#0B132B', '#1C2541', '#48CAE4', '#F77F00', '#FFFFFF'],
      typography: { headerFont: 'Inter-Black', bodyFont: 'Inter-Bold', accentColor: '#48CAE4' },
      motionIntensity: 'HIGH'
    },
    captionPolicy: {
      style: 'GameShowBouncy',
      defaultPosition: 'TOP',
      maxWordsPerLine: 3,
      highlightColor: '#F77F00'
    },
    voicePolicy: {
      paceMultiplier: 1.15,
      tone: 'high-energy game show host',
      suggestedVoices: ['en-US-Neural2-F', 'en-US-Journey-O']
    },
    outputPolicy: {
      width: 1080,
      height: 1920,
      fps: 30,
      targetDurationRange: [25, 40]
    },
    capabilityStatus: 'READY',
    statusReason: 'Production qualified with FlagCDN canonical SVG/PNG flag dataset.'
  },

  // 8. Guess Logo - Blur Reveal
  {
    identity: {
      id: 'guess-logo.blur-reveal.v1',
      version: '1.0.0',
      name: 'Guess the Brand Logo',
      slug: 'guess-logo',
      author: 'FactoryOS Core',
      isSystem: true
    },
    category: 'GUESS_LOGO',
    formatFamily: 'Interactive Guessing Game',
    description: 'Heavily blurred or silhouette brand icon that resolves as clues drop',
    tags: ['logo', 'brand', 'trivia', 'game', 'quiz'],
    storyStructure: [
      { stepName: 'Game Hook', purpose: 'Name this multi-billion dollar brand in 5 seconds', shotRecipeId: 'KINETIC_HOOK', recommendedDurationSeconds: 2.5 },
      { stepName: 'Blurred Logo Stage', purpose: 'Heavy gaussian blur of the logo with hint', shotRecipeId: 'LOGO_REVEAL', recommendedDurationSeconds: 4.0 },
      { stepName: 'Revenue Clue', purpose: 'Big number stat on brand valuation or users', shotRecipeId: 'BIG_NUMBER', recommendedDurationSeconds: 3.0 },
      { stepName: 'Countdown', purpose: 'Tick down final seconds', shotRecipeId: 'COUNTDOWN', recommendedDurationSeconds: 3.0 },
      { stepName: 'Full Logo Reveal', purpose: 'Crisp vector logo resolution and brand payoff', shotRecipeId: 'LOGO_REVEAL', recommendedDurationSeconds: 4.0 },
      { stepName: 'Outro', purpose: 'Subscribe if you guessed it', shotRecipeId: 'OUTRO_CTA', recommendedDurationSeconds: 2.5 }
    ],
    inputContract: {
      variables: [
        { name: 'brandName', type: 'string', label: 'Brand Name', required: true, description: 'e.g. Spotify, Nintendo, Tesla' }
      ],
      promptSeed: 'Generate a guess-the-brand challenge for {brandName} with financial clues and blur progression.'
    },
    visualPolicy: {
      colorPalette: ['#121212', '#212121', '#1DB954', '#FFFFFF', '#B3B3B3'],
      typography: { headerFont: 'Inter-Black', bodyFont: 'Inter-Bold', accentColor: '#1DB954' },
      motionIntensity: 'HIGH'
    },
    captionPolicy: {
      style: 'GameShowBouncy',
      defaultPosition: 'LOWER_THIRD',
      maxWordsPerLine: 3,
      highlightColor: '#1DB954'
    },
    voicePolicy: {
      paceMultiplier: 1.10,
      tone: 'fast, playful, suspenseful',
      suggestedVoices: ['en-US-Neural2-F', 'en-US-Journey-O']
    },
    outputPolicy: {
      width: 1080,
      height: 1920,
      fps: 30,
      targetDurationRange: [20, 35]
    },
    capabilityStatus: 'READY',
    statusReason: 'Production qualified with SimpleIcons vector logo database.'
  },

  // 9. Psychology - Why You Do This
  {
    identity: {
      id: 'psychology.why-you-do-this.v1',
      version: '1.0.0',
      name: 'Why You Do This',
      slug: 'why-you-do-this',
      author: 'FactoryOS Core',
      isSystem: true
    },
    category: 'PSYCHOLOGY',
    formatFamily: 'Behavioral Psychology',
    description: 'Explaining a weird daily habit or cognitive bias using clinical research made intuitively relatable',
    tags: ['psychology', 'mind', 'habits', 'neuroscience'],
    storyStructure: [
      { stepName: 'Relatable Behavior Hook', purpose: 'Ever walk into a room and instantly forget why?', shotRecipeId: 'KINETIC_HOOK', recommendedDurationSeconds: 3.0 },
      { stepName: 'The Scientific Name', purpose: 'Introduce the psychological effect/syndrome', shotRecipeId: 'STAT', recommendedDurationSeconds: 3.5 },
      { stepName: 'Brain Mechanism', purpose: 'Explain evolutionary why behind the instinct', shotRecipeId: 'IMAGE_WITH_CAPTION', recommendedDurationSeconds: 4.5 },
      { stepName: 'The Twist/Fix', purpose: 'How to trick your brain out of it', shotRecipeId: 'QUOTE_CARD', recommendedDurationSeconds: 4.0 },
      { stepName: 'Outro', purpose: 'Save this next time your brain glitches', shotRecipeId: 'OUTRO_CTA', recommendedDurationSeconds: 2.5 }
    ],
    inputContract: {
      variables: [
        { name: 'psychEffect', type: 'string', label: 'Psychological Phenomenon', required: true, description: 'e.g. The Doorway Effect, Impostor Syndrome, Decision Fatigue' }
      ],
      promptSeed: 'Explain {psychEffect} with relatable everyday storytelling, the cognitive science reason, and a mental trick.'
    },
    visualPolicy: {
      colorPalette: ['#180A28', '#2C1B4D', '#A78BFA', '#DDD6FE', '#FAF5FF'],
      typography: { headerFont: 'Inter-Bold', bodyFont: 'Inter-Regular', accentColor: '#A78BFA' },
      motionIntensity: 'MEDIUM'
    },
    captionPolicy: {
      style: 'PsychologyGlow',
      defaultPosition: 'LOWER_THIRD',
      maxWordsPerLine: 4,
      highlightColor: '#A78BFA'
    },
    voicePolicy: {
      paceMultiplier: 1.02,
      tone: 'intriguing, empathetic, intellectually curious',
      suggestedVoices: ['en-US-Neural2-F', 'en-US-Journey-F']
    },
    outputPolicy: {
      width: 1080,
      height: 1920,
      fps: 30,
      targetDurationRange: [30, 45]
    },
    capabilityStatus: 'READY',
    statusReason: 'Production qualified with cognitive diagramming and clinical quote formatting.'
  },

  // 10. Quiz - Trivia Challenge
  {
    identity: {
      id: 'quiz.trivia-challenge.v1',
      version: '1.0.0',
      name: '3-Question Rapid Trivia',
      slug: 'trivia-challenge',
      author: 'FactoryOS Core',
      isSystem: true
    },
    category: 'QUIZ',
    formatFamily: 'Interactive Quiz',
    description: 'Fast-paced question cards with option choices and immediate animated answer reveals',
    tags: ['quiz', 'trivia', 'challenge', 'test-your-knowledge'],
    storyStructure: [
      { stepName: 'Game Hook', purpose: 'Only 5% get all three questions right', shotRecipeId: 'KINETIC_HOOK', recommendedDurationSeconds: 2.5 },
      { stepName: 'Question 1', purpose: 'First question card with 3 options', shotRecipeId: 'QUESTION_CARD', recommendedDurationSeconds: 4.0 },
      { stepName: 'Countdown 1', purpose: 'Quick tick', shotRecipeId: 'COUNTDOWN', recommendedDurationSeconds: 2.0 },
      { stepName: 'Answer 1 Reveal', purpose: 'Highlight correct option', shotRecipeId: 'ANSWER_REVEAL', recommendedDurationSeconds: 3.0 },
      { stepName: 'Question 2', purpose: 'Harder second question', shotRecipeId: 'QUESTION_CARD', recommendedDurationSeconds: 4.0 },
      { stepName: 'Countdown 2', purpose: 'Quick tick', shotRecipeId: 'COUNTDOWN', recommendedDurationSeconds: 2.0 },
      { stepName: 'Answer 2 Reveal', purpose: 'Highlight correct option', shotRecipeId: 'ANSWER_REVEAL', recommendedDurationSeconds: 3.0 },
      { stepName: 'Outro', purpose: 'Comment your score out of 2', shotRecipeId: 'OUTRO_CTA', recommendedDurationSeconds: 2.5 }
    ],
    inputContract: {
      variables: [
        { name: 'category', type: 'string', label: 'Trivia Category', required: true, default: 'General Knowledge', description: 'Subject area (e.g. Space, Movies, Biology)' }
      ],
      promptSeed: 'Generate two punchy multiple-choice questions for {category} with tricky plausible options.'
    },
    visualPolicy: {
      colorPalette: ['#0F172A', '#1E293B', '#F59E0B', '#10B981', '#FFFFFF'],
      typography: { headerFont: 'Inter-Black', bodyFont: 'Inter-Bold', accentColor: '#F59E0B' },
      motionIntensity: 'HIGH'
    },
    captionPolicy: {
      style: 'QuizBouncy',
      defaultPosition: 'TOP',
      maxWordsPerLine: 3,
      highlightColor: '#10B981'
    },
    voicePolicy: {
      paceMultiplier: 1.15,
      tone: 'sharp, fast, game-show host',
      suggestedVoices: ['en-US-Neural2-F', 'en-US-Journey-O']
    },
    outputPolicy: {
      width: 1080,
      height: 1920,
      fps: 30,
      targetDurationRange: [25, 45]
    },
    capabilityStatus: 'READY',
    statusReason: 'Production qualified with deterministic question card layout and countdown timer.'
  },

  // 11. Story - Micro Horror Twist
  {
    identity: {
      id: 'story.micro-horror.v1',
      version: '1.0.0',
      name: 'Micro Horror Twist',
      slug: 'micro-horror',
      author: 'FactoryOS Core',
      isSystem: true
    },
    category: 'STORY',
    formatFamily: 'Narrative Fiction',
    description: 'Suspenseful two-sentence horror or psychological thriller culminating in an unsettling climax',
    tags: ['horror', 'story', 'fiction', 'creepy', 'twist'],
    storyStructure: [
      { stepName: 'Unsettling Premise', purpose: 'A normal scene with one terrifying detail', shotRecipeId: 'KINETIC_HOOK', recommendedDurationSeconds: 3.0 },
      { stepName: 'Creeping Dread', purpose: 'Atmospheric slow pan over eerie imagery', shotRecipeId: 'FULL_BLEED_IMAGE', recommendedDurationSeconds: 4.5 },
      { stepName: 'Audio Tension', purpose: 'Reactive waveform visualizer in dark silence', shotRecipeId: 'AUDIO_WAVEFORM', recommendedDurationSeconds: 4.0 },
      { stepName: 'The Twist Climax', purpose: 'Final horrifying realization', shotRecipeId: 'IMAGE_WITH_CAPTION', recommendedDurationSeconds: 5.0 },
      { stepName: 'Outro', purpose: 'Leave viewer alone in the dark', shotRecipeId: 'OUTRO_CTA', recommendedDurationSeconds: 2.5 }
    ],
    inputContract: {
      variables: [
        { name: 'scenario', type: 'string', label: 'Horror Scenario', required: true, description: 'e.g. Baby monitor in an empty house, Reflection that moves 1 second late' }
      ],
      promptSeed: 'Write an intense 40-second psychological horror story based on {scenario} with a devastating twist ending.'
    },
    visualPolicy: {
      colorPalette: ['#000000', '#0A0A0A', '#7F1D1D', '#DC2626', '#E5E5E5'],
      typography: { headerFont: 'Creepster-Regular', bodyFont: 'Inter-Medium', accentColor: '#DC2626' },
      motionIntensity: 'LOW'
    },
    captionPolicy: {
      style: 'TensionSubtitles',
      defaultPosition: 'CENTER',
      maxWordsPerLine: 3,
      highlightColor: '#DC2626'
    },
    voicePolicy: {
      paceMultiplier: 0.90,
      tone: 'whispered, dread-filled, slow suspenseful cadence',
      suggestedVoices: ['en-US-Neural2-D', 'en-US-Studio-M']
    },
    outputPolicy: {
      width: 1080,
      height: 1920,
      fps: 30,
      targetDurationRange: [25, 45]
    },
    capabilityStatus: 'READY',
    statusReason: 'Production qualified with atmospheric audio waveforms and dark contrast composition.'
  },

  // 12. Quantum Trivia - Science Mind-Bender
  {
    identity: {
      id: 'quantum-trivia.science-mindbender.v1',
      version: '1.0.0',
      name: 'Quantum Science Mind-Bender',
      slug: 'quantum-trivia',
      author: 'FactoryOS Core',
      isSystem: true
    },
    category: 'QUANTUM_TRIVIA',
    formatFamily: 'Astrophysics & Physics Paradoxes',
    description: 'Physics paradoxes, quantum entanglement, and cosmological mysteries explained with stunning conceptual visualization',
    tags: ['quantum', 'physics', 'science', 'space', 'universe'],
    storyStructure: [
      { stepName: 'Impossible Paradox Hook', purpose: 'A particle can be in two places at once — until you look at it', shotRecipeId: 'KINETIC_HOOK', recommendedDurationSeconds: 3.0 },
      { stepName: 'Quantum Concept', purpose: 'Clear explanation of superposition or entanglement', shotRecipeId: 'IMAGE_WITH_CAPTION', recommendedDurationSeconds: 4.5 },
      { stepName: 'Physical Scale', purpose: 'Astrophysical stat on Planck length or cosmic horizon', shotRecipeId: 'BIG_NUMBER', recommendedDurationSeconds: 3.0 },
      { stepName: 'Experimental Proof', purpose: 'Historical double-slit or Bell test citation', shotRecipeId: 'SOURCE_CARD', recommendedDurationSeconds: 4.0 },
      { stepName: 'Mind-Bending Conclusion', purpose: 'What this means about reality itself', shotRecipeId: 'QUOTE_CARD', recommendedDurationSeconds: 4.5 },
      { stepName: 'Outro', purpose: 'Subscribe for daily quantum paradoxes', shotRecipeId: 'OUTRO_CTA', recommendedDurationSeconds: 2.5 }
    ],
    inputContract: {
      variables: [
        { name: 'paradox', type: 'string', label: 'Science Paradox', required: true, description: 'e.g. Schrodinger Cat, Quantum Tunneling, Time Dilation near Black Holes' }
      ],
      promptSeed: 'Break down the mind-bending reality of {paradox} with precise physics concepts made breathtakingly intuitive.'
    },
    visualPolicy: {
      colorPalette: ['#030712', '#0F172A', '#06B6D4', '#3B82F6', '#F8FAFC'],
      typography: { headerFont: 'Inter-Black', bodyFont: 'Inter-SemiBold', accentColor: '#06B6D4' },
      motionIntensity: 'MEDIUM'
    },
    captionPolicy: {
      style: 'CosmicGlow',
      defaultPosition: 'LOWER_THIRD',
      maxWordsPerLine: 4,
      highlightColor: '#06B6D4'
    },
    voicePolicy: {
      paceMultiplier: 1.05,
      tone: 'awe-inspired, articulate, scientific clarity',
      suggestedVoices: ['en-US-Neural2-F', 'en-US-Journey-F']
    },
    outputPolicy: {
      width: 1080,
      height: 1920,
      fps: 30,
      targetDurationRange: [30, 50]
    },
    capabilityStatus: 'READY',
    statusReason: 'Production qualified with astronomical imagery and mathematical stat cards.'
  }
];
