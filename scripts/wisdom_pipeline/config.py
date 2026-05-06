"""
Pipeline configuration — source definitions, query lists, thresholds.

Set credentials via environment variables or a .env file:
  ANTHROPIC_API_KEY=...
  SUPABASE_URL=...
  SUPABASE_KEY=...
"""

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent / ".env", override=True)

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
SUPABASE_URL      = os.environ.get("SUPABASE_URL", "https://hgodsuwrdpmaqcdetjjn.supabase.co")
SUPABASE_KEY      = os.environ.get("SUPABASE_KEY", "")

# ── Quality gate ──────────────────────────────────────────────────────────────
MIN_QUALITY_SCORE = 28   # out of 40 (4 criteria × 10); below this → reject
TARGET_TOTAL      = 3000  # desired library size

# ── Chunking ──────────────────────────────────────────────────────────────────
CHUNK_WORDS    = 900   # words per extraction window
CHUNK_OVERLAP  = 150   # words of overlap between windows
MAX_PER_CHUNK  = 6     # Claude won't return more than this per chunk

# ── Models ────────────────────────────────────────────────────────────────────
EXTRACT_MODEL = "claude-opus-4-6"   # highest quality for extraction + tagging
FILTER_MODEL  = "claude-haiku-4-5-20251001"  # fast + cheap for scoring pass

