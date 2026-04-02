/**
 * Wisdom Shorts — hand-curated library (MVP: 25 entries).
 *
 * Each short is fully tagged so the client-side matching algorithm in
 * WisdomService can surface relevant content without a network call.
 *
 * Sources: Acharya Prashant, Alan Watts, Viktor Frankl, J. Krishnamurti,
 *          Osho, Naval Ravikant, Neuroscience research.
 */

import { WisdomShort } from '../types';

export const SHORTS_LIBRARY: WisdomShort[] = [
  // ── Acharya Prashant ────────────────────────────────────────────────────────

  {
    id: 'ap_ego_hunger',
    title: "The Ego's Hunger Cannot Be Fed",
    short:
      "The ego is not a thing you have — it is a pattern of seeking. It wants security, approval, continuity. And the strange thing is, the more you feed it, the hungrier it becomes. Satisfaction is not in its vocabulary. This is not a flaw in you — it is the nature of the conditioned mind. The only freedom is to see the hunger clearly, not to try to satiate it.",
    pullquote: "The ego is not a thing you have — it is a pattern of seeking.",
    source_author: 'Acharya Prashant',
    source_url: 'https://www.youtube.com/c/AcharyaPrashant',
    source_type: 'talk',
    themes: ['ego', 'desire', 'conditioning', 'freedom', 'self-inquiry'],
    emotional_states: ['anxious', 'restless', 'unfulfilled', 'striving', 'overwhelmed'],
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
      "Every instance of suffering involves a comparison — this is how things are, and this is how they should be. Pain arises from the gap between the two. Watch any grievance, any resentment, any disappointment, and you'll find the hidden comparison underneath it. Now notice: who decided how things should be? A conditioned mind, shaped by fear, memory, and social expectation. What if you met this moment without the 'should'?",
    pullquote: 'Every instance of suffering involves a comparison.',
    source_author: 'Acharya Prashant',
    source_url: 'https://www.youtube.com/c/AcharyaPrashant',
    source_type: 'talk',
    themes: ['comparison', 'suffering', 'expectations', 'acceptance', 'ego'],
    emotional_states: ['resentful', 'disappointed', 'envious', 'comparing', 'unfulfilled'],
    cognitive_patterns: ['should-statements', 'comparison', 'all-or-nothing'],
    enneagram_resonance: [1, 2, 3, 4],
    cognitive_style: ['reflective', 'analytical'],
    values: ['authenticity', 'clarity', 'peace'],
    depth: 'mid',
  },

  {
    id: 'ap_love_attachment',
    title: 'Love Does Not Need — It Simply Gives',
    short:
      "What most people call love is actually need. 'I love you' often means 'I need you to be a certain way so I can feel secure.' Real love has a different quality: it doesn't demand. It doesn't fear the other person's freedom. It doesn't shrink when the other person grows. This is not a sentiment — it's a pointer to the difference between the ego's transaction and something that actually transcends the ego. Most relationships are negotiations between two fears.",
    pullquote: 'Most relationships are negotiations between two fears.',
    source_author: 'Acharya Prashant',
    source_url: 'https://www.youtube.com/c/AcharyaPrashant',
    source_type: 'talk',
    themes: ['love', 'attachment', 'relationships', 'ego', 'freedom'],
    emotional_states: ['jealous', 'possessive', 'insecure', 'dependent', 'resentful'],
    cognitive_patterns: ['mind-reading', 'emotional-reasoning', 'personalisation'],
    enneagram_resonance: [2, 4, 6, 8],
    cognitive_style: ['reflective', 'analytical'],
    values: ['love', 'freedom', 'authenticity'],
    depth: 'mid',
  },

  {
    id: 'ap_discipline_freedom',
    title: 'Real Discipline Is Not Restriction — It Is Seeing Clearly',
    short:
      "We think of discipline as the ability to force yourself to do things you don't want to do. But this model assumes a divided self: one part that knows better, and one part that must be suppressed. When you really see the consequences of an action — clearly, not intellectually — the avoidance happens naturally. You don't need to discipline yourself to not touch a hot stove. You've seen what happens. Real discipline is clarity, not control.",
    pullquote:
      'When you really see the consequences of an action — clearly — avoidance happens naturally.',
    source_author: 'Acharya Prashant',
    source_url: 'https://www.youtube.com/c/AcharyaPrashant',
    source_type: 'talk',
    themes: ['discipline', 'clarity', 'freedom', 'self-control', 'habits'],
    emotional_states: ['self-critical', 'struggling', 'motivated', 'conflicted', 'stuck'],
    cognitive_patterns: ['perfectionism', 'all-or-nothing', 'self-blame'],
    enneagram_resonance: [1, 3, 6, 8],
    cognitive_style: ['analytical', 'reflective'],
    values: ['clarity', 'integrity', 'freedom'],
    depth: 'mid',
  },

  // ── Alan Watts ───────────────────────────────────────────────────────────────

  {
    id: 'aw_you_are_universe',
    title: 'You Are Not In the Universe — You Are the Universe',
    short:
      "You didn't come into this world. You came out of it, like a wave from the ocean. You are not a separate self that got dropped into existence and must now figure out how to survive. You are the universe becoming aware of itself in this particular form. The anxiety of separation — of being a small, vulnerable self against a large, indifferent world — is the root of most human suffering. And it rests on a mistaken premise.",
    pullquote: "You didn't come into this world. You came out of it, like a wave from the ocean.",
    source_author: 'Alan Watts',
    source_url: 'https://www.youtube.com/@AlanWattsOrganization',
    source_type: 'talk',
    themes: ['identity', 'separation', 'existence', 'consciousness', 'non-duality'],
    emotional_states: ['lonely', 'anxious', 'existential', 'lost', 'disconnected'],
    cognitive_patterns: ['personalisation', 'catastrophising', 'mind-reading'],
    enneagram_resonance: [4, 5, 7, 9],
    cognitive_style: ['intuitive', 'holistic'],
    values: ['meaning', 'connection', 'wonder'],
    depth: 'deep',
  },

  {
    id: 'aw_backwards_law',
    title: 'The Harder You Try to Control, the Less Control You Have',
    short:
      "There is a deep irony at the center of most human striving: the things we most want — love, sleep, pleasure, confidence — cannot be forced. The moment you try to force them, they retreat. The harder you try to be happy, the less happy you become. The more you try to fall asleep, the more awake you are. This is the backwards law: in many domains, the path to the destination runs in the opposite direction of trying. The way forward is often a kind of relaxed allowing.",
    pullquote:
      'The things we most want cannot be forced. The moment you try to force them, they retreat.',
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
    id: 'aw_present_moment',
    title: 'Muddy Water Becomes Clear If You Let It Be Still',
    short:
      "We are constantly stirring the water of our minds — analyzing, planning, worrying, replaying. And then we wonder why things are unclear. But clarity is not achieved by more stirring; it comes when the stirring stops. You cannot force insight. You cannot will yourself into calm. What you can do is stop adding to the turbulence and let the natural settling happen. The present moment is not something you practice on weekends — it is the only place where anything has ever actually happened.",
    pullquote: 'Clarity is not achieved by more stirring; it comes when the stirring stops.',
    source_author: 'Alan Watts',
    source_url: 'https://www.youtube.com/@AlanWattsOrganization',
    source_type: 'talk',
    themes: ['presence', 'stillness', 'clarity', 'mind', 'meditation'],
    emotional_states: ['overwhelmed', 'anxious', 'overthinking', 'scattered', 'unclear'],
    cognitive_patterns: ['rumination', 'over-analysis', 'future-orientation'],
    enneagram_resonance: [1, 5, 6, 7, 9],
    cognitive_style: ['intuitive', 'holistic'],
    values: ['clarity', 'peace', 'presence'],
    depth: 'entry',
  },

  {
    id: 'aw_work_play',
    title: 'The Meaning of Life Is Just to Be Alive',
    short:
      "We have arranged society so that nearly everything we do is for the sake of something else. We work to earn money, to retire, to finally do what we want. We exercise so we can be healthy, so we can live longer, so we can do more of what we've been too busy to do. At some point you have to ask: what is the thing itself? And Watts's disturbing answer is that you are already doing it — living — but you haven't noticed because you've been too busy getting ready.",
    pullquote:
      "You are already doing it — living — but you haven't noticed because you've been too busy getting ready.",
    source_author: 'Alan Watts',
    source_url: 'https://www.youtube.com/@AlanWattsOrganization',
    source_type: 'talk',
    themes: ['purpose', 'presence', 'work', 'meaning', 'life'],
    emotional_states: ['purposeless', 'dull', 'anxious', 'striving', 'disconnected'],
    cognitive_patterns: ['future-orientation', 'all-or-nothing', 'perfectionism'],
    enneagram_resonance: [3, 5, 7, 9, 1],
    cognitive_style: ['intuitive', 'philosophical'],
    values: ['presence', 'joy', 'meaning'],
    depth: 'mid',
  },

  // ── Viktor Frankl ───────────────────────────────────────────────────────────

  {
    id: 'vf_meaning_suffering',
    title: 'When You Cannot Choose the Situation, Choose the Stance',
    short:
      "Between stimulus and response there is a space. In that space is our power to choose our response. In our response lies our growth and our freedom. Frankl discovered this not in a lecture hall but in Auschwitz — that everything can be taken from a person but one thing: the last of the human freedoms, to choose one's attitude in any given set of circumstances.",
    pullquote:
      'Everything can be taken from a person but one thing: the last of the human freedoms.',
    source_author: 'Viktor Frankl',
    source_url: '',
    source_type: 'book',
    themes: ['meaning', 'suffering', 'freedom', 'resilience', 'attitude'],
    emotional_states: ['hopeless', 'trapped', 'victimized', 'stuck', 'grieving'],
    cognitive_patterns: ['learned-helplessness', 'all-or-nothing', 'personalisation'],
    enneagram_resonance: [1, 4, 6, 8],
    cognitive_style: ['analytical', 'narrative'],
    values: ['meaning', 'freedom', 'dignity'],
    depth: 'mid',
  },

  {
    id: 'vf_love_meaning',
    title: 'The Salvation of Man Is Through Love and In Love',
    short:
      "In the darkest place Frankl had ever experienced, he discovered something: that the image of his wife — her face, her laugh, an imagined conversation — was more sustaining than any physical comfort. Love, he realized, is not a feeling that depends on the presence of its object. It is a mode of seeing, a way of being present to another person's essential dignity, whether or not they are in the room.",
    pullquote:
      "Love is a mode of seeing — a way of being present to another person's essential dignity.",
    source_author: 'Viktor Frankl',
    source_url: '',
    source_type: 'book',
    themes: ['love', 'meaning', 'connection', 'relationships', 'resilience'],
    emotional_states: ['lonely', 'grieving', 'longing', 'disconnected', 'hopeless'],
    cognitive_patterns: ['all-or-nothing', 'fortune-telling', 'personalisation'],
    enneagram_resonance: [2, 4, 6, 9],
    cognitive_style: ['narrative', 'relational'],
    values: ['love', 'connection', 'meaning'],
    depth: 'deep',
  },

  {
    id: 'vf_unavoidable_suffering',
    title: 'If Suffering Is Unavoidable, Find the Why',
    short:
      "Frankl observed that people could endure almost any suffering if they had a reason for it. The question 'why am I suffering?' is not a complaint — it is an existential search. When a person finds a purpose large enough — love for another, an unfinished work, a commitment — the suffering does not disappear, but it becomes bearable. The unbearable is not pain. The unbearable is pain without meaning.",
    pullquote: 'The unbearable is not pain. The unbearable is pain without meaning.',
    source_author: 'Viktor Frankl',
    source_url: '',
    source_type: 'book',
    themes: ['suffering', 'meaning', 'purpose', 'resilience', 'existential'],
    emotional_states: ['hopeless', 'grieving', 'purposeless', 'lost', 'trapped'],
    cognitive_patterns: ['learned-helplessness', 'catastrophising', 'all-or-nothing'],
    enneagram_resonance: [4, 6, 9, 1],
    cognitive_style: ['narrative', 'philosophical'],
    values: ['meaning', 'resilience', 'purpose'],
    depth: 'deep',
  },

  // ── J. Krishnamurti ─────────────────────────────────────────────────────────

  {
    id: 'jk_thought_problem',
    title: 'The Thinker and the Thought Are the Same Movement',
    short:
      "We believe there is a thinker who has thoughts — a self that observes problems and tries to solve them. But look more carefully: when you observe a thought, who is doing the observing? It is another thought. The observer is the observed. This is not a philosophical puzzle — it is a direct fact you can verify right now. And if the thinker is the thought, then the 'me' that is suffering is itself the suffering — not a separate entity that needs to be fixed.",
    pullquote: 'The observer is the observed.',
    source_author: 'J. Krishnamurti',
    source_url: 'https://www.jkrishnamurti.org',
    source_type: 'talk',
    themes: ['consciousness', 'self-inquiry', 'thought', 'identity', 'observation'],
    emotional_states: ['confused', 'analytical', 'stuck', 'self-critical', 'seeking'],
    cognitive_patterns: ['rumination', 'self-blame', 'over-analysis'],
    enneagram_resonance: [4, 5, 6, 1],
    cognitive_style: ['analytical', 'philosophical'],
    values: ['truth', 'clarity', 'self-understanding'],
    depth: 'deep',
  },

  {
    id: 'jk_freedom_known',
    title: 'Security Is the Most Dangerous Thing You Can Seek',
    short:
      "The brain seeks security above all else — in beliefs, in relationships, in routines, in ideology. And this seeking of security is exactly what creates its opposite: fear. Because anything that can be built can be threatened. Krishnamurti's radical suggestion is that real security does not come from finding a safer position. It comes from seeing that psychological security is an illusion — and being free of the need for it.",
    pullquote: 'Anything that can be built can be threatened.',
    source_author: 'J. Krishnamurti',
    source_url: 'https://www.jkrishnamurti.org',
    source_type: 'book',
    themes: ['security', 'fear', 'freedom', 'belief', 'control'],
    emotional_states: ['anxious', 'fearful', 'controlling', 'resistant', 'clinging'],
    cognitive_patterns: ['catastrophising', 'over-control', 'all-or-nothing'],
    enneagram_resonance: [1, 5, 6, 8],
    cognitive_style: ['analytical', 'philosophical'],
    values: ['freedom', 'truth', 'courage'],
    depth: 'deep',
  },

  {
    id: 'jk_relationship_mirror',
    title: 'Every Relationship Is a Mirror',
    short:
      "When you react strongly to someone — with anger, admiration, resentment, or love — you are not seeing them. You are seeing the projection of your own conditioning. The person who irritates you is reflecting something about yourself that you haven't examined. The person you idealize is carrying a quality you want but don't claim. This is not a comforting thought. But if it's true, it means every relationship is an invitation to self-knowledge, if you choose to look.",
    pullquote:
      "The person who irritates you is reflecting something about yourself that you haven't examined.",
    source_author: 'J. Krishnamurti',
    source_url: 'https://www.jkrishnamurti.org',
    source_type: 'talk',
    themes: ['relationships', 'projection', 'self-knowledge', 'conflict', 'mirror'],
    emotional_states: ['resentful', 'conflicted', 'irritable', 'jealous', 'judgmental'],
    cognitive_patterns: ['projection', 'personalisation', 'mind-reading'],
    enneagram_resonance: [2, 4, 6, 8, 1],
    cognitive_style: ['analytical', 'reflective'],
    values: ['self-awareness', 'truth', 'growth'],
    depth: 'mid',
  },

  {
    id: 'jk_fear_time',
    title: 'Fear Lives in Time — Not in the Present Moment',
    short:
      "Examine any fear and you'll find it involves the future: what might happen, what I might lose, what they might think. Fear does not exist in the present moment itself — the present moment is just what is. It is thought that projects into the future, imagines threats, and generates the physical sensation of fear. This doesn't mean danger isn't real. But it means most of what we call fear is not about an actual threat — it is about a mental movie of a possible threat.",
    pullquote:
      'Fear does not exist in the present moment itself — it is thought that projects into the future.',
    source_author: 'J. Krishnamurti',
    source_url: 'https://www.jkrishnamurti.org',
    source_type: 'talk',
    themes: ['fear', 'time', 'thought', 'presence', 'anxiety'],
    emotional_states: ['fearful', 'anxious', 'anticipating', 'worried', 'overthinking'],
    cognitive_patterns: ['fortune-telling', 'catastrophising', 'future-orientation'],
    enneagram_resonance: [4, 5, 6, 1],
    cognitive_style: ['philosophical', 'analytical'],
    values: ['courage', 'clarity', 'presence'],
    depth: 'deep',
  },

  // ── Osho ────────────────────────────────────────────────────────────────────

  {
    id: 'osho_witnessing',
    title: 'You Are Not Your Mood — You Are the Sky',
    short:
      "The weather changes — rain, sun, storm, calm. The sky does not change. You are the sky, not the weather. When you are angry, the anger is happening in you, but you are not the anger. When you are sad, sadness visits — but you are not the sadness. The moment you understand this, the quality of your entire inner life shifts. You can watch the storm without becoming the storm. This is what meditation is: not an absence of feeling, but a larger presence that holds the feeling.",
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
    id: 'osho_celebration',
    title: 'Life Is Not a Problem to Be Solved — It Is a Mystery to Be Lived',
    short:
      "We have been taught to treat life as a project: set goals, solve problems, become someone, achieve something. But this approach contains a hidden assumption — that life is essentially deficient and needs fixing. Osho's invitation is different: what if the very ordinariness of today, its meals and frustrations and small pleasures, is already the celebration? Not after you've fixed it. Right now, as it is. The dance is not ahead of you. You're already in it.",
    pullquote: "The dance is not ahead of you. You're already in it.",
    source_author: 'Osho',
    source_url: '',
    source_type: 'book',
    themes: ['presence', 'joy', 'acceptance', 'celebration', 'meaning'],
    emotional_states: ['joyless', 'dull', 'striving', 'disconnected', 'bored'],
    cognitive_patterns: ['future-orientation', 'all-or-nothing', 'perfectionism'],
    enneagram_resonance: [1, 3, 4, 7, 9],
    cognitive_style: ['experiential', 'intuitive'],
    values: ['joy', 'presence', 'spontaneity'],
    depth: 'entry',
  },

  {
    id: 'osho_aloneness',
    title: 'Loneliness Is the Absence of the Other — Aloneness Is the Presence of Yourself',
    short:
      "People run from aloneness because they confuse it with loneliness. Loneliness is a wound: you feel incomplete without someone to fill the void. Aloneness is a fullness: you are so present with yourself that there is no void to fill. The first state is a kind of poverty; the second is a kind of richness. Most people never discover aloneness because they are too busy escaping loneliness. They fill every silent moment with distraction, other people, noise. The invitation is to stay with the silence long enough to discover what lives there.",
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

  // ── Naval Ravikant ──────────────────────────────────────────────────────────

  {
    id: 'nr_happiness_choice',
    title: 'Happiness Is Not a Warm Feeling — It Is the Absence of Desire',
    short:
      "Everyone says they want to be happy. But watch what they do. They want to achieve something, acquire something, become something. And the moment they get it, the next desire is already forming. Happiness is not what you feel when you get what you want. It is what remains when you stop wanting. Meditation is not a spiritual practice — it is training to sit with what is, without wishing it were otherwise. That's it.",
    pullquote: 'Happiness is what remains when you stop wanting.',
    source_author: 'Naval Ravikant',
    source_url: 'https://nav.al',
    source_type: 'essay',
    themes: ['happiness', 'desire', 'contentment', 'mindfulness', 'achievement'],
    emotional_states: ['unfulfilled', 'striving', 'restless', 'anxious', 'comparing'],
    cognitive_patterns: ['hedonic-adaptation', 'future-orientation', 'all-or-nothing'],
    enneagram_resonance: [3, 5, 7, 1],
    cognitive_style: ['analytical', 'first-principles'],
    values: ['simplicity', 'freedom', 'clarity'],
    depth: 'mid',
  },

  {
    id: 'nr_specific_knowledge',
    title: 'Play Long-Term Games With Long-Term People',
    short:
      "The returns in life come from compound interest — in relationships, in knowledge, in money, in reputation. But compounding requires time, and time requires commitment. Most people opt for short-term thinking without realizing it: they switch careers, friendships, and ideas whenever they hit difficulty. The irony is that the difficulty is usually where the compound return begins. The people who win at 40 are usually the ones who picked something at 25 and stayed.",
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

  {
    id: 'nr_anger_signal',
    title: 'Anger Is a Sign That Your Model of Reality Is Wrong',
    short:
      "When you're angry, it means the world isn't behaving the way you think it should. But the world doesn't have a 'should.' Your model of how things should work is a construct of your mind, built from limited information and conditioned preferences. This doesn't mean accept everything passively. It means: before you act from anger, examine the model. What belief was just violated? Is that belief actually valid? Often the anger dissolves when you look at the underlying assumption.",
    pullquote:
      "Anger means the world isn't behaving the way you think it should. But the world doesn't have a 'should.'",
    source_author: 'Naval Ravikant',
    source_url: 'https://nav.al',
    source_type: 'essay',
    themes: ['anger', 'beliefs', 'reality', 'emotion', 'mindset'],
    emotional_states: ['angry', 'frustrated', 'resentful', 'reactive', 'irritable'],
    cognitive_patterns: ['should-statements', 'all-or-nothing', 'personalisation'],
    enneagram_resonance: [1, 6, 8, 3],
    cognitive_style: ['analytical', 'first-principles'],
    values: ['clarity', 'self-awareness', 'reason'],
    depth: 'entry',
  },

  // ── Neuroscience ────────────────────────────────────────────────────────────

  {
    id: 'ns_default_mode',
    title: "Your Brain's Resting State Is Making You Miserable",
    short:
      "When you're not actively focused on a task, your brain doesn't rest — it activates its Default Mode Network: a circuit that replays the past, anticipates the future, and thinks about yourself in relation to others. Studies consistently show: the more time people spend in this network — mind-wandering, ruminating, planning — the less happy they report being. This is why presence is the practice: not as a spiritual ideal, but as a neurological one.",
    pullquote:
      'The more time people spend mind-wandering, the less happy they report being.',
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
    themes: ['habits', 'neuroplasticity', 'thought-patterns', 'self-improvement', 'change'],
    emotional_states: ['stuck', 'self-critical', 'hopeless', 'motivated', 'curious'],
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
      "When you're under acute stress, the amygdala goes into overdrive and begins to suppress the prefrontal cortex — the region responsible for nuanced thinking, future planning, and perspective-taking. This is why decisions made in anger, fear, or overwhelm are often regretted. The brain under stress is not defective — it is doing exactly what it evolved to do: move fast. But move fast was built for physical threats, not relationship conflicts or career decisions.",
    pullquote:
      'The brain under stress is doing exactly what it evolved to do. But move fast was built for physical threats.',
    source_author: 'Amy Arnsten (Yale Neuroscience)',
    source_url: '',
    source_type: 'paper',
    themes: ['stress', 'decision-making', 'emotions', 'nervous-system', 'mindfulness'],
    emotional_states: ['stressed', 'overwhelmed', 'reactive', 'panicking', 'anxious'],
    cognitive_patterns: ['catastrophising', 'all-or-nothing', 'emotional-reasoning'],
    enneagram_resonance: [1, 6, 8, 2],
    cognitive_style: ['analytical', 'evidence-based'],
    values: ['clarity', 'composure', 'self-awareness'],
    depth: 'entry',
  },

  {
    id: 'ns_creativity_rest',
    title: 'Rest Is Not the Absence of Work — It Is Where Insight Happens',
    short:
      "Neuroscience has overturned the idea that we solve problems by thinking harder. Studies on the default mode network show that when we let the mind wander — in the shower, on walks, during unstructured time — the brain makes connections between disparate regions that focused attention actively suppresses. The greatest leaps in understanding rarely happen at the desk. They happen when you step away from the desk. Rest is not laziness. It is where the non-obvious becomes obvious.",
    pullquote: 'Rest is not the absence of work. It is where insight happens.',
    source_author: 'Rex Jung / Roger Beaty (Creativity Neuroscience)',
    source_url: '',
    source_type: 'paper',
    themes: ['creativity', 'rest', 'insight', 'productivity', 'mind-wandering'],
    emotional_states: ['stuck', 'blocked', 'frustrated', 'overthinking', 'unmotivated'],
    cognitive_patterns: ['over-control', 'perfectionism', 'rumination'],
    enneagram_resonance: [1, 3, 5, 7],
    cognitive_style: ['analytical', 'intuitive'],
    values: ['creativity', 'balance', 'wisdom'],
    depth: 'entry',
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
