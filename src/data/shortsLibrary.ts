/**
 * Wisdom Shorts — curated library across disciplines.
 *
 * Disciplines covered:
 *   Eastern Philosophy · Western Philosophy (Stoic, Existentialist, Absurdist)
 *   Neuroscience · Neurochemistry · Biology (evolutionary, stress)
 *   Psychology (Jungian, Humanistic, CBT, Trauma) · Social Psychology
 *   Behavioural Economics · Political Philosophy
 */

import { WisdomShort } from '../types';

export const SHORTS_LIBRARY: WisdomShort[] = [

  // ════════════════════════════════════════════════════════════════
  // EASTERN PHILOSOPHY
  // ════════════════════════════════════════════════════════════════

  {
    id: 'ap_ego_hunger',
    title: "The Ego's Hunger Cannot Be Fed",
    short:
      "The ego is not a thing you have — it is a pattern of seeking. It wants security, approval, continuity. And the strange thing is, the more you feed it, the hungrier it becomes. Satisfaction is not in its vocabulary. This is not a flaw in you — it is the nature of the conditioned mind. The only freedom is to see the hunger clearly, not to try to satiate it.",
    pullquote: "The ego is not a thing you have — it is a pattern of seeking.",
    source_author: 'Acharya Prashant',
    source_url: 'https://www.youtube.com/c/AcharyaPrashant',
    source_type: 'talk',
    themes: ['ego', 'desire', 'conditioning', 'freedom'],
    emotional_states: ['anxious', 'restless', 'unfulfilled', 'striving'],
    cognitive_patterns: ['approval-seeking', 'future-orientation', 'catastrophising'],
    enneagram_resonance: [2, 3, 6, 9],
    cognitive_style: ['analytical', 'reflective'],
    values: ['authenticity', 'freedom', 'clarity'],
    depth: 'mid',
  },

  {
    id: 'ap_comparison',
    title: 'You Cannot Suffer Without Comparing',
    short:
      "Every instance of suffering involves a comparison — this is how things are, and this is how they should be. Pain arises from the gap between the two. Watch any grievance and you'll find the hidden comparison underneath it. Who decided how things should be? A conditioned mind, shaped by fear, memory, and social expectation. What if you met this moment without the 'should'?",
    pullquote: 'Every instance of suffering involves a comparison.',
    source_author: 'Acharya Prashant',
    source_url: 'https://www.youtube.com/c/AcharyaPrashant',
    source_type: 'talk',
    themes: ['comparison', 'suffering', 'expectations', 'acceptance'],
    emotional_states: ['resentful', 'disappointed', 'envious', 'comparing'],
    cognitive_patterns: ['should-statements', 'comparison', 'all-or-nothing'],
    enneagram_resonance: [1, 2, 3, 4],
    cognitive_style: ['reflective', 'analytical'],
    values: ['authenticity', 'clarity', 'peace'],
    depth: 'mid',
  },

  {
    id: 'ap_love_attachment',
    title: 'Most Relationships Are Negotiations Between Two Fears',
    short:
      "What most people call love is actually need. 'I love you' often means 'I need you to be a certain way so I can feel secure.' Real love doesn't demand. It doesn't fear the other person's freedom. It doesn't shrink when the other person grows. Most relationships are negotiations between two fears — one fear trying to get something from another fear.",
    pullquote: 'Most relationships are negotiations between two fears.',
    source_author: 'Acharya Prashant',
    source_url: 'https://www.youtube.com/c/AcharyaPrashant',
    source_type: 'talk',
    themes: ['love', 'attachment', 'relationships', 'ego', 'freedom'],
    emotional_states: ['jealous', 'possessive', 'insecure', 'dependent'],
    cognitive_patterns: ['mind-reading', 'emotional-reasoning', 'personalisation'],
    enneagram_resonance: [2, 4, 6, 8],
    cognitive_style: ['reflective', 'analytical'],
    values: ['love', 'freedom', 'authenticity'],
    depth: 'mid',
  },

  {
    id: 'jk_observer_observed',
    title: 'The Thinker and the Thought Are the Same Movement',
    short:
      "We believe there is a thinker who has thoughts — a self that observes problems and tries to solve them. But look carefully: when you observe a thought, who is doing the observing? It is another thought. The observer is the observed. If the thinker is the thought, then the 'me' that is suffering is itself the suffering — not a separate entity that needs to be fixed.",
    pullquote: 'The observer is the observed.',
    source_author: 'J. Krishnamurti',
    source_url: 'https://www.jkrishnamurti.org',
    source_type: 'talk',
    themes: ['consciousness', 'self-inquiry', 'thought', 'identity'],
    emotional_states: ['confused', 'analytical', 'stuck', 'self-critical'],
    cognitive_patterns: ['rumination', 'self-blame', 'over-analysis'],
    enneagram_resonance: [4, 5, 6, 1],
    cognitive_style: ['analytical', 'philosophical'],
    values: ['truth', 'clarity', 'self-understanding'],
    depth: 'deep',
  },

  {
    id: 'jk_relationship_mirror',
    title: 'Every Relationship Is a Mirror',
    short:
      "When you react strongly to someone — with anger, admiration, or resentment — you are not seeing them. You are seeing the projection of your own conditioning. The person who irritates you is reflecting something about yourself you haven't examined. The person you idealize is carrying a quality you want but don't claim. Every relationship is an invitation to self-knowledge.",
    pullquote: "The person who irritates you is reflecting something about yourself you haven't examined.",
    source_author: 'J. Krishnamurti',
    source_url: 'https://www.jkrishnamurti.org',
    source_type: 'talk',
    themes: ['relationships', 'projection', 'self-knowledge', 'conflict'],
    emotional_states: ['resentful', 'conflicted', 'irritable', 'jealous'],
    cognitive_patterns: ['projection', 'personalisation', 'mind-reading'],
    enneagram_resonance: [2, 4, 6, 8, 1],
    cognitive_style: ['analytical', 'reflective'],
    values: ['self-awareness', 'truth', 'growth'],
    depth: 'mid',
  },

  {
    id: 'aw_you_are_universe',
    title: "You Didn't Come Into This World — You Came Out of It",
    short:
      "You are not a separate self that got dropped into existence. You are the universe becoming aware of itself in this particular form — like a wave from the ocean. The anxiety of separation — of being a small, vulnerable self against a large, indifferent world — rests on a mistaken premise. You are not in nature. You are nature.",
    pullquote: "You didn't come into this world. You came out of it, like a wave from the ocean.",
    source_author: 'Alan Watts',
    source_url: 'https://www.youtube.com/@AlanWattsOrganization',
    source_type: 'talk',
    themes: ['identity', 'separation', 'existence', 'consciousness', 'non-duality'],
    emotional_states: ['lonely', 'anxious', 'existential', 'lost', 'disconnected'],
    cognitive_patterns: ['personalisation', 'catastrophising'],
    enneagram_resonance: [4, 5, 7, 9],
    cognitive_style: ['intuitive', 'holistic'],
    values: ['meaning', 'connection', 'wonder'],
    depth: 'deep',
  },

  {
    id: 'aw_backwards_law',
    title: 'The Harder You Try to Control, the Less Control You Have',
    short:
      "The things we most want — love, sleep, pleasure, confidence — cannot be forced. The moment you try to force them, they retreat. The harder you try to be happy, the less happy you become. This is the backwards law: in many domains, the path runs in the opposite direction of trying. The way forward is often a kind of relaxed allowing.",
    pullquote: 'The things we most want cannot be forced. The moment you try to force them, they retreat.',
    source_author: 'Alan Watts',
    source_url: 'https://www.youtube.com/@AlanWattsOrganization',
    source_type: 'talk',
    themes: ['control', 'paradox', 'acceptance', 'flow', 'effort'],
    emotional_states: ['frustrated', 'striving', 'controlling', 'anxious', 'stuck'],
    cognitive_patterns: ['all-or-nothing', 'perfectionism', 'over-control'],
    enneagram_resonance: [1, 3, 5, 6, 8],
    cognitive_style: ['intuitive', 'holistic'],
    values: ['freedom', 'ease', 'authenticity'],
    depth: 'mid',
  },

  {
    id: 'osho_witnessing',
    title: 'You Are Not Your Mood — You Are the Sky',
    short:
      "The weather changes — rain, sun, storm, calm. The sky does not change. You are the sky, not the weather. When you are angry, the anger is happening in you, but you are not the anger. The moment you understand this, the quality of your inner life shifts. You can watch the storm without becoming the storm. This is what meditation is: a larger presence that holds the feeling.",
    pullquote: 'You are the sky, not the weather.',
    source_author: 'Osho',
    source_url: '',
    source_type: 'book',
    themes: ['witnessing', 'meditation', 'emotions', 'awareness', 'equanimity'],
    emotional_states: ['overwhelmed', 'reactive', 'anxious', 'emotional', 'turbulent'],
    cognitive_patterns: ['emotional-reasoning', 'catastrophising', 'rumination'],
    enneagram_resonance: [2, 4, 6, 8, 9],
    cognitive_style: ['intuitive', 'experiential'],
    values: ['peace', 'self-awareness', 'freedom'],
    depth: 'entry',
  },

  {
    id: 'osho_aloneness',
    title: 'Loneliness Is the Absence of the Other — Aloneness Is the Presence of Yourself',
    short:
      "People run from aloneness because they confuse it with loneliness. Loneliness is a wound: you feel incomplete without someone to fill the void. Aloneness is a fullness: you are so present with yourself that there is no void to fill. Most people never discover aloneness because they are too busy escaping loneliness — filling every silent moment with distraction and noise.",
    pullquote: 'Loneliness is the absence of the other. Aloneness is the presence of yourself.',
    source_author: 'Osho',
    source_url: '',
    source_type: 'book',
    themes: ['solitude', 'loneliness', 'aloneness', 'self-relationship', 'presence'],
    emotional_states: ['lonely', 'isolated', 'disconnected', 'restless', 'bored'],
    cognitive_patterns: ['avoidance', 'distraction', 'emotional-reasoning'],
    enneagram_resonance: [4, 5, 9, 2],
    cognitive_style: ['intuitive', 'experiential'],
    values: ['self-sufficiency', 'presence', 'depth'],
    depth: 'mid',
  },

  // ════════════════════════════════════════════════════════════════
  // WESTERN PHILOSOPHY — STOIC
  // ════════════════════════════════════════════════════════════════

  {
    id: 'stoic_dichotomy',
    title: "The Stoic's Only Question: Is This in My Control?",
    short:
      "Epictetus, born a slave, built an entire philosophy on one distinction: some things are in our power, and some things are not. In our power: our judgements, our intentions, our responses. Not in our power: our body, reputation, property, other people's actions. Almost all human suffering, he argued, comes from mixing these two categories — grieving over what was never ours to control.",
    pullquote: 'Almost all suffering comes from grieving over what was never ours to control.',
    source_author: 'Epictetus',
    source_url: '',
    source_type: 'book',
    themes: ['control', 'acceptance', 'resilience', 'equanimity', 'freedom'],
    emotional_states: ['frustrated', 'anxious', 'controlling', 'resentful', 'overwhelmed'],
    cognitive_patterns: ['over-control', 'catastrophising', 'all-or-nothing'],
    enneagram_resonance: [1, 6, 8, 3],
    cognitive_style: ['analytical', 'first-principles'],
    values: ['freedom', 'integrity', 'resilience'],
    depth: 'entry',
  },

  {
    id: 'stoic_marcus_morning',
    title: "Expect Difficult People — Then You Won't Be Surprised",
    short:
      "Marcus Aurelius began each day with a reminder: 'In the morning when you rise unwillingly, let this thought be present: I am rising to the work of a human being.' He also noted: 'When you wake up in the morning, tell yourself: The people I deal with today will be meddling, ungrateful, arrogant, dishonest, jealous and surly.' Not as cynicism — but as preparation. Surprise is the enemy of equanimity.",
    pullquote: 'Surprise is the enemy of equanimity.',
    source_author: 'Marcus Aurelius',
    source_url: '',
    source_type: 'book',
    themes: ['resilience', 'expectations', 'acceptance', 'people', 'equanimity'],
    emotional_states: ['frustrated', 'disappointed', 'resentful', 'conflicted'],
    cognitive_patterns: ['all-or-nothing', 'personalisation', 'mind-reading'],
    enneagram_resonance: [1, 6, 8, 9],
    cognitive_style: ['analytical', 'pragmatic'],
    values: ['equanimity', 'integrity', 'wisdom'],
    depth: 'entry',
  },

  {
    id: 'stoic_seneca_time',
    title: "It's Not That We Have Too Little Time — We Waste Too Much of It",
    short:
      "Seneca opens his essay on time with a provocation: we are not given a short life, we make it short. The time we actually have is ample — if only we would use it. He identified the ways we squander it: postponing life to some future date, spending it on other people's priorities, consuming it in distraction and shallow pleasure. 'Omnia aliena sunt, tempus tantum nostrum est.' All things are alien to us; time alone is ours.",
    pullquote: "All things are alien to us; time alone is ours.",
    source_author: 'Seneca',
    source_url: '',
    source_type: 'book',
    themes: ['time', 'urgency', 'priorities', 'meaning', 'presence'],
    emotional_states: ['purposeless', 'distracted', 'drifting', 'unfulfilled', 'anxious'],
    cognitive_patterns: ['avoidance', 'future-orientation', 'procrastination'],
    enneagram_resonance: [3, 5, 7, 9],
    cognitive_style: ['analytical', 'pragmatic'],
    values: ['meaning', 'intentionality', 'presence'],
    depth: 'mid',
  },

  // ════════════════════════════════════════════════════════════════
  // WESTERN PHILOSOPHY — EXISTENTIALIST / ABSURDIST
  // ════════════════════════════════════════════════════════════════

  {
    id: 'camus_absurd',
    title: 'The Absurd Is Not a Problem to Be Solved — It Is a Tension to Be Lived',
    short:
      "Camus identified the absurd as the collision between the human need for meaning and the universe's silent indifference. The temptation is to resolve this tension — through religion, ideology, or suicide. But Camus's answer was a third option: revolt. Keep the tension alive. Don't escape it. Acknowledge the absurdity and live fully within it anyway. 'One must imagine Sisyphus happy.'",
    pullquote: "One must imagine Sisyphus happy.",
    source_author: 'Albert Camus',
    source_url: '',
    source_type: 'book',
    themes: ['meaning', 'absurdity', 'existence', 'suffering', 'rebellion'],
    emotional_states: ['existential', 'purposeless', 'hopeless', 'lost', 'nihilistic'],
    cognitive_patterns: ['all-or-nothing', 'catastrophising', 'learned-helplessness'],
    enneagram_resonance: [4, 5, 7, 9],
    cognitive_style: ['philosophical', 'narrative'],
    values: ['meaning', 'courage', 'freedom'],
    depth: 'deep',
  },

  {
    id: 'sartre_bad_faith',
    title: 'Bad Faith: Pretending You Have No Choice When You Do',
    short:
      "Sartre described 'bad faith' as the lie we tell ourselves that we have no options. The waiter who acts like a machine — as if waiting tables defines his entire being — is in bad faith. The person who says 'I had no choice' when they had several is in bad faith. For Sartre, the terror of freedom is that we are always choosing. Even choosing not to choose is a choice. This is both the most disturbing and most liberating idea in philosophy.",
    pullquote: 'Even choosing not to choose is a choice.',
    source_author: 'Jean-Paul Sartre',
    source_url: '',
    source_type: 'book',
    themes: ['freedom', 'responsibility', 'identity', 'choice', 'authenticity'],
    emotional_states: ['stuck', 'victimized', 'trapped', 'resigned', 'passive'],
    cognitive_patterns: ['learned-helplessness', 'all-or-nothing', 'avoidance'],
    enneagram_resonance: [1, 4, 6, 9],
    cognitive_style: ['philosophical', 'analytical'],
    values: ['freedom', 'responsibility', 'authenticity'],
    depth: 'deep',
  },

  {
    id: 'frankl_meaning_suffering',
    title: 'When You Cannot Choose the Situation, Choose the Stance',
    short:
      "Between stimulus and response there is a space. In that space is our power to choose our response. Frankl discovered this not in a lecture hall but in Auschwitz — that everything can be taken from a person but one thing: the last of the human freedoms, to choose one's attitude in any given set of circumstances.",
    pullquote: 'Everything can be taken from a person but one thing: the last of the human freedoms.',
    source_author: 'Viktor Frankl',
    source_url: '',
    source_type: 'book',
    themes: ['meaning', 'suffering', 'freedom', 'resilience', 'attitude'],
    emotional_states: ['hopeless', 'trapped', 'victimized', 'stuck', 'grieving'],
    cognitive_patterns: ['learned-helplessness', 'all-or-nothing', 'personalisation'],
    enneagram_resonance: [1, 4, 6, 8],
    cognitive_style: ['narrative', 'analytical'],
    values: ['meaning', 'freedom', 'dignity'],
    depth: 'mid',
  },

  {
    id: 'frankl_unbearable',
    title: 'The Unbearable Is Not Pain — It Is Pain Without Meaning',
    short:
      "Frankl observed that people could endure almost any suffering if they had a reason for it. When a person finds a purpose large enough — love for another, an unfinished work, a commitment — the suffering does not disappear, but it becomes bearable. The unbearable is not pain. The unbearable is pain without meaning.",
    pullquote: 'The unbearable is not pain. The unbearable is pain without meaning.',
    source_author: 'Viktor Frankl',
    source_url: '',
    source_type: 'book',
    themes: ['suffering', 'meaning', 'purpose', 'resilience'],
    emotional_states: ['hopeless', 'grieving', 'purposeless', 'lost', 'trapped'],
    cognitive_patterns: ['learned-helplessness', 'catastrophising'],
    enneagram_resonance: [4, 6, 9, 1],
    cognitive_style: ['narrative', 'philosophical'],
    values: ['meaning', 'resilience', 'purpose'],
    depth: 'deep',
  },

  {
    id: 'nietzsche_will',
    title: "What Doesn't Kill You Doesn't Automatically Make You Stronger",
    short:
      "Nietzsche's famous line is often misread as comfort. What he actually said was more demanding: suffering can strengthen — but only if you have the will to make it mean something. Suffering without interpretation is just damage. The difference between trauma that destroys and adversity that forges is not the event itself but the relationship the person builds with it. Growth after hardship is an active choice, not a passive outcome.",
    pullquote: 'Suffering without interpretation is just damage.',
    source_author: 'Friedrich Nietzsche',
    source_url: '',
    source_type: 'book',
    themes: ['suffering', 'resilience', 'meaning', 'strength', 'will'],
    emotional_states: ['stuck', 'wounded', 'hopeless', 'resigned', 'struggling'],
    cognitive_patterns: ['learned-helplessness', 'all-or-nothing', 'personalisation'],
    enneagram_resonance: [1, 4, 8, 3],
    cognitive_style: ['philosophical', 'analytical'],
    values: ['strength', 'meaning', 'growth'],
    depth: 'mid',
  },

  // ════════════════════════════════════════════════════════════════
  // NEUROSCIENCE
  // ════════════════════════════════════════════════════════════════

  {
    id: 'ns_default_mode',
    title: "Your Brain's Resting State Is Making You Miserable",
    short:
      "When you're not focused on a task, your brain doesn't rest — it activates its Default Mode Network: a circuit that replays the past, anticipates the future, and thinks about yourself in relation to others. Studies consistently show: the more time people spend mind-wandering, the less happy they report being — even when the wandering is about pleasant things. Presence is not a spiritual luxury. It is a neurological imperative.",
    pullquote: 'The more time people spend mind-wandering, the less happy they report being.',
    source_author: 'Matthew Killingsworth & Daniel Gilbert (Harvard)',
    source_url: '',
    source_type: 'paper',
    themes: ['mind-wandering', 'presence', 'rumination', 'happiness', 'neuroscience'],
    emotional_states: ['anxious', 'ruminating', 'distracted', 'overthinking', 'restless'],
    cognitive_patterns: ['rumination', 'future-orientation', 'past-focus'],
    enneagram_resonance: [4, 5, 6, 9],
    cognitive_style: ['analytical', 'evidence-based'],
    values: ['presence', 'clarity', 'wellbeing'],
    depth: 'entry',
  },

  {
    id: 'ns_neuroplasticity',
    title: 'Every Thought You Repeat Is Literally Rewiring Your Brain',
    short:
      "Neurons that fire together wire together. Every time you engage in a thought pattern — self-criticism, catastrophising, gratitude, curiosity — the neural pathway for that pattern becomes more efficient. Your brain is not fixed. It is remodeling itself constantly, based on what you attend to. Your habitual thoughts are not just passing moods. They are infrastructure. You are building something with every repetition.",
    pullquote: 'Your habitual thoughts are not just passing moods. They are infrastructure.',
    source_author: 'Donald Hebb / Modern Neuroscience',
    source_url: '',
    source_type: 'paper',
    themes: ['habits', 'neuroplasticity', 'thought-patterns', 'change'],
    emotional_states: ['stuck', 'self-critical', 'hopeless', 'motivated'],
    cognitive_patterns: ['rumination', 'self-blame', 'perfectionism'],
    enneagram_resonance: [1, 5, 6, 9],
    cognitive_style: ['analytical', 'evidence-based'],
    values: ['growth', 'awareness', 'change'],
    depth: 'entry',
  },

  {
    id: 'ns_stress_decisions',
    title: 'Under Stress, Your Brain Becomes a Threat-Detection Machine',
    short:
      "When you're under acute stress, the amygdala suppresses the prefrontal cortex — the region responsible for nuanced thinking, future planning, and perspective-taking. This is why decisions made in anger, fear, or overwhelm are so often regretted. The brain under stress is doing exactly what it evolved to do: move fast. But 'move fast' was built for a predator on the savannah, not for a difficult conversation or a career decision.",
    pullquote: "'Move fast' was built for a predator — not a career decision.",
    source_author: 'Amy Arnsten (Yale Neuroscience)',
    source_url: '',
    source_type: 'paper',
    themes: ['stress', 'decision-making', 'emotions', 'nervous-system'],
    emotional_states: ['stressed', 'overwhelmed', 'reactive', 'panicking', 'anxious'],
    cognitive_patterns: ['catastrophising', 'all-or-nothing', 'emotional-reasoning'],
    enneagram_resonance: [1, 6, 8, 2],
    cognitive_style: ['analytical', 'evidence-based'],
    values: ['clarity', 'composure', 'self-awareness'],
    depth: 'entry',
  },

  {
    id: 'ns_creativity_rest',
    title: 'Rest Is Where Insight Happens',
    short:
      "The greatest leaps in understanding rarely happen at the desk. They happen when you step away from the desk. The default mode network — active during rest — makes connections between disparate brain regions that focused attention suppresses. Archimedes in the bath. Newton under the tree. The shower revelation. Rest is not laziness. It is where the non-obvious becomes obvious.",
    pullquote: 'Rest is not the absence of work. It is where insight happens.',
    source_author: 'Rex Jung / Roger Beaty (Creativity Neuroscience)',
    source_url: '',
    source_type: 'paper',
    themes: ['creativity', 'rest', 'insight', 'productivity'],
    emotional_states: ['stuck', 'blocked', 'frustrated', 'overthinking', 'unmotivated'],
    cognitive_patterns: ['over-control', 'perfectionism', 'rumination'],
    enneagram_resonance: [1, 3, 5, 7],
    cognitive_style: ['analytical', 'intuitive'],
    values: ['creativity', 'balance', 'wisdom'],
    depth: 'entry',
  },

  {
    id: 'ns_damasio_emotion',
    title: 'You Cannot Make Good Decisions Without Emotions',
    short:
      "Antonio Damasio studied patients with damage to the emotion centres of the brain. They were perfectly rational — high IQ, intact reasoning — but they couldn't make decisions. They would deliberate endlessly without ever choosing. His conclusion: emotions are not the enemy of good thinking. They are required for it. The feeling of 'this matters' or 'this is wrong' is the signal that moves deliberation to action.",
    pullquote: 'Emotions are not the enemy of good thinking. They are required for it.',
    source_author: 'Antonio Damasio',
    source_url: '',
    source_type: 'book',
    themes: ['emotions', 'decision-making', 'rationality', 'consciousness'],
    emotional_states: ['confused', 'detached', 'analytical', 'numb', 'overthinking'],
    cognitive_patterns: ['over-analysis', 'emotional-suppression', 'avoidance'],
    enneagram_resonance: [1, 5, 6, 3],
    cognitive_style: ['analytical', 'evidence-based'],
    values: ['self-awareness', 'wisdom', 'integration'],
    depth: 'mid',
  },

  {
    id: 'ns_prediction_brain',
    title: 'Your Brain Is Not Reacting to the World — It Is Predicting It',
    short:
      "Neuroscientist Lisa Feldman Barrett's research overturns the idea that the brain passively reacts to the world. In fact, the brain is a prediction machine: it constantly generates models of what is about to happen, and only processes incoming data to update those models. What you perceive is not raw reality — it is your brain's best guess, coloured by past experience. This is why two people can witness the same event and have completely different experiences.",
    pullquote: "What you perceive is not raw reality — it is your brain's best guess.",
    source_author: 'Lisa Feldman Barrett',
    source_url: '',
    source_type: 'book',
    themes: ['perception', 'reality', 'bias', 'consciousness', 'prediction'],
    emotional_states: ['confused', 'conflicted', 'misunderstood', 'reactive'],
    cognitive_patterns: ['personalisation', 'projection', 'mind-reading'],
    enneagram_resonance: [1, 4, 5, 6],
    cognitive_style: ['analytical', 'evidence-based'],
    values: ['truth', 'self-awareness', 'clarity'],
    depth: 'mid',
  },

  // ════════════════════════════════════════════════════════════════
  // NEUROCHEMISTRY
  // ════════════════════════════════════════════════════════════════

  {
    id: 'nc_dopamine_wanting',
    title: "Dopamine Is About Wanting, Not Having",
    short:
      "Dopamine is widely misunderstood as the 'pleasure chemical.' It is actually the wanting chemical. It drives you toward the reward, not the satisfaction of receiving it. The anticipation of a notification, a win, or an achievement floods you with dopamine — but the arrival of that thing often doesn't. This is why modern life, engineered for maximum dopamine stimulation, is producing a generation that cannot sit still and cannot feel satisfied.",
    pullquote: 'Dopamine drives you toward the reward — not the satisfaction of receiving it.',
    source_author: 'Kent Berridge & Terry Robinson (Neuroscience)',
    source_url: '',
    source_type: 'paper',
    themes: ['desire', 'motivation', 'addiction', 'satisfaction', 'dopamine'],
    emotional_states: ['restless', 'unfulfilled', 'addicted', 'striving', 'bored'],
    cognitive_patterns: ['hedonic-adaptation', 'future-orientation', 'avoidance'],
    enneagram_resonance: [3, 7, 5, 9],
    cognitive_style: ['analytical', 'evidence-based'],
    values: ['presence', 'contentment', 'clarity'],
    depth: 'mid',
  },

  {
    id: 'nc_cortisol_chronic',
    title: 'Chronic Stress Shrinks the Brain — Literally',
    short:
      "Cortisol in short bursts is useful — it sharpens focus and mobilises energy. But chronically elevated cortisol, the kind that comes from sustained psychological stress, damages the hippocampus (memory), thins the prefrontal cortex (judgement), and enlarges the amygdala (fear). The brain physically changes under prolonged stress. This is why it becomes progressively harder to think clearly, be patient, or feel hopeful when you're burning out.",
    pullquote: 'The brain physically changes under prolonged stress.',
    source_author: 'Robert Sapolsky (Stanford)',
    source_url: '',
    source_type: 'book',
    themes: ['stress', 'burnout', 'nervous-system', 'neuroscience', 'body'],
    emotional_states: ['burned-out', 'overwhelmed', 'anxious', 'foggy', 'hopeless'],
    cognitive_patterns: ['catastrophising', 'rumination', 'all-or-nothing'],
    enneagram_resonance: [1, 3, 6, 2],
    cognitive_style: ['analytical', 'evidence-based'],
    values: ['wellbeing', 'balance', 'recovery'],
    depth: 'mid',
  },

  {
    id: 'nc_serotonin_status',
    title: 'Serotonin Is Not About Happiness — It Is About Status',
    short:
      "Serotonin regulates mood, but its deeper function is social positioning. High serotonin is associated with feeling secure in your rank — not happy exactly, but settled, unafraid, not needing to prove anything. Low serotonin correlates with anxiety, vigilance, and the desperate need for approval. This is why comparison is so biochemically potent: every perceived loss of status is a literal serotonin drop. Social media is, in this sense, a daily assault on your neurochemistry.",
    pullquote: 'Social media is a daily assault on your neurochemistry.',
    source_author: 'Jordan Peterson / Neuroscience Research',
    source_url: '',
    source_type: 'book',
    themes: ['status', 'comparison', 'approval', 'social-media', 'neuroscience'],
    emotional_states: ['comparing', 'anxious', 'insecure', 'approval-seeking', 'restless'],
    cognitive_patterns: ['comparison', 'approval-seeking', 'social-evaluation'],
    enneagram_resonance: [2, 3, 4, 6],
    cognitive_style: ['analytical', 'evidence-based'],
    values: ['authenticity', 'self-worth', 'freedom'],
    depth: 'mid',
  },

  {
    id: 'nc_oxytocin_trust',
    title: 'Trust Is a Neurochemical — and It Can Be Built',
    short:
      "Oxytocin is released through physical touch, sustained eye contact, shared vulnerability, and being truly heard. It produces trust, warmth, and belonging — and it is the antidote to cortisol. The single most reliable way to lower stress is human connection. Loneliness isn't a feeling — it's a physiological state that increases cortisol, inflammatory markers, and cardiovascular risk. We are not wired for isolation. Connection is maintenance, not luxury.",
    pullquote: 'The single most reliable way to lower stress is human connection.',
    source_author: 'Paul Zak (Claremont Graduate University)',
    source_url: '',
    source_type: 'paper',
    themes: ['connection', 'trust', 'loneliness', 'stress', 'relationships'],
    emotional_states: ['lonely', 'isolated', 'disconnected', 'anxious', 'stressed'],
    cognitive_patterns: ['avoidance', 'withdrawal', 'emotional-suppression'],
    enneagram_resonance: [2, 4, 5, 9],
    cognitive_style: ['relational', 'evidence-based'],
    values: ['connection', 'vulnerability', 'belonging'],
    depth: 'entry',
  },

  // ════════════════════════════════════════════════════════════════
  // BIOLOGY — EVOLUTIONARY & STRESS
  // ════════════════════════════════════════════════════════════════

  {
    id: 'bio_sapolsky_zebra',
    title: "Zebras Don't Get Ulcers — But You Do",
    short:
      "Robert Sapolsky's insight: a zebra on the savannah activates a stress response when chased by a lion, then — if it survives — switches it off completely. Humans activate the same physiological response to a lion, a job review, a social media argument, and a memory from three years ago. We are the only animals who can turn on the stress response just by thinking. And we leave it on. That sustained activation is what destroys us.",
    pullquote: 'We are the only animals who can turn on the stress response just by thinking.',
    source_author: 'Robert Sapolsky',
    source_url: '',
    source_type: 'book',
    themes: ['stress', 'body', 'nervous-system', 'rumination', 'health'],
    emotional_states: ['stressed', 'anxious', 'overwhelmed', 'ruminating', 'burned-out'],
    cognitive_patterns: ['rumination', 'catastrophising', 'past-focus'],
    enneagram_resonance: [1, 5, 6, 9],
    cognitive_style: ['analytical', 'evidence-based'],
    values: ['wellbeing', 'presence', 'balance'],
    depth: 'entry',
  },

  {
    id: 'bio_evolution_mismatch',
    title: 'Your Brain Was Built for a World That No Longer Exists',
    short:
      "The human brain evolved over hundreds of thousands of years in small tribes, with immediate physical threats, high caloric scarcity, and deep social interdependence. Today it operates in a radically different environment — abundance, sedentariness, digital stimulation, social isolation — without having had time to adapt. Many modern ailments — anxiety, obesity, loneliness, distraction — are not character failures. They are evolutionary mismatches.",
    pullquote: 'Many modern ailments are not character failures. They are evolutionary mismatches.',
    source_author: 'Evolutionary Psychology Research',
    source_url: '',
    source_type: 'paper',
    themes: ['evolution', 'modern-life', 'anxiety', 'health', 'adaptation'],
    emotional_states: ['anxious', 'overwhelmed', 'self-critical', 'stuck', 'bored'],
    cognitive_patterns: ['self-blame', 'personalisation', 'catastrophising'],
    enneagram_resonance: [1, 3, 6, 9],
    cognitive_style: ['analytical', 'systems-thinking'],
    values: ['self-compassion', 'understanding', 'clarity'],
    depth: 'mid',
  },

  {
    id: 'bio_sleep_memory',
    title: 'Sleep Is Not Rest — It Is the Brain Doing Its Most Important Work',
    short:
      "During sleep, the brain replays and consolidates the day's experiences, clearing toxic waste products (including those linked to Alzheimer's), processing emotional memories, and pruning unnecessary neural connections. Matthew Walker's research shows that skimping on sleep impairs emotional regulation more than almost any other variable. You cannot think your way to emotional stability while sleep-deprived. Biology first.",
    pullquote: 'You cannot think your way to emotional stability while sleep-deprived.',
    source_author: 'Matthew Walker (UC Berkeley)',
    source_url: '',
    source_type: 'book',
    themes: ['sleep', 'health', 'emotions', 'recovery', 'biology'],
    emotional_states: ['burned-out', 'irritable', 'anxious', 'foggy', 'reactive'],
    cognitive_patterns: ['over-control', 'perfectionism', 'emotional-reasoning'],
    enneagram_resonance: [1, 3, 6, 8],
    cognitive_style: ['analytical', 'evidence-based'],
    values: ['wellbeing', 'recovery', 'balance'],
    depth: 'entry',
  },

  {
    id: 'bio_gut_brain',
    title: 'Your Gut Has More Neurons Than Your Spinal Cord',
    short:
      "The enteric nervous system — the gut — contains approximately 100 million neurons and communicates directly with the brain via the vagus nerve. Around 90% of the signals travel from gut to brain, not the other way. Gut bacteria produce neurotransmitters including serotonin and GABA. The emerging field of psychobiotics shows that what you eat shapes how you feel — not metaphorically, but neurochemically. The mind-body separation was always a fiction.",
    pullquote: 'The mind-body separation was always a fiction.',
    source_author: 'Michael Gershon / Gut-Brain Axis Research',
    source_url: '',
    source_type: 'paper',
    themes: ['body', 'mind-body', 'gut', 'health', 'neuroscience'],
    emotional_states: ['anxious', 'foggy', 'disconnected', 'overwhelmed', 'stuck'],
    cognitive_patterns: ['mind-body-disconnect', 'all-or-nothing', 'avoidance'],
    enneagram_resonance: [1, 5, 9, 6],
    cognitive_style: ['evidence-based', 'holistic'],
    values: ['wellbeing', 'integration', 'health'],
    depth: 'mid',
  },

  // ════════════════════════════════════════════════════════════════
  // PSYCHOLOGY — JUNGIAN
  // ════════════════════════════════════════════════════════════════

  {
    id: 'jung_shadow',
    title: 'What You Resist in Others, You Carry in Yourself',
    short:
      "Jung called it the shadow: the parts of yourself that you have rejected, suppressed, or never developed — now living in your unconscious, projected onto the people who trigger you most. The traits that enrage you in others are often your own disowned qualities. The person you despise most is frequently your best mirror. Integration — owning your shadow — doesn't make you dark. It makes you whole.",
    pullquote: 'The person you despise most is frequently your best mirror.',
    source_author: 'Carl Jung',
    source_url: '',
    source_type: 'book',
    themes: ['shadow', 'projection', 'integration', 'self-knowledge', 'unconscious'],
    emotional_states: ['resentful', 'judgmental', 'irritable', 'disgusted', 'conflicted'],
    cognitive_patterns: ['projection', 'personalisation', 'all-or-nothing'],
    enneagram_resonance: [1, 4, 6, 8],
    cognitive_style: ['reflective', 'depth-oriented'],
    values: ['self-awareness', 'integrity', 'wholeness'],
    depth: 'mid',
  },

  {
    id: 'jung_persona',
    title: 'The Persona You Show the World Can Become a Prison',
    short:
      "Jung described the Persona as the mask we wear for society — the professional face, the composed parent, the reliable friend. The problem is not the mask itself but identification with it: when we forget that the mask is not us. When the gap between the persona and the actual self becomes too wide, the psyche rebels — through depression, crisis, or the sudden collapse of the role. Authenticity is not just a virtue. It is a structural requirement for psychological health.",
    pullquote: 'When we forget the mask is not us, the psyche rebels.',
    source_author: 'Carl Jung',
    source_url: '',
    source_type: 'book',
    themes: ['identity', 'authenticity', 'persona', 'roles', 'unconscious'],
    emotional_states: ['burned-out', 'inauthentic', 'disconnected', 'performing', 'empty'],
    cognitive_patterns: ['approval-seeking', 'people-pleasing', 'emotional-suppression'],
    enneagram_resonance: [2, 3, 6, 1],
    cognitive_style: ['depth-oriented', 'reflective'],
    values: ['authenticity', 'integrity', 'wholeness'],
    depth: 'deep',
  },

  // ════════════════════════════════════════════════════════════════
  // PSYCHOLOGY — HUMANISTIC / TRAUMA
  // ════════════════════════════════════════════════════════════════

  {
    id: 'maslow_hierarchy',
    title: 'You Cannot Self-Actualise If You Are Starving for Safety',
    short:
      "Maslow's hierarchy is often misread as self-help aspiration. Its more serious claim is structural: higher-order needs (belonging, esteem, growth) are genuinely inaccessible when lower-order needs (safety, security, basic connection) are unmet. You cannot meditate your way to serenity while your financial situation is acutely precarious. You cannot focus on meaning while you are chronically isolated. The hierarchy is a map of what to address first.",
    pullquote: 'You cannot meditate your way to serenity while your financial situation is acutely precarious.',
    source_author: 'Abraham Maslow',
    source_url: '',
    source_type: 'book',
    themes: ['needs', 'safety', 'growth', 'wellbeing', 'priorities'],
    emotional_states: ['anxious', 'stuck', 'overwhelmed', 'purposeless', 'unsafe'],
    cognitive_patterns: ['all-or-nothing', 'future-orientation', 'avoidance'],
    enneagram_resonance: [6, 2, 1, 9],
    cognitive_style: ['analytical', 'pragmatic'],
    values: ['safety', 'growth', 'belonging'],
    depth: 'entry',
  },

  {
    id: 'trauma_bessel',
    title: 'Trauma Is Not Stored in the Mind — It Is Stored in the Body',
    short:
      "Bessel van der Kolk's decades of trauma research produced one central finding: traumatic memory is not narrative, it is somatic. The body keeps the score. Trauma is held in posture, muscle tension, startle responses, and breathing patterns — often without any conscious story attached. This is why talking alone does not resolve it. The body must be brought into the healing. Movement, breath, sensation — these are not metaphors. They are the medicine.",
    pullquote: 'The body keeps the score.',
    source_author: 'Bessel van der Kolk',
    source_url: '',
    source_type: 'book',
    themes: ['trauma', 'body', 'healing', 'nervous-system', 'recovery'],
    emotional_states: ['traumatized', 'numb', 'disconnected', 'overwhelmed', 'anxious'],
    cognitive_patterns: ['avoidance', 'emotional-suppression', 'past-focus'],
    enneagram_resonance: [4, 6, 9, 2],
    cognitive_style: ['evidence-based', 'somatic'],
    values: ['healing', 'integration', 'safety'],
    depth: 'deep',
  },

  {
    id: 'brene_vulnerability',
    title: 'Vulnerability Is Not Weakness — It Is the Birthplace of Everything',
    short:
      "Brené Brown's research showed that the people who reported the deepest sense of love, belonging, and meaning had one thing in common: they allowed themselves to be seen — imperfect, uncertain, risk-taking. Vulnerability is not the exposure of weakness. It is the willingness to show up when you cannot control the outcome. Every creative act, every honest conversation, every genuine relationship begins there.",
    pullquote: 'Vulnerability is not weakness. It is the willingness to show up when you cannot control the outcome.',
    source_author: 'Brené Brown',
    source_url: '',
    source_type: 'talk',
    themes: ['vulnerability', 'connection', 'courage', 'authenticity', 'love'],
    emotional_states: ['ashamed', 'guarded', 'performing', 'disconnected', 'fearful'],
    cognitive_patterns: ['emotional-suppression', 'people-pleasing', 'perfectionism'],
    enneagram_resonance: [2, 3, 4, 6],
    cognitive_style: ['relational', 'evidence-based'],
    values: ['authenticity', 'connection', 'courage'],
    depth: 'mid',
  },

  {
    id: 'cbt_cognitive_distortions',
    title: 'The Story You Tell Is Not the Same as What Happened',
    short:
      "Aaron Beck's cognitive therapy rests on a simple insight: it is not events that cause suffering but the interpretation of events. Between what happens and how you feel is a thought — often automatic, often distorted. Catastrophising turns a setback into a catastrophe. All-or-nothing thinking makes partial success into total failure. Personalisation makes other people's behaviour about you. These are not character flaws — they are learned mental habits that can be unlearned.",
    pullquote: 'It is not events that cause suffering but the interpretation of events.',
    source_author: 'Aaron Beck (Cognitive Therapy)',
    source_url: '',
    source_type: 'book',
    themes: ['thoughts', 'interpretation', 'cognitive-distortions', 'emotions', 'CBT'],
    emotional_states: ['anxious', 'self-critical', 'depressed', 'overwhelmed', 'stuck'],
    cognitive_patterns: ['catastrophising', 'all-or-nothing', 'personalisation', 'should-statements'],
    enneagram_resonance: [1, 4, 6, 2],
    cognitive_style: ['analytical', 'evidence-based'],
    values: ['clarity', 'self-awareness', 'growth'],
    depth: 'entry',
  },

  // ════════════════════════════════════════════════════════════════
  // SOCIAL PSYCHOLOGY
  // ════════════════════════════════════════════════════════════════

  {
    id: 'social_fundamental_attribution',
    title: 'You Judge Others by Their Actions and Yourself by Your Intentions',
    short:
      "The Fundamental Attribution Error is one of the most replicated findings in psychology: when others behave badly, we attribute it to character ('they're a selfish person'); when we behave badly, we attribute it to circumstances ('I was having a terrible day'). We extend ourselves enormous moral latitude and extend others very little. This is not a personality flaw — it is universal. But naming it gives you a choice.",
    pullquote: "We extend ourselves enormous moral latitude and extend others very little.",
    source_author: 'Lee Ross (Stanford Social Psychology)',
    source_url: '',
    source_type: 'paper',
    themes: ['bias', 'judgment', 'relationships', 'empathy', 'attribution'],
    emotional_states: ['judgmental', 'resentful', 'comparing', 'conflicted'],
    cognitive_patterns: ['personalisation', 'all-or-nothing', 'projection'],
    enneagram_resonance: [1, 2, 3, 8],
    cognitive_style: ['analytical', 'evidence-based'],
    values: ['empathy', 'self-awareness', 'fairness'],
    depth: 'entry',
  },

  {
    id: 'social_conformity',
    title: 'Most People Would Rather Be Wrong Together Than Right Alone',
    short:
      "Solomon Asch's conformity experiments showed that a significant percentage of people will give obviously wrong answers to simple questions if the people around them have already given that wrong answer. We don't just follow the crowd to fit in — we actually begin to doubt our own perception. Social reality has a gravity that distorts individual judgement. Understanding this is not cynicism; it is necessary for anyone who wants to think independently.",
    pullquote: 'Social reality has a gravity that distorts individual judgement.',
    source_author: 'Solomon Asch (Social Psychology)',
    source_url: '',
    source_type: 'paper',
    themes: ['conformity', 'group-think', 'independence', 'identity', 'courage'],
    emotional_states: ['conflicted', 'pressured', 'inauthentic', 'doubtful', 'comparing'],
    cognitive_patterns: ['approval-seeking', 'people-pleasing', 'social-evaluation'],
    enneagram_resonance: [2, 3, 6, 9],
    cognitive_style: ['analytical', 'evidence-based'],
    values: ['authenticity', 'courage', 'independence'],
    depth: 'mid',
  },

  {
    id: 'social_loneliness_epidemic',
    title: 'Loneliness Is a Public Health Crisis — Not a Personal Failure',
    short:
      "More people today report having no one to confide in than at any point in recorded social history. Loneliness has been shown to increase mortality risk more than smoking 15 cigarettes a day. And yet the dominant cultural narrative treats loneliness as a personal embarrassment — a sign that you're not interesting enough, not social enough, not enough. This is exactly backwards. Loneliness is a social disease, and it thrives on the shame that prevents people from admitting it.",
    pullquote: 'Loneliness thrives on the shame that prevents people from admitting it.',
    source_author: 'John Cacioppo (University of Chicago)',
    source_url: '',
    source_type: 'book',
    themes: ['loneliness', 'connection', 'social', 'shame', 'health'],
    emotional_states: ['lonely', 'ashamed', 'isolated', 'disconnected'],
    cognitive_patterns: ['personalisation', 'withdrawal', 'avoidance'],
    enneagram_resonance: [2, 4, 5, 9],
    cognitive_style: ['evidence-based', 'relational'],
    values: ['connection', 'belonging', 'vulnerability'],
    depth: 'entry',
  },

  {
    id: 'social_power_structures',
    title: 'The Personal Is Political — Your Private Life Is Shaped by Public Forces',
    short:
      "Second-wave feminism introduced a phrase that applies well beyond gender: the personal is political. The decisions that feel purely private — when to work, whether to rest, how to eat, what to want — are shaped by economic structures, cultural norms, and power arrangements that are mostly invisible. Feeling inadequate about your productivity is partly about you and partly about a culture that has monetised every waking hour. Separating the two is a form of clarity.",
    pullquote: 'Feeling inadequate about your productivity is partly about you and partly about a culture that has monetised every waking hour.',
    source_author: 'Carol Hanisch / Second-Wave Feminism',
    source_url: '',
    source_type: 'essay',
    themes: ['power', 'society', 'politics', 'identity', 'culture'],
    emotional_states: ['self-critical', 'overwhelmed', 'burned-out', 'inadequate', 'stuck'],
    cognitive_patterns: ['self-blame', 'personalisation', 'all-or-nothing'],
    enneagram_resonance: [1, 2, 4, 6],
    cognitive_style: ['systems-thinking', 'analytical'],
    values: ['justice', 'clarity', 'self-compassion'],
    depth: 'mid',
  },

  // ════════════════════════════════════════════════════════════════
  // BEHAVIOURAL ECONOMICS
  // ════════════════════════════════════════════════════════════════

  {
    id: 'be_loss_aversion',
    title: 'Losses Hurt Twice As Much As Equivalent Gains Feel Good',
    short:
      "Kahneman and Tversky's Prospect Theory established that the pain of losing ₹100 is roughly twice as intense as the pleasure of gaining ₹100. This 'loss aversion' explains a vast range of human behaviour: why we stay in bad situations too long, why we hold on to losing investments, why criticism stings more than praise lifts. Evolution built us to weight losses heavily because, on the savannah, a loss could be fatal. But in modern life, this bias distorts almost every decision we make.",
    pullquote: 'The pain of losing is twice as intense as the pleasure of an equivalent gain.',
    source_author: 'Daniel Kahneman & Amos Tversky',
    source_url: '',
    source_type: 'paper',
    themes: ['decision-making', 'bias', 'loss', 'risk', 'behaviour'],
    emotional_states: ['fearful', 'risk-averse', 'stuck', 'clinging', 'anxious'],
    cognitive_patterns: ['loss-aversion', 'status-quo-bias', 'catastrophising'],
    enneagram_resonance: [5, 6, 1, 9],
    cognitive_style: ['analytical', 'evidence-based'],
    values: ['clarity', 'courage', 'growth'],
    depth: 'entry',
  },

  {
    id: 'be_present_bias',
    title: 'You Systematically Overvalue the Present and Undervalue the Future',
    short:
      "Behavioural economics calls it hyperbolic discounting: we overweight immediate rewards relative to future ones in a predictable and irrational pattern. Given the choice between ₹100 today and ₹120 next week, many choose ₹100. Given the choice between ₹100 in a year and ₹120 in a year and a week, almost everyone waits for ₹120. The time gap is identical — but our preference reverses. This is why we fail at diets, savings, and long-term projects. The future self feels like a stranger.",
    pullquote: 'The future self feels like a stranger — so you discount their needs accordingly.',
    source_author: 'Richard Thaler & Cass Sunstein (Behavioural Economics)',
    source_url: '',
    source_type: 'book',
    themes: ['time', 'decision-making', 'habits', 'willpower', 'future'],
    emotional_states: ['impatient', 'impulsive', 'restless', 'stuck', 'conflicted'],
    cognitive_patterns: ['present-bias', 'short-term-thinking', 'procrastination'],
    enneagram_resonance: [7, 3, 9, 6],
    cognitive_style: ['analytical', 'evidence-based'],
    values: ['intentionality', 'growth', 'patience'],
    depth: 'mid',
  },

  {
    id: 'be_scarcity_mindset',
    title: "Scarcity Hijacks Your Mind — Even When the Scarcity Isn't Physical",
    short:
      "Sendhil Mullainathan and Eldar Shafir's research showed that scarcity — of money, time, or social connection — doesn't just restrict resources. It hijacks cognitive bandwidth. People in scarcity situations perform worse on IQ tests, make worse decisions, and are less able to think long-term. This is not a character flaw of the poor or busy; it is a predictable cognitive consequence of operating under resource pressure. Understanding this reframes a lot of self-blame.",
    pullquote: 'Scarcity hijacks cognitive bandwidth — this reframes a lot of self-blame.',
    source_author: 'Mullainathan & Shafir (Harvard / Princeton)',
    source_url: '',
    source_type: 'book',
    themes: ['scarcity', 'decision-making', 'stress', 'self-compassion', 'cognition'],
    emotional_states: ['overwhelmed', 'self-critical', 'stuck', 'anxious', 'burned-out'],
    cognitive_patterns: ['self-blame', 'tunnel-vision', 'short-term-thinking'],
    enneagram_resonance: [1, 6, 3, 9],
    cognitive_style: ['analytical', 'evidence-based'],
    values: ['self-compassion', 'clarity', 'understanding'],
    depth: 'mid',
  },

  {
    id: 'naval_specific_knowledge',
    title: 'Play Long-Term Games With Long-Term People',
    short:
      "The returns in life come from compound interest — in relationships, in knowledge, in money, in reputation. But compounding requires time, and time requires commitment. Most people opt for short-term thinking without realizing it. The irony is that the difficulty is usually where the compound return begins. The people who win at 40 are usually the ones who picked something at 25 and stayed.",
    pullquote: 'The difficulty is usually where the compound return begins.',
    source_author: 'Naval Ravikant',
    source_url: 'https://nav.al',
    source_type: 'essay',
    themes: ['commitment', 'compounding', 'patience', 'long-term thinking', 'mastery'],
    emotional_states: ['impatient', 'comparing', 'stuck', 'restless', 'doubting'],
    cognitive_patterns: ['short-term-bias', 'grass-is-greener', 'comparison'],
    enneagram_resonance: [3, 5, 7, 9],
    cognitive_style: ['analytical', 'first-principles'],
    values: ['mastery', 'integrity', 'patience'],
    depth: 'mid',
  },

  // ════════════════════════════════════════════════════════════════
  // POLITICAL PHILOSOPHY
  // ════════════════════════════════════════════════════════════════

  {
    id: 'pol_arendt_banality',
    title: 'Evil Is Rarely Demonic — It Is Usually the Absence of Thought',
    short:
      "Hannah Arendt, covering the Eichmann trial, expected to find a monster. She found a bureaucrat. Eichmann did not hate Jews — he was simply not thinking. He was following procedures, advancing his career, obeying norms. Her phrase 'the banality of evil' described this: that the greatest moral failures are often not driven by malice but by the suspension of individual judgement in the face of authority and social expectation.",
    pullquote: 'The greatest moral failures are often not malice — they are the suspension of individual judgement.',
    source_author: 'Hannah Arendt',
    source_url: '',
    source_type: 'book',
    themes: ['morality', 'authority', 'conformity', 'thinking', 'responsibility'],
    emotional_states: ['compliant', 'pressured', 'conflicted', 'doubtful', 'passive'],
    cognitive_patterns: ['people-pleasing', 'approval-seeking', 'avoidance'],
    enneagram_resonance: [6, 9, 1, 3],
    cognitive_style: ['philosophical', 'analytical'],
    values: ['courage', 'integrity', 'responsibility'],
    depth: 'deep',
  },

  {
    id: 'pol_rawls_veil',
    title: "Would You Accept This System If You Didn't Know Where You'd Land In It?",
    short:
      "John Rawls asked: if you didn't know whether you'd be born rich or poor, male or female, advantaged or disadvantaged, what kind of society would you design? This 'veil of ignorance' is a thought experiment for testing fairness — not just in policy, but in your own decisions and relationships. Would you treat a person differently if you didn't know their position? Often the honest answer is uncomfortable.",
    pullquote: "Would you accept this system if you didn't know where you'd land in it?",
    source_author: 'John Rawls',
    source_url: '',
    source_type: 'book',
    themes: ['fairness', 'justice', 'empathy', 'society', 'ethics'],
    emotional_states: ['conflicted', 'privileged', 'judging', 'comparing'],
    cognitive_patterns: ['attribution-bias', 'in-group-out-group', 'all-or-nothing'],
    enneagram_resonance: [1, 2, 5, 8],
    cognitive_style: ['philosophical', 'analytical'],
    values: ['justice', 'empathy', 'fairness'],
    depth: 'deep',
  },

  {
    id: 'pol_foucault_power',
    title: 'Power Works Best When You Police Yourself',
    short:
      "Foucault argued that the most efficient form of power is not the authority that punishes you — it is the authority you have so thoroughly internalised that you punish yourself. The panopticon: a prison where inmates can never be sure if they're being watched, so they behave as if they always are. Modern equivalents are everywhere: the performance review, the social media profile, the internalised voice that says 'what will people think?' You are simultaneously the guard and the prisoner.",
    pullquote: 'You are simultaneously the guard and the prisoner.',
    source_author: 'Michel Foucault',
    source_url: '',
    source_type: 'book',
    themes: ['power', 'society', 'self-surveillance', 'freedom', 'conformity'],
    emotional_states: ['self-critical', 'performing', 'anxious', 'constrained', 'inauthentic'],
    cognitive_patterns: ['self-blame', 'approval-seeking', 'people-pleasing'],
    enneagram_resonance: [1, 3, 6, 4],
    cognitive_style: ['philosophical', 'systems-thinking'],
    values: ['freedom', 'authenticity', 'courage'],
    depth: 'deep',
  },

  {
    id: 'pol_amartya_capabilities',
    title: 'Freedom Is Not the Absence of Constraint — It Is the Presence of Capability',
    short:
      "Amartya Sen's capabilities approach reframes what we mean by freedom. Formal freedom — no one is stopping you — means little if you lack the real capability to act. A person can be 'free' to attend university but unable to because of poverty, care responsibilities, or cultural pressure. Sen argues we should measure human wellbeing not by income or formal rights, but by what people are actually able to do and be. The gap between formal and real freedom is where most human unfreedom lives.",
    pullquote: 'The gap between formal and real freedom is where most human unfreedom lives.',
    source_author: 'Amartya Sen',
    source_url: '',
    source_type: 'book',
    themes: ['freedom', 'capability', 'justice', 'wellbeing', 'society'],
    emotional_states: ['trapped', 'constrained', 'purposeless', 'frustrated', 'unfulfilled'],
    cognitive_patterns: ['learned-helplessness', 'all-or-nothing', 'self-blame'],
    enneagram_resonance: [1, 4, 8, 6],
    cognitive_style: ['analytical', 'systems-thinking'],
    values: ['freedom', 'justice', 'dignity'],
    depth: 'deep',
  },

];

/** All unique emotional states across the library — used for filter chips. */
export const ALL_EMOTIONAL_STATES: string[] = Array.from(
  new Set(SHORTS_LIBRARY.flatMap(s => s.emotional_states)),
).sort();

/** All unique themes across the library. */
export const ALL_THEMES: string[] = Array.from(
  new Set(SHORTS_LIBRARY.flatMap(s => s.themes)),
).sort();