# ── PubMed search queries ─────────────────────────────────────────────────────
# Organised into 14 thematic clusters — max 3 queries per cluster so no single
# topic dominates the library. Discipline spread target:
#   neuroscience ~30%  |  psychology ~35%  |  philosophy-adjacent ~15%
#   behavioral_economics ~10%  |  evolutionary_biology ~10%
PUBMED_QUERIES = [

    # ── SELF-KNOWLEDGE & IDENTITY ─────────────────────────────────────────────
    {"query": "narrative self autobiographical memory identity",          "discipline": "neuroscience"},
    {"query": "self-concept clarity psychological wellbeing identity",    "discipline": "psychology"},
    {"query": "default mode network self-referential processing",         "discipline": "neuroscience"},

    # ── MEANING, PURPOSE & WISDOM ─────────────────────────────────────────────
    {"query": "meaning in life eudaimonia flourishing review",            "discipline": "psychology"},
    {"query": "wisdom lifespan development growth Erikson",               "discipline": "psychology"},
    {"query": "mortality salience existential awareness wellbeing",       "discipline": "psychology"},

    # ── STOICISM, ACCEPTANCE & EQUANIMITY ────────────────────────────────────
    {"query": "stoicism cognitive behavioral therapy equanimity",         "discipline": "philosophy"},
    {"query": "acceptance commitment therapy psychological flexibility values", "discipline": "psychology"},
    {"query": "equanimity distress tolerance radical acceptance outcomes","discipline": "psychology"},

    # ── EMOTIONS & REGULATION ─────────────────────────────────────────────────
    {"query": "cortisol stress neuroplasticity recovery",                 "discipline": "neuroscience"},
    {"query": "cognitive reappraisal emotion regulation effectiveness",   "discipline": "psychology"},
    {"query": "shame guilt self-conscious emotion psychology",            "discipline": "psychology"},

    # ── GRIEF, LOSS & IMPERMANENCE ────────────────────────────────────────────
    {"query": "grief bereavement meaning-making psychological",           "discipline": "psychology"},
    {"query": "loss impermanence acceptance growth posttraumatic",        "discipline": "psychology"},

    # ── ANXIETY & UNCERTAINTY ─────────────────────────────────────────────────
    {"query": "amygdala fear extinction learning",                        "discipline": "neuroscience"},
    {"query": "uncertainty intolerance anxiety worry psychological",      "discipline": "psychology"},

    # ── RELATIONSHIPS, TRUST & BELONGING ─────────────────────────────────────
    {"query": "attachment style adult relationships outcomes",            "discipline": "psychology"},
    {"query": "trust repair betrayal forgiveness relationships",          "discipline": "psychology"},
    {"query": "loneliness social isolation health wellbeing",             "discipline": "psychology"},

    # ── SELF-COMPASSION & GROWTH ──────────────────────────────────────────────
    {"query": "self-compassion self-criticism wellbeing outcomes",        "discipline": "psychology"},
    {"query": "growth mindset implicit theories learning achievement",    "discipline": "psychology"},
    {"query": "forgiveness self-forgiveness psychological health",        "discipline": "psychology"},

    # ── MOTIVATION, HABIT & CHANGE ────────────────────────────────────────────
    {"query": "dopamine prediction error reward motivation",              "discipline": "neuroscience"},
    {"query": "habit formation automaticity behavior change",             "discipline": "neuroscience"},
    {"query": "autonomy intrinsic motivation self-determination theory",  "discipline": "psychology"},

    # ── ATTENTION, THOUGHT & MIND-WANDERING ──────────────────────────────────
    {"query": "mind wandering default mode rumination wellbeing",        "discipline": "neuroscience"},
    {"query": "rumination emotion regulation negative outcomes",          "discipline": "psychology"},
    {"query": "creative insight incubation problem-solving",              "discipline": "psychology"},

    # ── AWE, WONDER & TRANSCENDENCE ───────────────────────────────────────────
    {"query": "awe wonder psychological wellbeing self-transcendence",    "discipline": "psychology"},
    {"query": "solitude aloneness creativity wellbeing benefits",         "discipline": "psychology"},
    {"query": "gratitude intervention positive affect flourishing",       "discipline": "psychology"},

    # ── SOCIAL COMPARISON & MODERN LIFE ──────────────────────────────────────
    {"query": "social comparison upward downward wellbeing self-esteem",  "discipline": "psychology"},
    {"query": "affective forecasting emotional prediction accuracy",      "discipline": "behavioral_economics"},
    {"query": "hedonic adaptation wanting liking satisfaction",           "discipline": "behavioral_economics"},

    # ── DECISION-MAKING & COGNITIVE BIAS ─────────────────────────────────────
    {"query": "loss aversion prospect theory decision making",           "discipline": "behavioral_economics"},
    {"query": "present bias temporal discounting self-control",           "discipline": "behavioral_economics"},
    {"query": "cognitive dissonance belief change psychology",            "discipline": "psychology"},

    # ── BODY, SLEEP & NERVOUS SYSTEM ─────────────────────────────────────────
    {"query": "sleep deprivation emotion regulation outcomes",            "discipline": "neuroscience"},
    {"query": "interoception body signals emotion decision",              "discipline": "neuroscience"},
    {"query": "vagal tone heart rate variability stress resilience",      "discipline": "neuroscience"},

    # ── EVOLUTIONARY FOUNDATIONS ──────────────────────────────────────────────
    {"query": "evolutionary mismatch modern environment mental health",   "discipline": "evolutionary_biology"},
    {"query": "status hierarchy dominance cortisol social",               "discipline": "evolutionary_biology"},
    {"query": "cooperation fairness reciprocal altruism evolution",       "discipline": "evolutionary_biology"},

    # ── BURNOUT & WORK STRESS ─────────────────────────────────────────────────
    {"query": "burnout occupational exhaustion recovery intervention",    "discipline": "psychology"},
    {"query": "work stress chronic demands resources wellbeing",          "discipline": "psychology"},
    {"query": "job crafting meaning autonomy engagement work",            "discipline": "psychology"},

    # ── RELATIONSHIPS & CONFLICT ──────────────────────────────────────────────
    {"query": "relationship conflict repair intimacy couples outcomes",   "discipline": "psychology"},
    {"query": "communication empathy perspective taking relationships",   "discipline": "psychology"},
    {"query": "emotional bids responsiveness Gottman couple",             "discipline": "psychology"},

    # ── ANGER & SELF-REGULATION ───────────────────────────────────────────────
    {"query": "anger regulation reappraisal suppression outcomes",        "discipline": "psychology"},
    {"query": "aggression rumination displaced emotion regulation",       "discipline": "psychology"},

    # ── BODY IMAGE & SELF-ESTEEM ──────────────────────────────────────────────
    {"query": "body image self-esteem dissatisfaction psychological",     "discipline": "psychology"},
    {"query": "somatic awareness interoception self-concept wellbeing",   "discipline": "neuroscience"},

    # ── TRAUMA & RECOVERY ─────────────────────────────────────────────────────
    {"query": "trauma recovery resilience posttraumatic growth outcomes", "discipline": "psychology"},
    {"query": "adverse childhood experiences adult health outcomes",      "discipline": "psychology"},

    # ── GUT & BRAIN ───────────────────────────────────────────────────────────
    {"query": "gut microbiome mood anxiety depression neuroscience",       "discipline": "neuroscience"},
    {"query": "gut brain axis serotonin production intestinal",            "discipline": "neuroscience"},
    {"query": "intestinal permeability neuroinflammation depression",      "discipline": "neuroscience"},
    {"query": "probiotics mental health anxiety mood randomized",          "discipline": "neuroscience"},

    # ── EMOTIONAL EATING & FOOD PSYCHOLOGY ───────────────────────────────────
    {"query": "emotional eating stress regulation food behaviour",         "discipline": "psychology"},
    {"query": "binge restrict cycle dieting psychology identity",          "discipline": "psychology"},
    {"query": "intuitive eating self-trust hunger cues wellbeing",         "discipline": "psychology"},
    {"query": "diet culture restriction self-punishment psychology",       "discipline": "psychology"},

    # ── CRAVINGS & REWARD ─────────────────────────────────────────────────────
    {"query": "sugar dopamine reward craving neural mechanism",            "discipline": "neuroscience"},
    {"query": "ultra-processed food hedonic eating reward hijack",         "discipline": "neuroscience"},
    {"query": "food addiction compulsive eating dopamine striatum",        "discipline": "neuroscience"},

    # ── BLOOD SUGAR, ENERGY & COGNITION ──────────────────────────────────────
    {"query": "blood glucose variability mood cognition emotional",        "discipline": "neuroscience"},
    {"query": "decision fatigue ego depletion glucose self-control",       "discipline": "psychology"},
    {"query": "caffeine cortisol anxiety stress loop adenosine",           "discipline": "neuroscience"},

    # ── CHRONIC STRESS & THE BODY ─────────────────────────────────────────────
    {"query": "cortisol hippocampus memory chronic stress neuroplasticity","discipline": "neuroscience"},
    {"query": "allostatic load cumulative stress health outcomes",         "discipline": "neuroscience"},
    {"query": "chronic stress immune function inflammation outcomes",      "discipline": "neuroscience"},
    {"query": "hypervigilance threat detection stress chronic recovery",   "discipline": "neuroscience"},

    # ── INFLAMMATION & MOOD ───────────────────────────────────────────────────
    {"query": "cytokines neuroinflammation depression sickness behaviour", "discipline": "neuroscience"},
    {"query": "chronic low-grade inflammation mood disorder depression",   "discipline": "neuroscience"},
    {"query": "inflammatory markers anxiety depression bidirectional",     "discipline": "neuroscience"},

    # ── NERVOUS SYSTEM & REGULATION ───────────────────────────────────────────
    {"query": "polyvagal theory social engagement safety nervous system",  "discipline": "neuroscience"},
    {"query": "vagal tone heart rate variability emotion resilience",      "discipline": "neuroscience"},
    {"query": "autonomic nervous system stress recovery parasympathetic",  "discipline": "neuroscience"},

    # ── TRAUMA & SOMATIC ──────────────────────────────────────────────────────
    {"query": "somatic trauma body tension posture emotional storage",     "discipline": "neuroscience"},
    {"query": "freeze response dissociation chronic trauma nervous system","discipline": "neuroscience"},
    {"query": "body-oriented trauma therapy somatic experiencing outcomes","discipline": "psychology"},

    # ── BREATH & REGULATION ───────────────────────────────────────────────────
    {"query": "slow breathing heart rate variability anxiety regulation",  "discipline": "neuroscience"},
    {"query": "physiological sigh respiratory stress downregulation",      "discipline": "neuroscience"},
    {"query": "diaphragmatic breathing autonomic prefrontal cortex",       "discipline": "neuroscience"},

    # ── INTEROCEPTION & BODY-MIND ─────────────────────────────────────────────
    {"query": "interoception body signals emotion decision making",        "discipline": "neuroscience"},
    {"query": "alexithymia interoceptive awareness emotional regulation",  "discipline": "neuroscience"},
    {"query": "somatic marker hypothesis body emotion decision Damasio",   "discipline": "neuroscience"},

    # ── MOVEMENT & EXERCISE ───────────────────────────────────────────────────
    {"query": "exercise antidepressant BDNF neurogenesis hippocampus",     "discipline": "neuroscience"},
    {"query": "physical activity anxiety depression meta-analysis review", "discipline": "psychology"},
    {"query": "runner's high endocannabinoid system exercise mood",        "discipline": "neuroscience"},
    {"query": "movement emotional processing embodied cognition",          "discipline": "neuroscience"},
    {"query": "sedentary behaviour mental health depression longitudinal", "discipline": "psychology"},
    {"query": "posture body feedback emotion confidence power",            "discipline": "psychology"},
    {"query": "compulsive exercise body image identity psychology",        "discipline": "psychology"},

    # ── SLEEP ─────────────────────────────────────────────────────────────────
    {"query": "sleep emotional memory consolidation overnight processing", "discipline": "neuroscience"},
    {"query": "sleep deprivation amygdala reactivity emotional regulation","discipline": "neuroscience"},
    {"query": "REM sleep dreaming emotional processing trauma",            "discipline": "neuroscience"},
    {"query": "circadian rhythm disruption mood disorder depression",      "discipline": "neuroscience"},
    {"query": "revenge bedtime procrastination sleep delay psychology",    "discipline": "psychology"},
    {"query": "sleep quality subjective wellbeing mental health",          "discipline": "psychology"},

    # ── LIFESTYLE & ENVIRONMENT ───────────────────────────────────────────────
    {"query": "nature exposure cortisol stress attention restoration",     "discipline": "psychology"},
    {"query": "digital overstimulation attention depletion wellbeing",     "discipline": "psychology"},
    {"query": "sunlight serotonin seasonal mood circadian",                "discipline": "neuroscience"},
    {"query": "social connection belonging loneliness biological need",    "discipline": "neuroscience"},
    {"query": "routine habit stability mental health anxiety depression",  "discipline": "psychology"},

    # ── AGEING & PURPOSE ──────────────────────────────────────────────────────
    {"query": "telomere length chronic stress ageing cellular",            "discipline": "neuroscience"},
    {"query": "purpose meaning longevity healthspan mortality",            "discipline": "psychology"},
    {"query": "social isolation mortality health risk longitudinal",       "discipline": "psychology"},
]

