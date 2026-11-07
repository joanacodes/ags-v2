/**
 * The brand kit as first written, from the launch plan of 28 October 2026. Every agent reads the kit
 * first. The owner edits it in Settings → Brand kit; saving there writes a new version to the database,
 * which wins over this one. This text is version 1 and the fallback when the database has none.
 */
export const DEFAULT_KIT_YAML = String.raw`# The Astro Study — brand kit.
# Every agent reads this first. Saving it in Settings makes a new version; every card records the
# version it was written under. Times are Paris time.

brand:
  name: The Astro Study
  site: astrostudy.co.uk
  owner: Joana
  signature:
    en: Joana from The Astro Study
    fr: Joana, de The Astro Study
  line:
    en: Astrology, tested first.
    fr: L’astrologie, testée d’abord.
  about:
    en: Birth chart and synastry readings by someone who came to astrology to mock it, tested it, and kept what held.
    fr: Des lectures de thème natal et de synastrie par quelqu’un qui est venue à l’astrologie pour s’en moquer, l’a testée, et a gardé ce qui tenait.
  audience: >-
    Adults, 25 to 45, mostly women, who like astrology and distrust horoscopes. They want plain words
    about themselves and the people they love, without fear and without being told what will happen.
    English first (UK, US, Canada, Australia); French second.
  bio:
    en:
      - Birth chart & synastry readings
      - I tested astrology before trusting it
      - "Free blind test: can you recognise your own chart?"
    fr:
      - Thème natal et synastrie
      - J’ai testé l’astrologie avant d’y croire
      - "Test gratuit à l’aveugle : reconnaîtrez-vous votre thème ?"

voice:
  both:
    - Plain words, short sentences, no hype.
    - No emoji in the body of anything.
    - Never "the universe", never "the stars say".
    - Tendencies, not fate. Soft words, clear meaning. The reader stays in charge.
    - Nothing invented. Every figure comes from a card's figures, with its source.
    - Speak to one person. One idea per piece.
    - "The sceptic's stance is the brand: we test before we trust, and say what didn't hold."
  en:
    - British spelling (recognise, colour, behaviour).
    - Contractions are fine; slang is not.
  fr:
    - Vouvoiement toujours (vous), jamais de tutoiement.
    - "Écrit en français, jamais traduit de l’anglais. Typographie française (espace avant : ; ? ! et guillemets « »)."
    - Phrases courtes, mots simples.

no_go:
  - health, illness, diagnosis or treatment
  - death or dying
  - pregnancy or fertility
  - legal advice or legal outcomes
  - money advice, investments or gambling
  - anything about children, or readings for or about anyone under 18
  - predictions about the reader ("you will", "this week you'll")
  - fear, threats, doom, curses, karma as punishment
  - naming or mocking other astrologers

pillars:
  - id: test
    share: 40
    name: The test
    what: The blind mechanic, results, the monthly figures, reactions (anonymous).
    example: "Three descriptions. One was written from my chart. 7 in 10 people pick theirs. Can you?"
  - id: placements
    share: 40
    name: Placements in plain words
    what: One placement, one dynamic, no jargon. Saturn, Chiron and Lilith are the signature.
    example: "If you were the responsible one at nine years old, this is probably why."
  - id: tested
    share: 15
    name: Tested first
    what: The sceptic's stance, what held and what didn't, the Barnum effect, honest takes on the industry.
    example: "I rated my own chart like an invoice. A third of it held. Here's which third."
  - id: sky
    share: 5
    name: The sky this week, by house
    what: Transits as they land in a house, never sun-sign horoscopes.
    example: "Mars enters your 7th house this week if… here's how to tell which house."

# Which language goes where (the launch plan's decision 2: English first on video, one language per
# account feed; French on Threads and Facebook, cross-posted to Bluesky and Mastodon, and on French
# Pinterest boards).
languages:
  en: [tiktok, instagram, youtube, pinterest, threads, bluesky, x, mastodon, facebook, substack, medium]
  fr: [threads, facebook, bluesky, mastodon, pinterest]

platforms:
  tiktok:
    formats: [video]
    by_hand: true
    src: tt
    slots: ["07:30", "18:30"]
    max_per_day: 2
    cta: { en: Link in bio, fr: Lien dans la bio }
    caption: { max: 2200, lead_max: 150, hashtags: [3, 5] }
  instagram:
    formats: [video, carousel, story]
    src: ig
    slots: { video: ["07:30", "18:30"], carousel: ["13:00"], story: ["12:00"] }
    max_per_day: 4
    cta: { en: comment TEST, fr: commentez TEST }
    caption: { max: 2200, hashtags: [3, 5] }
  facebook:
    formats: [video, text]
    src: fb
    slots: { video: ["18:30"], text: ["10:00"] }
    max_per_day: 2
    per_week: { text: 3, video: 1 }
    cta: { en: comment TEST, fr: commentez TEST }
    caption: { max: 2000, hashtags: [0, 2] }
  youtube:
    formats: [video, long_video]
    src: yt
    slots: ["07:30", "18:30"]
    max_per_day: 6
    title: { max: 100 }
    caption: { max: 4500, hashtags: [0, 3] }
  pinterest:
    formats: [pin]
    src: pin
    slots: ["09:00", "11:30", "14:00", "17:30", "21:00"]
    max_per_day: 5
    title: { max: 100 }
    caption: { max: 500, hashtags: [0, 0] }
    boards:
      en: [Birth chart basics, Saturn, Chiron, Lilith, Synastry, The Astro Study test, The sky this month]
      fr: [Le thème natal, Saturne, Chiron, Lilith, Synastrie, Le test de The Astro Study, Le ciel du mois]
  threads:
    formats: [text, carousel, video]
    src: th
    slots: ["09:00", "13:00", "20:00"]
    max_per_day: 3
    caption: { max: 500, topic_tags: 1, links: 5 }
  bluesky:
    formats: [text]
    src: bs
    slots: ["09:15", "13:15", "20:15"]
    max_per_day: 3
    caption: { max: 300, hashtags: [1, 2] }
  x:
    formats: [text]
    src: x
    slots: ["09:45", "13:45", "20:45"]
    max_per_day: 3
    caption: { max: 280, hashtags: [0, 1] }
  mastodon:
    formats: [text]
    src: ma
    slots: ["09:30", "13:30", "20:30"]
    max_per_day: 3
    caption: { max: 500, hashtags: [3, 5] }
  substack:
    formats: [issue]
    by_hand: true
    src: sub
    slots: { issue: ["Fri 09:00"] }
    words: [600, 900]
  medium:
    formats: [issue]
    by_hand: true
    src: med
    delay_days: 14
  site:
    formats: [article]
    by_hand: true
    src: site

links:
  test: { en: "https://astrostudy.co.uk/test/", fr: "https://astrostudy.co.uk/fr/test/" }
  unknown_birth_time: { en: "https://astrostudy.co.uk/blog/unknown-birth-time/", fr: "https://astrostudy.co.uk/fr/blog/unknown-birth-time/" }
  disclaimers: { en: "https://astrostudy.co.uk/disclaimers/", fr: "https://astrostudy.co.uk/fr/avertissements/" }
  site: { en: "https://astrostudy.co.uk/", fr: "https://astrostudy.co.uk/fr/" }

# The src tag every link carries, so the Study page counts tests by where they came from.
src_tags:
  tt: TikTok bio and pinned comment
  ig: Instagram bio
  igdm: ManyChat on Instagram
  yt: YouTube descriptions
  pin: Pinterest pins
  th: Threads
  bs: Bluesky
  x: X
  ma: Mastodon
  fb: Facebook and its groups
  sub: Substack
  med: Medium
  readee: the private chart page
  mail: the email sequence
  ad: the paid push

disclosure:
  en: "AI voice, cloned from mine. Every word is mine."
  fr: "Voix de synthèse, clonée à partir de la mienne. Chaque mot est de moi."
  frame_en: AI voice · words by Joana
  frame_fr: Voix de synthèse · texte de Joana

calls_to_action:
  en: [comment TEST, "Take the test: link in bio", Send this to the person whose chart you want next to yours]
  fr: [commentez TEST, "Faites le test : lien dans la bio", Envoyez ceci à la personne dont vous voulez le thème à côté du vôtre]

saved_replies:
  score:
    en: "{n} out of 10 is well above luck (that's 3). The full reading of your chart is on your private page now. If you want my own reading on top, it's in the email."
    fr: "{n} sur 10, c’est bien au-dessus du hasard (qui donne 3). La lecture complète de votre thème vous attend sur votre page privée. Si vous voulez ma propre lecture en plus, elle est dans l’e-mail."
  no_birth_time:
    en: "You still have most of your chart without it: here's where to find your time, country by country."
    fr: "Vous avez déjà l’essentiel de votre thème sans elle : voici où retrouver votre heure de naissance, pays par pays."
  it_was_wrong:
    en: "That's useful to me: one in three descriptions misses, and the misses are what I publish. Which part was off?"
    fr: "C’est précieux pour moi : une description sur trois rate, et ce sont les ratés que je publie. Qu’est-ce qui ne collait pas ?"
  sceptic:
    en: "So was I. That's why the test exists: take it, and tell me your score."
    fr: "Moi aussi. C’est pour ça que le test existe : faites-le, et dites-moi votre score."

adults_only:
  en: "Thank you for writing. The test and the readings are for adults only, so I can't offer you one. Take care."
  fr: "Merci pour votre message. Le test et les lectures sont réservés aux adultes, je ne peux donc pas vous en proposer. Prenez soin de vous."

help_lines:
  en: "If things are hard right now, please talk to someone today. Samaritans: 116 123 (UK and Ireland), free, day and night. In the US and Canada, call or text 988."
  fr: "Si les choses sont difficiles en ce moment, parlez-en à quelqu’un dès aujourd’hui. En France, le 3114, gratuit, jour et nuit. En Belgique, le 0800 32 123 ; en Suisse, le 143."

banned_extras:
  en: ["the universe", "manifest", "destiny", "doomed", "curse", "karmic debt", "soulmate guaranteed"]
  fr: ["l’univers", "manifester", "destin", "maudit", "malédiction", "dette karmique", "âme sœur garantie"]

tags:
  instagram:
    en: ["#astrology", "#birthchart", "#natalchart", "#astrologytest", "#saturn", "#chiron", "#lilith", "#synastry"]
    fr: ["#astrologie", "#thèmenatal", "#thèmeastral", "#testastro", "#saturne", "#chiron", "#lilith", "#synastrie"]
  threads:
    en: [Astrology]
    fr: [Astrologie]
  bluesky:
    en: ["#astrology", "#birthchart"]
    fr: ["#astrologie", "#thèmenatal"]
  mastodon:
    en: ["#Astrology", "#BirthChart", "#Synastry", "#Saturn", "#Chiron"]
    fr: ["#Astrologie", "#ThèmeNatal", "#Synastrie", "#Saturne", "#Chiron"]
  tiktok:
    en: ["#astrology", "#birthchart", "#astrologytok", "#saturnreturn", "#chiron"]
  youtube:
    en: ["#astrology", "#birthchart", "#shorts"]
  x:
    en: ["#astrology"]

hooks:
  en:
    - { text: "Three descriptions. One was written from my chart. Can you tell which?", pillar: test }
    - { text: "I rated my own birth chart like an invoice. A third of it held.", pillar: tested }
    - { text: "If you were the responsible one at nine years old, this is probably why.", pillar: placements }
    - { text: "The placement people apologise for, and shouldn't.", pillar: placements }
    - { text: "Your chart doesn't say what will happen. It says what you do when it does.", pillar: tested }
    - { text: "7 out of 10 people recognised their own chart this week. Luck gets 3.", pillar: test }
    - { text: "I don't write sun-sign horoscopes. Here's what I do instead.", pillar: tested }
    - { text: "Astrology is fake, and so was I about it. Then I tested it.", pillar: tested }
    - { text: "What hurts you, and how you heal: the placement I read first.", pillar: placements }
    - { text: "Your Moon is why you say \"I'm fine\".", pillar: placements }
    - { text: "No birth time? You still have most of your chart. Here's what you lose.", pillar: placements }
    - { text: "Two charts in a relationship don't \"match\". They do something more useful.", pillar: placements }
    - { text: "I give the full reading away free. Here's why that isn't stupid.", pillar: test }
    - { text: "Every horoscope fits you. That's the problem, and the test is the fix.", pillar: tested }
    - { text: "Mars enters your 7th house this week, if you know your houses. Here's how to find yours.", pillar: sky }
    - { text: "Your Saturn is not your punishment.", pillar: placements }
    - { text: "What my data says about people with this placement (and how many I've seen).", pillar: test }
    - { text: "Send this to the person whose chart you want next to yours.", pillar: placements }
    - { text: "Mercury and Venus both turn direct this weekend. What that is, and isn't.", pillar: sky }
    - { text: "Day 12 of publishing my own test's results, misses included.", pillar: test }
  fr:
    - { text: "Trois descriptions. L’une a été écrite à partir de mon thème. Saurez-vous dire laquelle ?", pillar: test }
    - { text: "J’ai vérifié mon thème natal comme une facture. Un tiers a tenu.", pillar: tested }
    - { text: "Si vous étiez l’enfant responsable à neuf ans, voici sans doute pourquoi.", pillar: placements }
    - { text: "Le placement dont on s’excuse, et qu’on ne devrait pas.", pillar: placements }
    - { text: "Votre thème ne dit pas ce qui va arriver. Il dit ce que vous faites quand ça arrive.", pillar: tested }
    - { text: "7 personnes sur 10 ont reconnu leur thème cette semaine. Le hasard en donne 3.", pillar: test }
    - { text: "Je n’écris pas d’horoscopes par signe. Voici ce que je fais à la place.", pillar: tested }
    - { text: "L’astrologie, c’est du vent ? Je le pensais aussi. Puis je l’ai testée.", pillar: tested }
    - { text: "Ce qui vous blesse, et comment vous guérissez : le placement que je lis en premier.", pillar: placements }
    - { text: "Votre Lune, c’est la raison pour laquelle vous dites « ça va ».", pillar: placements }
    - { text: "Pas d’heure de naissance ? Vous avez déjà l’essentiel de votre thème. Voici ce qui manque.", pillar: placements }
    - { text: "Deux thèmes dans un couple ne « collent » pas. Ils font quelque chose de plus utile.", pillar: placements }
    - { text: "J’offre la lecture complète. Voici pourquoi ce n’est pas une bêtise.", pillar: test }
    - { text: "Tous les horoscopes vous ressemblent. C’est bien le problème, et le test le règle.", pillar: tested }
    - { text: "Mars entre dans votre maison 7 cette semaine, si vous connaissez vos maisons. Voici comment trouver la vôtre.", pillar: sky }
    - { text: "Votre Saturne n’est pas une punition.", pillar: placements }
    - { text: "Ce que mes données disent des personnes qui ont ce placement (et combien j’en ai vu).", pillar: test }
    - { text: "Envoyez ceci à la personne dont vous voulez le thème à côté du vôtre.", pillar: placements }
    - { text: "Mercure et Vénus repartent en marche directe ce week-end. Ce que c’est, et ce que ce n’est pas.", pillar: sky }
    - { text: "Jour 12 : je publie les résultats de mon propre test, ratés compris.", pillar: test }

# Three good and three bad examples per format, per language. The writers read the ones for their
# card's formats; the bad ones say what is wrong with them.
examples:
  video:
    en:
      good:
        - "Birth chart, Saturn, and the nine-year-old who did the grown-up's job. Saturn's house shows where duty arrived early. It's a strength that took longer to learn, not a punishment. In my blind test, people recognise this one more than most. Comment TEST and see if you'd pick yours."
        - "My birth chart, blind: three descriptions of the same part of a life. One was written from my chart, two from strangers'. I picked mine 7 times out of 10. Luck gets 3. The test is free, it's blind, and it works the same for you. Comment TEST."
        - "Birth chart with no birth time? You still have the Sun, the Moon most days, and every planet's sign. You lose the houses and the rising sign. Here's how to find your time, country by country. Comment TEST for the test that works without it."
      bad:
        - text: "The universe is about to shift everything for Scorpios this week!! ✨🔮 Big changes are coming, don't miss out!!!"
          why: "The universe, a prediction, a sun sign, emoji, hype, no keyword in the first five words."
        - text: "Saturn transiting your natal Moon in a square can bring depression; protect your mental health."
          why: "Jargon in plain sight, health, fear."
        - text: "92% of people say my readings changed their life."
          why: "An invented figure with no source."
    fr:
      good:
        - "Votre thème natal, Saturne, et l’enfant de neuf ans qui faisait le travail d’un adulte. La maison de Saturne montre où le devoir est arrivé tôt. C’est une force apprise plus lentement, pas une punition. Dans mon test à l’aveugle, on la reconnaît plus que les autres. Commentez TEST."
        - "Mon thème natal, à l’aveugle : trois descriptions de la même partie d’une vie. L’une écrite à partir de mon thème, deux à partir de thèmes inconnus. J’ai trouvé la mienne 7 fois sur 10. Le hasard en donne 3. Le test est gratuit. Commentez TEST."
        - "Thème natal sans heure de naissance ? Vous avez le Soleil, presque toujours la Lune, et le signe de chaque planète. Vous perdez seulement les maisons et l’ascendant. Voici où retrouver votre heure, pays par pays. Et le test marche sans elle : commentez TEST."
      bad:
        - text: "L’univers va tout bouleverser pour les Scorpions cette semaine !! ✨🔮"
          why: "L’univers, une prédiction, un signe solaire, des emoji, de l’emphase."
        - text: "Tu vas enfin rencontrer l’amour grâce à Vénus !"
          why: "Tutoiement, prédiction, promesse."
        - text: "9 personnes sur 10 disent que mes lectures ont changé leur vie."
          why: "Chiffre inventé, sans source."
  carousel:
    en:
      good:
        - "1: Your Saturn is not your punishment. 2: Saturn's house is where duty arrived early. 3: In the 4th: the one who kept the house running. 4: In the 10th: the one who had to be good at everything. 5: It's a strength that took longer to learn. 6: In my blind test, people recognise their Saturn more than most placements. 7: Comment TEST."
        - "1: I rated my chart like an invoice. 2: A tick or a cross beside every placement. 3: The Moon: tick. 4: The Ascendant: cross. 5: Saturn: tick, and it stung. 6: A third held. That's what I read now. 7: Take the blind test: comment TEST."
        - "1: No birth time? 2: You keep every planet's sign. 3: You keep the Moon, most days. 4: You lose the houses and the rising sign. 5: Your time is often on the long-form certificate. 6: The test works without it. 7: Comment TEST."
      bad:
        - text: "1: Your 2026 horoscope for every sign! 2: Aries: big money coming…"
          why: "Sun-sign horoscopes, predictions, money."
        - text: "One slide of 80 words explaining aspects, orbs and rulerships."
          why: "Over 20 words a slide, jargon, teaches too much."
        - text: "Slides with no source on the figure '8 in 10 people'."
          why: "A figure without its source."
    fr:
      good:
        - "1 : Votre Saturne n’est pas une punition. 2 : Sa maison montre où le devoir est arrivé tôt. 3 : En maison 4 : celle qui faisait tourner la maison. 4 : En maison 10 : celle qui devait tout réussir. 5 : Une force apprise plus lentement. 6 : Dans mon test, on reconnaît Saturne plus que le reste. 7 : Commentez TEST."
        - "1 : J’ai vérifié mon thème comme une facture. 2 : Une coche ou une croix par placement. 3 : La Lune : coche. 4 : L’ascendant : croix. 5 : Saturne : coche, et ça pique. 6 : Un tiers a tenu. 7 : Faites le test : commentez TEST."
        - "1 : Pas d’heure de naissance ? 2 : Vous gardez le signe de chaque planète. 3 : Presque toujours la Lune. 4 : Vous perdez les maisons et l’ascendant. 5 : L’heure figure souvent sur l’acte intégral. 6 : Le test marche sans elle. 7 : Commentez TEST."
      bad:
        - text: "1 : Votre horoscope 2026 pour chaque signe !"
          why: "Horoscope par signe, prédictions."
        - text: "Une diapositive de 80 mots sur les aspects et les orbes."
          why: "Plus de 20 mots, du jargon."
        - text: "« 8 personnes sur 10 » sans source."
          why: "Chiffre sans source."
  text:
    en:
      good:
        - "Every horoscope fits you. That's the problem. So I built a test that doesn't hand you yours: three descriptions, one from your chart, and you pick."
        - "Your Saturn is not your punishment. It's where you learnt a thing early, the hard way, and kept it."
        - "This week's misses: people recognised the Moon descriptions less than the Saturn ones. I publish the misses too."
      bad:
        - text: "Mercury retrograde is ruining everyone's week, protect your energy!! 🔮"
          why: "Fear, emoji, hype."
        - text: "Click here to book a reading now, 50% off!"
          why: "Selling in the post, a discount, no idea in it."
        - text: "A Threads post pasted unchanged to X at 460 characters."
          why: "Cut from another network, over X's 280."
    fr:
      good:
        - "Tous les horoscopes vous ressemblent. C’est bien le problème. Alors j’ai fait un test qui ne vous tend pas le vôtre : trois descriptions, une seule tirée de votre thème, et vous choisissez."
        - "Votre Saturne n’est pas une punition. C’est là où vous avez appris quelque chose tôt, à la dure, et l’avez gardé."
        - "Les ratés de la semaine : on reconnaît moins les descriptions de la Lune que celles de Saturne. Je publie aussi les ratés."
      bad:
        - text: "Mercure rétrograde gâche ta semaine, protège ton énergie !! 🔮"
          why: "Tutoiement, peur, emoji."
        - text: "Réservez vite, -50 % aujourd’hui !"
          why: "Vente dans le post, remise."
        - text: "Un texte traduit mot à mot de l’anglais."
          why: "Traduit, jamais écrit en français."
  pin:
    en:
      good:
        - "Title: Saturn in the birth chart, explained in plain words. Description: What Saturn's house says about where duty arrived early, without fear or jargon. Saturn in the birth chart is a strength learnt slowly; take the free blind test to see if you recognise yours."
        - "Title: Birth chart without a birth time: what you keep. Description: No birth time? A birth chart without it keeps every planet's sign and usually the Moon. Here's what you lose, and where to find your time."
        - "Title: Chiron in the birth chart: what hurts and how you heal. Description: Chiron in the birth chart, read in plain words: the old wound, the way it teaches. A gentle guide from someone who tested astrology first."
      bad:
        - text: "Title: ✨ASTROLOGY✨ Description: #astrology #zodiac #horoscope"
          why: "No keyword, emoji, hashtags (none on Pinterest)."
        - text: "Title: Read this! Description: You won't believe it."
          why: "Clickbait, no keyword."
        - text: "A 700-character description."
          why: "Over 500."
    fr:
      good:
        - "Titre : Saturne dans le thème natal, en mots simples. Description : Ce que la maison de Saturne dit de l’endroit où le devoir est arrivé tôt, sans peur ni jargon. Saturne dans le thème natal est une force apprise lentement ; faites le test gratuit pour voir si vous reconnaissez la vôtre."
        - "Titre : Un thème natal sans heure de naissance : ce que vous gardez. Description : Sans heure de naissance, votre thème natal garde le signe de chaque planète et le plus souvent la Lune. Voici ce qui manque, et où retrouver l’heure."
        - "Titre : Chiron dans le thème natal : la blessure et la guérison. Description : Chiron dans le thème natal, en mots simples : la vieille blessure, et ce qu’elle apprend."
      bad:
        - text: "Titre : ✨ASTRO✨"
          why: "Pas de mot-clé, des emoji."
        - text: "Titre : Lisez ça ! Description : incroyable."
          why: "Racoleur, sans mot-clé."
        - text: "Une description de 700 caractères."
          why: "Plus de 500."
  story:
    en:
      good:
        - "Reply TEST and I'll send you the blind test. Three descriptions, one is you."
        - "This week, 7 in 10 recognised their chart. Reply TEST to try."
      bad:
        - text: "Vote in the poll to get the link!"
          why: "A poll vote can't open a DM; a written reply can."
        - text: "Swipe up for 20% off readings"
          why: "Selling, discount."
    fr:
      good:
        - "Répondez TEST et je vous envoie le test à l’aveugle. Trois descriptions, l’une c’est vous."
        - "Cette semaine, 7 sur 10 ont reconnu leur thème. Répondez TEST pour essayer."
      bad:
        - text: "Votez dans le sondage pour recevoir le lien !"
          why: "Un vote ne peut pas ouvrir de DM ; une réponse écrite, si."
        - text: "-20 % sur les lectures"
          why: "Vente, remise."
  issue:
    en:
      good:
        - "Study notes, week 46. One figure: 7 in 10 recognised their Saturn description (the Study page, week 46). One placement: Chiron, in plain words. One reader question: what if my birth time is a guess? The test, and The three that held."
      bad:
        - text: "Ten predictions for 2027, sign by sign."
          why: "Predictions, sun signs, no figure, no reader question."
    fr:
      good:
        - "Notes d’étude, semaine 46. Un chiffre : 7 sur 10 ont reconnu leur description de Saturne (page Study, semaine 46). Un placement : Chiron, en mots simples. Une question de lectrice : et si mon heure de naissance est approximative ? Le test, et Les trois qui ont tenu."
      bad:
        - text: "Dix prédictions pour 2027, signe par signe."
          why: "Prédictions, signes solaires, aucun chiffre."

# The launch calendar (the launch plan's dates). Reminders fire two days before and on the morning.
calendar:
  - { date: "2026-11-02", event: "Warm-up begins", note: "One video a day on TikTok, Reels and Shorts; two text posts a day on Threads; 3 pins a day. No keyword yet." }
  - { date: "2026-11-09", event: "Soft launch week", note: "New Moon in Scorpio at 08:02: the fresh start post." }
  - { date: "2026-11-11", event: "The keyword TEST goes on", note: "The test opens to the existing audience; 20 creator DMs sent." }
  - { date: "2026-11-13", event: "First Study notes issue", note: "Mercury direct at 16:53; two videos a day from Thursday." }
  - { date: "2026-11-16", event: "Launch day", note: "The launch video (your own score, honestly), the broadcast channel, the Threads thread, the Facebook post." }
  - { date: "2026-11-20", event: "Scorecard and issue 2", note: "" }
  - { date: "2026-11-27", event: "Black Friday: the gift offer", note: "A bonus, not a discount: every gift card comes with The three that held for the buyer. Until Monday 30." }
  - { date: "2026-12-01", event: "December gifting posts begin", note: "A reading is the present that's about them." }
  - { date: "2026-12-04", event: "Blind chart calls, evening one", note: "The clips are the week's content." }
  - { date: "2026-12-05", event: "Blind chart calls, evening two", note: "" }
  - { date: "2026-12-11", event: "Issue 4: the first monthly report", note: "The month's real figures from the Study page." }
  - { date: "2026-12-17", event: "Last order for a reading by Christmas", note: "Gift cards run to the 24th." }

# The sky, November–December 2026 (the launch plan's dates, checked against two sources each; the
# ones marked approx have one). The sky table is refreshed from FreeAstroAPI.
sky:
  - { date: "2026-11-09", time: "08:02", kind: lunation, body: Moon, sign: Scorpio, event: "New Moon in Scorpio" }
  - { date: "2026-11-13", time: "16:53", kind: station, body: Mercury, sign: Scorpio, event: "Mercury turns direct" }
  - { date: "2026-11-14", time: "01:27", kind: station, body: Venus, sign: Libra, event: "Venus turns direct in Libra" }
  - { date: "2026-11-22", kind: ingress, body: Sun, sign: Sagittarius, event: "The Sun enters Sagittarius", approx: true }
  - { date: "2026-11-24", time: "15:53", kind: lunation, body: Moon, sign: Gemini, event: "Full Moon in Gemini (a supermoon)" }
  - { date: "2026-11-26", time: "00:38", kind: ingress, body: Mars, sign: Virgo, event: "Mars enters Virgo" }
  - { date: "2026-12-09", time: "01:52", kind: lunation, body: Moon, sign: Sagittarius, event: "New Moon in Sagittarius" }
  - { date: "2026-12-11", time: "00:23", kind: station, body: Saturn, sign: Aries, event: "Saturn turns direct at 7° Aries" }
  - { date: "2026-12-12", time: "23:17", kind: station, body: Neptune, event: "Neptune turns direct" }
  - { date: "2026-12-12", kind: station, body: Jupiter, sign: Leo, event: "Jupiter turns retrograde in Leo", approx: true }
  - { date: "2026-12-24", time: "02:28", kind: lunation, body: Moon, sign: Cancer, event: "Full Moon in Cancer (a supermoon)" }

# The Friday scorecard's weekly targets in month 1, and the keep-or-kill rules (after two weeks of data).
scorecard:
  targets:
    videos: 14
    pins: [25, 35]
    text_posts: 18
    engagements: [1500, 5000]
    keyword_comments_and_dms: [75, 175]
    tests: [225, 350]
    opt_in_rate: 0.40
    email_open_rate: 0.50
    email_click_rate: 0.05
    orders: [8, 12]
    sales_gbp: [500, 900]
    owner_hours_max: 12
  rules:
    cross_post_only: { tests_share_below: 0.02, engagement_share_below: 0.05 }
    repeat_hook: { multiple_of_median: 2, variants: 3 }
    paid_push: { comment_rate_above: 0.01, completion_above: 0.5 }
    rewrite_email: { click_below: 0.01 }
    raise_cap: { cap_days_per_week: 2 }
    pull_product: { weeks_without_sale: 4 }
  paid:
    daily_gbp: 15
    stop_cost_per_test_gbp: 1.5
    stop_after_days: 3
    stop_conversion_below: 0.02

legal:
  en: "Readings are for adults (18+) and are offered for reflection and entertainment. They are not medical, legal, financial or psychological advice, and no outcome is promised."
  fr: "Les lectures s’adressent aux adultes (18 ans et plus) et sont proposées à titre de réflexion et de divertissement. Elles ne remplacent pas un avis médical, juridique, financier ou psychologique, et aucun résultat n’est promis."
`;
