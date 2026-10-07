import { useQuery } from "@tanstack/react-query";
import { publicApi } from "./public-api.js";
import { useEffect, useMemo, useState } from "react";
import { Alert, CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import { faqEnglish } from "./faq-english.js";
import "./Faq.css";

type ThemeMode = "dark" | "light";
const getDeviceTheme = (): ThemeMode =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
const createFaqTheme = (mode: ThemeMode) =>
  createTheme({
    palette: {
      mode,
      primary: { main: mode === "dark" ? "#b8d0ba" : "#42684a" },
      background: {
        default: mode === "dark" ? "#111512" : "#f7f7f2",
        paper: mode === "dark" ? "#1b211d" : "#ffffff",
      },
      text: {
        primary: mode === "dark" ? "#f2f4f0" : "#18211b",
        secondary: mode === "dark" ? "#c2cbc3" : "#4a594d",
      },
    },
    typography: { fontFamily: "Arial, Helvetica, sans-serif" },
  });
const telegram = "http://t.me/Anna_lush_Massage";

type Category = "Формати" | "Ціни" | "Запис" | "Комфорт" | "Локація";
type Locale = "uk" | "en";
type FaqItem = {
  topic: string;
  mentions: number;
  chatMentions: number;
  category: Category;
  question: string;
  answer: string;
  lines?: string[];
  note?: string;
};

const categories: Array<Category | "Усі питання"> = [
  "Усі питання",
  "Формати",
  "Ціни",
  "Запис",
  "Комфорт",
  "Локація",
];

const faq: FaqItem[] = [
  {
    topic: "booking",
    mentions: 1966,
    chatMentions: 495,
    category: "Запис",
    question: "Як записатися й коли є вільний час?",
    answer:
      "Перший крок дуже простий: напишіть мені, який масаж і тривалість вас цікавлять 😊 Перевірю календар і погодимо вільний час та формат до підтвердження запису. Якщо захочете змінити масаж, домовмося про це заздалегідь. Люблю готуватися до наших зустрічей — щоб уся увага була для вас 🤍 Між сеансами зазвичай залишаю 30 хвилин; після трьох гостей поспіль — перерву 1–3 години. Між двома довгими масажами на 2–2,5 години потрібна щонайменше година відпочинку. Тому навіть невелике віконце в календарі не завжди доступне для запису.",
  },
  {
    topic: "services",
    mentions: 889,
    chatMentions: 485,
    category: "Формати",
    question: "Які масажі можна обрати й чим вони відрізняються?",
    answer:
      "Давайте знайдемо саме ваш ритм відпочинку! 🌿 Релакс — м’який і спокійний масаж, коли хочеться видихнути. Оздоровчий — робота з усім тілом і м’язовим напруженням; можемо приділити більше уваги окремій зоні. Авторський чуттєвий масаж у одязі, доступний для першої зустрічі, поєднує масаж усього тіла з елементами лінгам-масажу наприкінці. У релакс та оздоровчий масаж лінгам не входить.\n\nДля першої зустрічі розкажіть, чого очікуєте: розслаблення чи глибшої роботи з м’язами. Для всього тіла часто раджу 90 хвилин 😊 Масаж у чотири руки та запит для пари погоджуємо особисто.",
  },
  {
    topic: "prices",
    mentions: 745,
    chatMentions: 438,
    category: "Ціни",
    question: "Які ціни та тривалість сеансів?",
    answer:
      "Обираємо формат і час, який ви готові подарувати собі 💛 Нижче — актуальні базові ціни з мого переліку послуг. Оберіть свій ритм відпочинку, а умови доступу й можливі доплати погодимо разом. Перед записом я підтверджу актуальну вартість саме вашого сеансу, щоб усі домовленості були зрозумілими.",
    note: "Виїзд, прийом після 21:00 або в позначений вихідний можуть мати окремі доплати. Повну суму й умови підтверджуємо до запису.",
  },
  {
    topic: "location",
    mentions: 431,
    chatMentions: 277,
    category: "Локація",
    question: "Де проходять наші зустрічі?",
    answer:
      "Мій простір для зустрічей — на вулиці генерала Юнаківа у Львові, це затишне місце індивідуальної практики, не салон 🏡 Після підтвердження запису надішлю точну адресу та інструкції входу. Якщо вже приїхали, напишіть або зателефонуйте: допоможу зорієнтуватися 😊 У дворі паркуються лише мешканці, тож автомобіль краще залишити поруч.",
  },
  {
    topic: "premium",
    mentions: 303,
    chatMentions: 189,
    category: "Формати",
    question: "Особливі формати: що відкривається, коли ми вже добре знайомі?",
    answer:
      "Є зустрічі, які хочеться залишити трохи загадковими ✨ Авторський масаж у білизні, боді-масаж та SPA-ритуал — моя особлива колекція форматів для клієнтів, яких я вже добре знаю. Тут цінність у персональній увазі, спокійному ритмі й довірі, що народжується між нами. Деталі не поспішаю розкривати в переписці: про них можна дізнатися більше під час нашої першої зустрічі 🤍\n\nЦі послуги недоступні для першого візиту. І навіть одна проведена зустріч не означає автоматичного доступу: мені важливо добре познайомитися з вами, відчути взаємний комфорт і переконатися, що мої правила та кордони зрозумілі й прийняті. Можливість особливого формату погоджуємо особисто, коли наше знайомство вже має свою історію та взаємну довіру.\n\nПовага до мене, моїх рішень і меж — обов’язкова умова кожної зустрічі. Жодні дотики не дозволені за замовчуванням: потрібна моя згода, а будь-яке «ні» приймається одразу, без тиску й торгу. У форматі в білизні дотики до грудей та інтимної зони заборонені; у боді та SPA — до інтимної зони. Усі інші межі й деталі проговорюємо до сеансу. Особливий формат не змінює моїх правил і не передбачає сексуальних послуг.\n\nЯкщо вам цікаво відкрити цю сторінку знайомства, почнімо красиво: оберіть масаж із доступних для першого візиту 🌿 Познайомимося, ви відчуєте мій підхід і зможете спокійно поставити свої запитання. А частину приємного передчуття залишимо для особистої розмови… 😊",
  },
  {
    topic: "payment",
    mentions: 197,
    chatMentions: 120,
    category: "Запис",
    question: "Коли оплачувати сеанс і решту суми?",
    answer:
      "Спосіб оплати погодимо особисто — оберемо зручний для вас 😊 Передплата зараховується у повну вартість сеансу, а не додається зверху: за перший візит у кабінет це 500 грн, за виїзд до готелю — 1 000 грн. Решту суми та всі погоджені доплати уточнимо до зустрічі. Люблю, коли практичні питання вирішені й можна спокійно налаштуватися на відпочинок 🌿",
  },
  {
    topic: "out_of_scope",
    mentions: 170,
    chatMentions: 81,
    category: "Комфорт",
    question: "Чи є сексуальні послуги або додаткові дії поза форматом?",
    answer:
      "Сексуальних послуг у мене немає. Сеанс проходить у межах описаного масажного формату; додаткові сексуальні дії до нього не входять. Якщо щось незрозуміло — сміливо запитайте до запису 😊 Я спокійно поясню умови: ясність і повага допомагають нам обом почуватися комфортно 🤍",
  },
  {
    topic: "boundaries",
    mentions: 166,
    chatMentions: 117,
    category: "Комфорт",
    question: "Які правила дотиків і згоди?",
    answer:
      "Найприємніша атмосфера починається з взаємної згоди 🤍 Межі залежать від формату, й ми проговорюємо їх до зустрічі. Під час оздоровчого та релакс-масажу я працюю в одязі, дотики до мене не дозволені. В авторському чуттєвому форматі також працюю в одязі: дотики можливі лише з моєї згоди, крім грудей. У чотири руки ми з колегою одягнені, торкатися майстринь не можна. Лінгам-масаж — лише за вашим прямим вибором. Запитуйте без ніяковості: комфортні домовленості важливі для нас обох 😊",
  },
  {
    topic: "orgasm",
    mentions: 166,
    chatMentions: 109,
    category: "Комфорт",
    question: "Чи гарантований оргазм під час чуттєвого формату?",
    answer:
      "Реакція тіла індивідуальна: оргазм можливий, але його не гарантую й не ставлю за мету. На сеансі важливі ваш комфорт, згода та можливість спокійно відчути себе 🤍 Тут немає іспиту чи обов’язкового результату — можна бути собою та сказати, що вам підходить 🌿",
  },
  {
    topic: "reschedule",
    mentions: 85,
    chatMentions: 69,
    category: "Запис",
    question: "Що робити, якщо потрібно перенести сеанс?",
    answer:
      "Плани іноді змінюються — напишіть мені якомога раніше 😊 Для перенесення підберемо інший час залежно від вільних слотів. Якщо потрібно скасувати зустріч, також попередьте завчасно: умови щодо передплати погоджуємо окремо, єдиного правила повернення немає. Бережімо час одне одного — я готуюся до кожного гостя 🤍",
  },
  {
    topic: "prep",
    mentions: 85,
    chatMentions: 61,
    category: "Комфорт",
    question: "Як підготуватися й чи є душ та рушник?",
    answer:
      "Складних приготувань не потрібно — необхідні речі вже чекають на вас 🌿 Подбайте про душ перед сеансом з міркувань гігієни. У мене є душ, свіжий рушник, одноразові губки й простирадла; після масажу можна змити олію. Брати щось із дому не потрібно — залиште собі час для спокійного відпочинку 😊",
  },
  {
    topic: "outcall",
    mentions: 84,
    chatMentions: 58,
    category: "Локація",
    question: "Чи можна домовитися про виїзд?",
    answer:
      "Можемо обговорити виїзд до готелю 😊 Доплата за виїзд — 2 000 грн, передплата — 1 000 грн із зарахуванням у вартість. Перед записом підтверджу актуальну суму, формат і можливість виїзду. Виїзд до приватного помешкання не підтверджений. Усі деталі погоджуємо завчасно — щоб наша зустріч пройшла легко й без сюрпризів 🤍",
  },
  {
    topic: "fourhands",
    mentions: 60,
    chatMentions: 33,
    category: "Формати",
    question: "Чи є масаж у чотири руки?",
    answer:
      "Я практикую класичний або авторський масаж у чотири руки разом із колегою 🙌 Дві майстрині поєднують свої техніки в одному сеансі. Ми працюємо в одязі; дотики до нас не дозволені. Доступність, програму, ціну й час погоджуємо особисто — напишіть завчасно, із задоволенням обговоримо ваш запит 😊",
  },
  {
    topic: "deposit",
    mentions: 59,
    chatMentions: 41,
    category: "Запис",
    question: "Для чого потрібне бронювання 500 грн?",
    answer:
      "Для нового гостя бронювання 500 грн допомагає остаточно закріпити обраний час 🤍 Це частина оплати, а не додаткова сума: під час зустрічі вона віднімається від ціни сеансу. Після переказу надішліть підтвердження — і я зафіксую нашу домовленість. Тоді можна з приємним передчуттям планувати зустріч 😊",
  },
  {
    topic: "couple",
    mentions: 49,
    chatMentions: 29,
    category: "Формати",
    question: "Чи можна прийти на масаж удвох?",
    answer:
      "Хочете подарувати час для відпочинку одне одному? Напишіть мені про ваш задум 💛 У переписках є приклади сеансів для пари, але зараз окремої послуги парного масажу немає в активному переліку запису. Можливість такого формату, програму, вартість і час потрібно погодити зі мною особисто. Так підберемо реальні умови саме для вашої зустрічі 😊",
  },
  {
    topic: "medical",
    mentions: 17,
    chatMentions: 10,
    category: "Комфорт",
    question: "Чи замінює масаж медичну допомогу?",
    answer:
      "Ні, масаж не замінює консультацію та допомогу медичного фахівця. Якщо маєте біль або симптоми, що вас турбують, спершу зверніться до лікаря. Ваше самопочуття важливе для мене 🤍 Питання про формат сеансу можемо спокійно обговорити до запису.",
  },
  {
    topic: "late",
    mentions: 369,
    chatMentions: 197,
    category: "Запис",
    question: "Чи можна зустрітися після 21:00 або у вихідний?",
    answer:
      "Іноді можу виділити для вас такий час — якщо маю вільне віконце й готова прийняти 😊 Після 21:00 або в день, який я позначила вихідним у своєму графіку, доплата до масажу становить 2 000 грн. Субота й неділя самі по собі не означають вихідний. Напишіть бажаний час — перевіримо можливість і погодимо повну суму до зустрічі 🤍",
  },
  {
    topic: "learning",
    mentions: 155,
    chatMentions: 90,
    category: "Формати",
    question: "Чи можна навчитися масажу у вас?",
    answer:
      "Так, ділюся своїми знаннями на індивідуальному навчанні класичному масажу 🙌 Для жінок також є навчання лінгам-масажу. Поточний формат, доступність, програму й вартість узгоджуємо особисто. Напишіть, що хочете опанувати — із радістю обговорю ваші цілі 😊",
  },
  {
    topic: "clients",
    mentions: 128,
    chatMentions: 60,
    category: "Комфорт",
    question: "Ви приймаєте жінок і чоловіків?",
    answer:
      "Так, приймаю і жінок, і чоловіків 💛 Доступний формат залежить від обраної послуги та її умов. Розкажіть, якого відпочинку хочеться саме вам, — допоможу обрати відповідний варіант і поясню деталі. До знайомства завжди приємно мати трохи передчуття 😊",
  },
  {
    topic: "discounts",
    mentions: 29,
    chatMentions: 26,
    category: "Ціни",
    question: "Чи є знижка для військових?",
    answer:
      "Так, якщо ви військовий або військова, запитайте мене про знижку 💛 Можу запропонувати 20% на оздоровчий або релакс-масаж. Погодимо її до запису й одразу уточнимо суму вашого сеансу. Буду рада подарувати вам час для відпочинку 🌿",
  },
  {
    topic: "gift",
    mentions: 25,
    chatMentions: 14,
    category: "Запис",
    question: "Чи можна подарувати масаж?",
    answer:
      "Так, можу оформити електронний подарунковий сертифікат 🎁 З ім’ям отримувача або без імені — як вам більше подобається. Напишіть, кому хочете подарувати відпочинок, і погодимо деталі. Приємно, коли турбота має таку теплу форму 💛",
  },
];

const rankedFaq = [...faq].sort(
  (left, right) =>
    right.mentions - left.mentions || right.chatMentions - left.chatMentions,
);

const categoryEnglish: Record<Category | "Усі питання", string> = {
  "Усі питання": "All questions",
  Формати: "Massage styles",
  Ціни: "Prices",
  Запис: "Booking",
  Комфорт: "Comfort & boundaries",
  Локація: "Location",
};
const englishUi = {
  brand: "Massage in Lviv",
  headerCaption: "Looking forward to welcoming you 🤍",
  eyebrow: "MASSAGE · LVIV · FAQ",
  titleFirst: "A little time for you.",
  titleSecond: "I’d love to meet you 😊",
  intro:
    "Hello! I’ve gathered answers to your most common questions here 💛 Explore the styles, ask me anything — I’d love to make your time to unwind special.",
  jump: "Browse answers",
  clarityTitle: "Comfort starts with clarity",
  clarity:
    "Mutual consent, clear boundaries and no sexual services. We can talk through everything beforehand — no awkwardness 😉",
  sectionEyebrow: "ANY QUESTIONS?",
  sectionTitle: "What you ask me most often",
  searchPlaceholder: "Search: prices, booking, preparation…",
  searchLabel: "Search questions and answers",
  clearSearch: "Clear search",
  clear: "Clear",
  categoryFilter: "Filter by topic",
  answers: "answers",
  singleAnswer: "answer",
  premiumCta: "Book a first visit",
  loadingPrices: "Loading current prices… 🌿",
  priceRequestError:
    "To find out current prices, message me on Telegram or Instagram using the contacts below. I’ll be glad to help you choose 😊",
  noServices:
    "There are no active services listed right now. Message me and we’ll talk through the available styles and prices 🤍",
  noResults:
    "I couldn’t find an answer for that search. Try another word or choose “All questions”.",
  contactEyebrow: "ANYTHING ELSE?",
  contactTitle: "Tell me which massage you’re curious about",
  contactText:
    "I’d love to answer your questions and check availability 😊 Let’s plan our time together — I’m already looking forward to it 🤍",
  instagram: "Message me on Instagram",
  telegram: "Message me on Telegram",
  footerNote: "Prices and availability are confirmed before booking.",
};

function FaqContent({
  themeMode,
  onToggleTheme,
}: {
  themeMode: ThemeMode;
  onToggleTheme: () => void;
}) {
  const [locale, setLocale] = useState<Locale>(() =>
    localStorage.getItem("faq-locale") === "en" ? "en" : "uk",
  );
  const catalog = useQuery({
    queryKey: ["public-services"],
    queryFn: ({ signal }) => publicApi.services(signal),
    retry: false,
    staleTime: 0,
  });
  const catalogFaq = useMemo(
    () =>
      rankedFaq.map((item) =>
        item.topic !== "prices"
          ? item
          : {
              ...item,
              lines: (catalog.isSuccess ? catalog.data : []).flatMap(
                (service) =>
                  [
                    {
                      durationMinutes: service.durationMinutes,
                      price: service.price,
                    },
                    ...(service.durationOptions ?? []),
                  ]
                    .sort(
                      (left, right) =>
                        left.durationMinutes - right.durationMinutes,
                    )
                    .map(
                      (option) =>
                        `${service.name} · ${option.durationMinutes} ${locale === "en" ? "min" : "хв"} — ${new Intl.NumberFormat(locale === "en" ? "en-GB" : "uk-UA", { style: "currency", currency: service.currency, maximumFractionDigits: 2 }).format(option.price)}`,
                    ),
              ),
            },
      ),
    [catalog.data, catalog.isSuccess, locale],
  );
  const localizedFaq = useMemo(
    () =>
      locale === "en"
        ? catalogFaq.map((item) => ({ ...item, ...faqEnglish[item.topic] }))
        : catalogFaq,
    [catalogFaq, locale],
  );
  const displayCategories = categories.map((category) => ({
    value: category,
    label: locale === "en" ? categoryEnglish[category] : category,
  }));
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] =
    useState<(typeof categories)[number]>("Усі питання");
  const normalizedQuery = query
    .trim()
    .toLocaleLowerCase(locale === "en" ? "en" : "uk-UA");
  const visibleFaq = useMemo(
    () =>
      localizedFaq.filter((item) => {
        const matchesCategory =
          selectedCategory === "Усі питання" ||
          item.category ===
            (locale === "en"
              ? categoryEnglish[selectedCategory]
              : selectedCategory);
        const searchable = [
          item.category,
          item.question,
          item.answer,
          ...(item.lines ?? []),
          item.note ?? "",
        ]
          .join(" ")
          .toLocaleLowerCase(locale === "en" ? "en" : "uk-UA");
        return matchesCategory && searchable.includes(normalizedQuery);
      }),
    [normalizedQuery, selectedCategory, localizedFaq],
  );
  const resultLabel = (() => {
    const remainder100 = visibleFaq.length % 100;
    if (locale === "en")
      return visibleFaq.length === 1
        ? englishUi.singleAnswer
        : englishUi.answers;
    if (remainder100 >= 11 && remainder100 <= 14) return "відповідей";
    const remainder10 = visibleFaq.length % 10;
    if (remainder10 === 1) return "відповідь";
    return remainder10 >= 2 && remainder10 <= 4 ? "відповіді" : "відповідей";
  })();

  useEffect(() => {
    const previousTitle = document.title;
    const previousLanguage = document.documentElement.lang;
    document.title =
      locale === "en" ? "FAQ — Massage in Lviv" : "FAQ — масаж у Львові";
    document.documentElement.lang = locale;
    localStorage.setItem("faq-locale", locale);
    return () => {
      document.title = previousTitle;
      document.documentElement.lang = previousLanguage;
    };
  }, [locale]);

  const en = locale === "en";
  const copy = (uk: string, english: string) => (en ? english : uk);
  return (
    <div className="massage-page" lang={locale} data-theme={themeMode}>
      <div className="faq-shell">
        <header className="faq-header">
          <a className="faq-brand" href="#top">
            ANNA LUSH <span>MASSAGE · LVIV</span>
          </a>
          <div className="faq-languages" aria-label="Language / Мова">
            <button
              aria-label="Українська"
              aria-pressed={!en}
              onClick={() => setLocale("uk")}
            >
              UA
            </button>
            <span aria-hidden="true">/</span>
            <button
              aria-label="English"
              aria-pressed={en}
              onClick={() => setLocale("en")}
            >
              EN
            </button>
          </div>
          <button
            className="faq-theme-toggle"
            type="button"
            onClick={onToggleTheme}
            aria-label={copy(
              themeMode === "dark"
                ? "Увімкнути світлу тему"
                : "Увімкнути темну тему",
              themeMode === "dark"
                ? "Switch to light theme"
                : "Switch to dark theme",
            )}
            title={copy(
              themeMode === "dark" ? "Світла тема" : "Темна тема",
              themeMode === "dark" ? "Light theme" : "Dark theme",
            )}
          >
            <span aria-hidden="true">{themeMode === "dark" ? "☀" : "☾"}</span>
          </button>
        </header>
        <main id="top">
          <section className="faq-intro" aria-labelledby="faq-title">
            <p className="faq-kicker">
              {copy("МАСАЖ У ЛЬВОВІ", "MASSAGE IN LVIV")}
            </p>
            <h1 id="faq-title">
              {copy("Питання та відповіді", "Questions & answers")}
            </h1>
            <p>
              {copy(
                "Зібрала важливе про масаж, запис і зустріч. Оберіть тему або знайдіть відповідь пошуком 🙂",
                "Clear answers about massage, booking and your visit. Choose a topic or search below 🙂",
              )}
            </p>
            <div className="faq-quick-contacts">
              <a
                className="faq-telegram"
                href={telegram}
                target="_blank"
                rel="noreferrer"
              >
                {copy("Записатися в Telegram", "Book via Telegram")} ↗
              </a>
              <a
                href="https://www.instagram.com/anna_lush_massage"
                target="_blank"
                rel="noreferrer"
              >
                Instagram ↗
              </a>
            </div>
          </section>
          <section
            className="faq-content"
            aria-label={copy("Пошук та відповіді", "Search and answers")}
          >
            <label className="faq-search">
              <span aria-hidden="true">⌕</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label={copy(
                  "Пошук у питаннях і відповідях",
                  englishUi.searchLabel,
                )}
                placeholder={copy(
                  "Наприклад: ціна, запис, підготовка…",
                  "Search prices, booking, preparation…",
                )}
              />
              {query && (
                <button
                  aria-label={copy("Очистити пошук", englishUi.clearSearch)}
                  onClick={() => setQuery("")}
                >
                  ×
                </button>
              )}
            </label>
            <div
              className="faq-categories"
              role="group"
              aria-label={copy("Фільтр за темою", englishUi.categoryFilter)}
            >
              {displayCategories.map((category) => (
                <button
                  key={category.value}
                  aria-pressed={selectedCategory === category.value}
                  onClick={() => setSelectedCategory(category.value)}
                >
                  {category.label}
                </button>
              ))}
            </div>
            <p className="faq-results" aria-live="polite">
              {visibleFaq.length} {resultLabel}
            </p>
            <div className="faq-answers">
              {visibleFaq.map((item) => (
                <article
                  key={item.topic}
                  id={`faq-${item.topic}`}
                  aria-labelledby={`faq-${item.topic}-title`}
                  className="faq-answer"
                >
                  <span className="faq-category-label">{item.category}</span>
                  <h2 id={`faq-${item.topic}-title`}>{item.question}</h2>
                  <p>
                    {item.topic === "booking"
                      ? (() => {
                          const phrase = en ? "tell me" : "напишіть мені";
                          const index = item.answer.indexOf(phrase);
                          return index < 0 ? (
                            item.answer
                          ) : (
                            <>
                              {item.answer.slice(0, index)}
                              <a
                                href={telegram}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {phrase}
                              </a>
                              {item.answer.slice(index + phrase.length)}
                            </>
                          );
                        })()
                      : item.answer}
                  </p>
                  {item.topic === "prices" && (
                    <div aria-live="polite" data-testid="faq-price-state">
                      {catalog.isPending && (
                        <p role="status">
                          {copy(
                            "Завантажую актуальні ціни…",
                            englishUi.loadingPrices,
                          )}
                        </p>
                      )}
                      {catalog.isError && (
                        <Alert severity="info">
                          {copy(
                            "Щоб дізнатися ціни, напишіть у Telegram або Instagram за контактами нижче.",
                            englishUi.priceRequestError,
                          )}
                        </Alert>
                      )}
                      {catalog.isSuccess && catalog.data.length === 0 && (
                        <Alert severity="info">
                          {copy(
                            "Наразі немає активних пропозицій. Напишіть мені — уточню доступні формати й ціни.",
                            englishUi.noServices,
                          )}
                        </Alert>
                      )}
                    </div>
                  )}
                  {!!item.lines?.length && (
                    <ul className="faq-price-list">
                      {item.lines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  )}
                  {item.note && <p className="faq-note">{item.note}</p>}
                  {item.topic === "premium" && (
                    <a
                      className="faq-inline-link"
                      href={telegram}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {copy("Запитати про перший візит", englishUi.premiumCta)}{" "}
                      ↗
                    </a>
                  )}
                </article>
              ))}
              {visibleFaq.length === 0 && (
                <Alert severity="info">
                  {copy(
                    "За цим запитом відповіді не знайшлося. Спробуйте інше слово або «Усі питання».",
                    englishUi.noResults,
                  )}
                </Alert>
              )}
            </div>
          </section>
        </main>
        <footer className="faq-footer" id="faq-contacts">
          <div>
            <strong>{copy("Запис і запитання", "Booking & questions")}</strong>
            <p>
              {copy(
                "Напишіть — допоможу обрати формат і відповім на ваші запитання 🤍",
                "Send a message and I’ll help you choose a style and answer your questions 🤍",
              )}
            </p>
          </div>
          <div className="faq-footer-links">
            <a href={telegram} target="_blank" rel="noreferrer">
              Telegram ↗
            </a>
            <a
              href="https://www.instagram.com/anna_lush_massage"
              target="_blank"
              rel="noreferrer"
            >
              Instagram ↗
            </a>
          </div>
          <small>
            {copy(
              "Львів · вулиця генерала Юнаківа · точна адреса після підтвердження запису",
              "Lviv · General Yunakiv Street · exact address after booking confirmation",
            )}
          </small>
        </footer>
      </div>
    </div>
  );
}

export function FaqPage() {
  const [manualTheme, setManualTheme] = useState<ThemeMode | null>(() => {
    const saved = localStorage.getItem("faq-theme");
    return saved === "dark" || saved === "light" ? saved : null;
  });
  const [deviceTheme, setDeviceTheme] = useState<ThemeMode>(getDeviceTheme);
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;
    const update = (event: MediaQueryListEvent) =>
      setDeviceTheme(event.matches ? "dark" : "light");
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  const themeMode = manualTheme ?? deviceTheme;
  const theme = useMemo(() => createFaqTheme(themeMode), [themeMode]);
  const toggleTheme = () => {
    const next = themeMode === "dark" ? "light" : "dark";
    localStorage.setItem("faq-theme", next);
    setManualTheme(next);
  };
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <FaqContent themeMode={themeMode} onToggleTheme={toggleTheme} />
    </ThemeProvider>
  );
}