# ── YouTube sources ───────────────────────────────────────────────────────────
# Populate video_ids with actual IDs from each channel.
# Find them: youtube.com/watch?v=VIDEO_ID
YOUTUBE_SOURCES = [
    {
        "channel":    "Acharya Prashant",
        "discipline": "philosophy",
        "source_type": "talk",
        "source_url": "https://www.youtube.com/@AcharyaPrashant_APF",
        "video_ids": [
            # Ego playlist — curated for identity, self-concept, approval, fear
            "F6yjmZkXLrw",  # What is the ego? (Neem Candies — short, dense)
            "zuewG2xJKlg",  # How was the ego created?
            "3jif1K2zB_Y",  # How to overcome the ego?
            "TV4B4yqfKTM",  # Ego, personality, and individuality
            "81KInWsAin8",  # Ego, the borrowed self
            "FswpOSiEBm4",  # Ego, the second-hand life
            "zsaqQIDKOcA",  # Why Seeking Social Approval is Your Biggest Trap
            "gqFSRVf9zM4",  # Ego vs Self-Respect (IIT Patna)
            "Iw3ig3HR_kM",  # The ego likes suffering (on Ramana Maharshi)
            "KDZmx1tGm2c",  # Fear of Death and Attachment to Life's Pleasures
            "BGAQn_fWQZM",  # Mistaken identity and blurred consciousness (IIT Kharagpur)
            "In5xGj1iuVA",  # Insult hurts, and I am unable to forgive (Delhi University)
            "2xTOGE55r0A",  # How can one live without an identity or an ego?
            "DHI7sblXhp4",  # Your 'individuality' is just a deceptive name given by ego
            "o_HVQPGdzbo",  # All fear is the product of ego
        ],
    },
    {
        "channel":    "J. Krishnamurti",
        "discipline": "philosophy",
        "source_type": "talk",
        "source_url": "https://www.youtube.com/@JKrishnamurtiOfficial",
        "video_ids": [
            # Full public talks — confirmed transcripts available (~7000 words each)
            "-Z6IYtIEV9w",  # Thought and time are the root of fear (Amsterdam 1981)
            "HYd_HRllMIM",  # Love and freedom (Saanen 1981)
            "lPWyGNtKcxE",  # How do I deal with my deep-rooted emotion?
            "UhHMoiSk63A",  # Why are you hurt?
            "yxTq4grQXZc",  # Love is total attention
            "H6lqAmWvPXw",  # What is guilt?
            "s9cfsQc3lOg",  # On desire and pleasure
            "IKC-AQmJx6M",  # The observer and the observed are the same
            "LZlkYPlS5s0",  # How does one go to the very source of thought?
            "88ewKAjk7sg",  # A mind free of the 'me'
            "xsYhBGT2__U",  # What is the nature of our consciousness? (Saanen 1981)
            "SrU-bpzAi3w",  # If you are not occupied, are you nothing? (Saanen 1978)
            "pi7jdQHi3Q4",  # Understanding problems, and the art of living
            "sq9Ptoa3y5s",  # The correct approach to a problem
        ],
    },
    {
        "channel":    "The School of Life",
        "discipline": "philosophy",
        "source_type": "video",
        "source_url": "https://www.youtube.com/@theschooloflifeofficial",
        "video_ids": [
            # ✅ Verified working
            "n3Xv_g3g-mA",  # On Self-Knowledge / Loneliness
            # TODO: Add more IDs — find them at youtube.com/@theschooloflifeofficial
            # Topics needed: relationships, anger, grief, anxiety, work
        ],
    },
    {
        "channel":    "Robert Sapolsky – Stanford",
        "discipline": "neuroscience",
        "source_type": "talk",
        "source_url": "https://www.youtube.com/playlist?list=PL848F2368C90DDC3D",
        "video_ids": [
            # TODO: Add verified IDs from the Stanford Human Behavioral Biology playlist
            # Find at: youtube.com/playlist?list=PL848F2368C90DDC3D
        ],
    },
    {
        "channel":    "Tara Brach",
        "discipline": "psychology",
        "source_type": "talk",
        "source_url": "https://www.youtube.com/@TaraBrach",
        "video_ids": [
            # TODO: Find IDs at youtube.com/@TaraBrach
            # Topics needed: fear, grief, anger, self-compassion, relationships
        ],
    },
    {
        "channel":    "Esther Perel",
        "discipline": "psychology",
        "source_type": "talk",
        "source_url": "https://www.youtube.com/@EstherPerel",
        "video_ids": [
            # TODO: Find IDs at youtube.com/@EstherPerel
            # Topics needed: relationships, conflict, desire, repair, loneliness
        ],
    },
    {
        "channel":    "Alan Watts",
        "discipline": "philosophy",
        "source_type": "talk",
        "source_url": "https://www.youtube.com/@AlanWattsOrg",
        "video_ids": [
            # TODO: Find IDs at youtube.com/@AlanWattsOrg
            # Topics needed: acceptance, anxiety, work/play, identity, ego
        ],
    },
    # Osho: full talks are member-gated on YouTube. Add via --source file instead:
    #   python pipeline.py --source file --file highlights/osho_<book>.txt
    #   --author "Osho" --discipline philosophy --source-type talk
]

