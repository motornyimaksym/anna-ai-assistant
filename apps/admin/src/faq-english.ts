export type FaqEnglishCopy = {
  category: string;
  question: string;
  answer: string;
  note?: string;
};

export const faqEnglish: Record<string, FaqEnglishCopy> = {
  booking: {
    category: "Booking",
    question: "How do I book, and when are you available?",
    answer:
      "Getting started is easy: tell me which massage and duration you have in mind 😊 I’ll check my calendar and suggest available times. We’ll agree on the format before confirming your appointment. If you’d like to change your choice, please let me know in advance. I love preparing for our time together so you can have my full attention 🤍 I usually leave 30 minutes between sessions, take a 1–3 hour break after three clients in a row, and allow at least an hour between two long 2–2.5 hour massages. So even a small opening in the calendar may not always work for an appointment.",
  },
  services: {
    category: "Massage styles",
    question: "What massage styles can I choose from?",
    answer:
      "Let’s find the kind of rest that feels right for you! 🌿 Relax massage is gentle and calming, for when you want to exhale and unwind. Wellness massage works with the whole body and muscle tension, with extra attention to an area you choose. My clothed signature sensual massage, available for a first visit, combines a full-body massage with lingam massage elements toward the end. Lingam massage isn’t part of relax or wellness sessions.\n\nFor your first visit, tell me what you’re looking for: deep relaxation or more focused muscle work. For a full-body session, I often recommend 90 minutes 😊 Four-hands sessions and couples’ requests are arranged with me personally.",
  },
  prices: {
    category: "Prices",
    question: "How much do sessions cost, and how long are they?",
    answer:
      "Let’s choose a style and set aside a little time just for you 💛 The current base prices from my service list are below. We’ll talk through eligibility and any additional charges together. Before booking, I’ll confirm the price for your particular session so everything is clear.",
    note: "Hotel visits, appointments after 9 pm, and appointments on a day I’ve marked as a day off may include an additional charge. I’ll confirm the full price and terms before booking.",
  },
  location: {
    category: "Location",
    question: "Where will we meet?",
    answer:
      "My private practice space is on General Yunakiv Street in Lviv — a welcoming place for one-to-one sessions, not a salon 🏡 Once your booking is confirmed, I’ll send the exact address and entry instructions. If you’ve already arrived, message or call and I’ll help you find your way 😊 Only residents can park in the courtyard, so I recommend parking nearby.",
  },
  premium: {
    category: "Massage styles",
    question:
      "Special experiences: what can we explore once we know each other well?",
    answer:
      "Some experiences are lovelier with a little mystery ✨ My signature massage in lingerie, body massage and private SPA ritual are special offerings for clients I already know well. Their beauty is in the personal attention, unhurried pace and trust we build together. I like to save the finer details for an in-person conversation: you can ask me more at our first meeting 🤍\n\nThese experiences aren’t available on a first visit, and one completed session doesn’t automatically make them available. I want us to get to know each other, feel comfortable, and make sure my rules and boundaries are understood and respected. We discuss availability personally, once our acquaintance has grown into real mutual trust.\n\nRespect for me, my decisions and my boundaries is essential at every meeting. No touch is permitted by default: my consent is required, and every “no” is accepted immediately, without pressure or negotiation. During the lingerie format, touching my breasts or intimate area isn’t allowed; during body massage and SPA, touching the intimate area isn’t allowed. We’ll talk through any other boundaries before the session. These special formats follow my rules and do not include sexual services.\n\nIf you’re curious about what we might discover over time, let’s start with a massage available to first-time clients 🌿 We can meet, you can experience my approach and ask anything you like. We’ll leave a little anticipation for a personal conversation… 😊",
  },
  payment: {
    category: "Booking",
    question: "When do I pay the remaining balance?",
    answer:
      "We’ll agree on a payment method that’s convenient for you 😊 Any deposit is counted toward the full session price, not added on top: it’s UAH 500 for a first visit at my studio and UAH 1,000 for a hotel visit. We’ll confirm the balance and any agreed additional charges before we meet. I love having the practical details settled so we can both relax into the session 🌿",
  },
  out_of_scope: {
    category: "Comfort & boundaries",
    question: "Do you offer sexual services or anything outside the massage?",
    answer:
      "I don’t offer sexual services. Each session stays within the massage format we agreed on; sexual acts aren’t part of it. If anything is unclear, feel free to ask before booking 😊 I’ll explain everything calmly. Clear expectations and mutual respect help us both feel comfortable 🤍",
  },
  boundaries: {
    category: "Comfort & boundaries",
    question: "What are your rules about touch and consent?",
    answer:
      "A lovely atmosphere starts with mutual consent 🤍 Boundaries depend on the format, and we’ll talk them through beforehand. I wear clothes during relax and wellness massages, and clients may not touch me. I also wear clothes for my signature sensual massage; touch is allowed only with my consent, except on my breasts. My colleague and I remain clothed during a four-hands massage, and clients may not touch either practitioner. Lingam massage is included only when you explicitly choose that format. Please ask anything you’re unsure about — clear, comfortable agreements matter to us both 😊",
  },
  orgasm: {
    category: "Comfort & boundaries",
    question: "Is orgasm guaranteed during a sensual session?",
    answer:
      "Bodies respond differently. Orgasm may happen, but I can’t promise it and it isn’t the goal. Your comfort, consent and time to simply notice how you feel matter most 🤍 There’s no test to pass or required result — just room to be yourself and say what feels right 🌿",
  },
  reschedule: {
    category: "Booking",
    question: "What if I need to reschedule or cancel?",
    answer:
      "Plans can change — please message me as soon as you know 😊 For a reschedule, we’ll find another time based on current availability. If you need to cancel, please let me know as early as possible too. Deposit return terms are agreed individually; there isn’t one universal refund rule. I prepare for each guest and appreciate us looking after each other’s time 🤍",
  },
  prep: {
    category: "Comfort & boundaries",
    question: "How should I prepare? Is there a shower and towel?",
    answer:
      "No special preparations needed — I have everything ready here 🌿 Please shower before your session for hygiene. My studio has a shower, a fresh towel, disposable sponges and clean sheets; you can rinse off the massage oil afterward. You don’t need to bring anything from home — just leave yourself a little time to unwind 😊",
  },
  outcall: {
    category: "Location",
    question: "Can you come to my hotel?",
    answer:
      "We can discuss a hotel visit 😊 The travel surcharge is UAH 2,000, with a UAH 1,000 deposit credited toward the price. Before booking, I’ll confirm the current total, format and whether a visit is possible. I haven’t confirmed visits to private homes. We’ll agree on everything in advance so our meeting feels easy and unhurried 🤍",
  },
  fourhands: {
    category: "Massage styles",
    question: "Do you offer four-hands massage?",
    answer:
      "I sometimes practise a classic or signature massage together with a colleague 🙌 Two practitioners combine their techniques in one session. We stay clothed, and clients may not touch us. Availability, format, price and timing are arranged with me personally — message me ahead of time and we’ll talk through your idea 😊",
  },
  deposit: {
    category: "Booking",
    question: "Why is there a UAH 500 booking deposit?",
    answer:
      "For a new guest, a UAH 500 deposit confirms the time we’ve chosen 🤍 It’s part of the price, not an extra charge: I deduct it from your session total when we meet. Please send me a payment confirmation and I’ll confirm our plans. Then you can look forward to our time together 😊",
  },
  couple: {
    category: "Massage styles",
    question: "Can we come for a massage as a couple?",
    answer:
      "Would you like to set aside some time to unwind together? Tell me what you have in mind 💛 A separate couples’ massage isn’t currently listed among the bookable services. We’ll need to agree personally on whether a couples’ session is possible, along with its format, price and timing. That way I can confirm the right details for your visit 😊",
  },
  medical: {
    category: "Comfort & boundaries",
    question: "Does massage replace medical care?",
    answer:
      "No. Massage doesn’t replace advice or care from a medical professional. If you have pain or symptoms that concern you, please consult a doctor first. Your wellbeing matters to me 🤍 We can always talk calmly about which massage format feels right for you.",
  },
  late: {
    category: "Booking",
    question: "Can we meet after 9 pm or on a day off?",
    answer:
      "Sometimes I can make that work if I’m available and happy to receive you 😊 After 9 pm or on a day I’ve marked as a day off in my schedule, there’s a UAH 2,000 surcharge on the massage. Saturday and Sunday aren’t automatically days off. Tell me the time you have in mind and I’ll check availability and confirm the full price before we meet 🤍",
  },
  learning: {
    category: "Massage styles",
    question: "Do you offer massage training?",
    answer:
      "Yes, I offer one-to-one training in classic massage 🙌 I also teach lingam massage to women. We’ll discuss the current format, availability, programme and price personally. Tell me what you’d like to learn — I’d love to hear about your goals 😊",
  },
  clients: {
    category: "Comfort & boundaries",
    question: "Do you welcome both women and men?",
    answer:
      "Yes, I welcome both women and men 💛 Which massage styles are available depends on the service and its terms. Tell me what kind of rest you’re looking for and I’ll help you find a suitable option and explain the details. It’s lovely to have a little anticipation before we meet 😊",
  },
  discounts: {
    category: "Prices",
    question: "Do you offer a discount to military personnel?",
    answer:
      "Yes — if you serve in the military, please ask me about a discount 💛 I may offer 20% off relax or wellness massage. We’ll confirm it before booking and agree on your session total. I’d be glad to give you some time to rest 🌿",
  },
  gift: {
    category: "Booking",
    question: "Can I give someone a massage as a gift?",
    answer:
      "Yes, I can prepare an electronic gift certificate 🎁 It can include the recipient’s name, or be left without one — whichever you prefer. Tell me who you’d like to treat and we’ll arrange the details. It’s lovely when care comes in such a thoughtful form 💛",
  },
};