# ── Web scraping sources ──────────────────────────────────────────────────────
WEB_SOURCES = [
    {
        "name":       "Krishnamurti Daily Quote",
        "discipline": "philosophy",
        "source_type": "essay",
        "source_author": "J. Krishnamurti",
        "source_url": "https://jkrishnamurti.org/content/type/daily-quote",
        "list_url":   "https://jkrishnamurti.org/content/type/daily-quote",
        "article_selector": ".field-items p",
        "list_selector":    "article h2 a",
    },
    {
        "name":       "Acharya Prashant Articles (prashantadvait.com)",
        "discipline": "philosophy",
        "source_type": "essay",
        "source_author": "Acharya Prashant",
        "source_url": "https://prashantadvait.com",
        "list_url":   "https://prashantadvait.com/articles/",
        "article_selector": ".entry-content p",
        "list_selector":    ".entry-title a",
    },
    {
        "name":       "Acharya Prashant Articles (acharyaprashant.org)",
        "discipline": "philosophy",
        "source_type": "essay",
        "source_author": "Acharya Prashant",
        "source_url": "https://acharyaprashant.org/en/articles",
        "list_url":   "https://acharyaprashant.org/en/articles",
        "article_selector": "p",
        "list_selector":    "a[href*='/articles/'][href*='_']",
        "url_filter":       "/en/articles/",   # skip Hindi (/hi/) and nav links
    },
    # Literary philosophy + psychology essays — high voice-fit for Untangle
    {
        "name":       "The Marginalian (Brain Pickings)",
        "discipline": "philosophy",
        "source_type": "essay",
        "source_author": "Maria Popova",
        "source_url": "https://www.themarginalian.org",
        "list_url":   "https://www.themarginalian.org/tag/philosophy/",
        "article_selector": ".entry-content p",
        "list_selector":    "h2.entry-title a",
    },
    {
        "name":       "Aeon — Philosophy",
        "discipline": "philosophy",
        "source_type": "essay",
        "source_author": "Aeon",
        "source_url": "https://aeon.co/philosophy",
        "list_url":   "https://aeon.co/philosophy",
        "article_selector": "article p",
        "list_selector":    "article h2 a",
    },
    {
        "name":       "Farnam Street — Mental Models",
        "discipline": "psychology",
        "source_type": "essay",
        "source_author": "Shane Parrish",
        "source_url": "https://fs.blog/mental-models/",
        "list_url":   "https://fs.blog/mental-models/",
        "article_selector": ".entry-content p",
        "list_selector":    "h2.entry-title a",
    },
]
