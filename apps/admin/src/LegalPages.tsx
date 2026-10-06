import {
  ArrowBackRounded,
  GavelRounded,
  HubOutlined,
  PrivacyTipOutlined,
} from "@mui/icons-material";
import {
  Box,
  Button,
  Container,
  Link as MuiLink,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { AdminAppearance, ThemeToggle } from "./AdminAppearance.js";
import { LanguageToggle, useI18n } from "./i18n.js";

type Section = {
  title: string;
  paragraphs: string[];
  links?: { label: string; href: string }[];
};

type PageCopy = {
  title: string;
  updated: string;
  intro: string;
  sections: Section[];
};

const privacyCopy: Record<"en" | "uk", PageCopy> = {
  en: {
    title: "Privacy Policy",
    updated: "Effective date: October 6, 2026",
    intro:
      "This policy explains how Massage / AI (Anna AI Assistant) handles information in its admin workspace and Telegram booking assistant. The service operator can be contacted at yazon2006@gmail.com.",
    sections: [
      {
        title: "Information handled",
        paragraphs: [
          "When an administrator signs in with Google, Firebase Authentication receives the Google account details needed for sign-in, such as the account name, email address, profile image and Firebase user ID. Access to the workspace is limited by the service's administrator access settings.",
          "For booking conversations, the service processes Telegram numeric user and chat IDs, available usernames or display names, message text and message times. It also handles booking details such as the selected service, appointment time, price and status, along with the business settings needed to provide the assistant.",
          "If an administrator connects Google Calendar, the service receives the connected account and selected calendar details. It reads busy periods for availability checks and creates or updates appointment events. Appointment events can include client and booking details; an event description may also include a limited amount of recent conversation context when available.",
          "The browser stores the Firebase sign-in state and the selected interface language and theme. The service does not use these preferences for advertising or cross-site tracking.",
        ],
      },
      {
        title: "How information is used and shared",
        paragraphs: [
          "Information is used to authenticate administrators, control access, answer Telegram messages, manage appointment availability and bookings, operate the workspace, protect the service and diagnose failures. Data is processed by Firebase and Google Cloud for authentication, hosting and backend storage; by Telegram to deliver Telegram messages; and by Google Calendar when an administrator connects a calendar.",
          "Relevant Telegram messages and limited recent conversation context may be sent to OpenAI to generate booking-related answers and decisions. If the administrator selects TypeSafe AI for a supported decision, the information needed for that decision is sent to that provider. Schedule requests may include busy start and end times from selected Google Calendars with the relevant booking context. Existing Calendar event titles, descriptions and attendees are not included in this availability context sent to the AI provider.",
          "For troubleshooting, owner-only diagnostics may keep sanitized AI request and response context. The service keeps at most its latest 200 diagnostic records. Administrators who manage the workspace may access the conversations, booking information and diagnostics needed to operate it.",
          "The service does not sell personal information or use it for advertising. Service providers process information under their own terms and privacy practices. We do not promise retention or deletion behavior controlled by those providers.",
        ],
        links: [
          {
            label: "Google API Services User Data Policy",
            href: "https://developers.google.com/terms/api-services-user-data-policy",
          },
          {
            label: "Google Privacy Policy",
            href: "https://policies.google.com/privacy",
          },
          {
            label: "Firebase privacy and security",
            href: "https://firebase.google.com/support/privacy",
          },
          {
            label: "OpenAI API data controls",
            href: "https://platform.openai.com/docs/guides/your-data",
          },
          {
            label: "Telegram Privacy Policy",
            href: "https://telegram.org/privacy",
          },
        ],
      },
      {
        title: "Storage, retention and choices",
        paragraphs: [
          "Booking and conversation records are kept in protected service storage for operating and reviewing the service. There is no single automatic deletion period for all operational records. Telegram and Google Calendar may also retain messages or appointment events in those services.",
          "An administrator can clear stored assistant context for a conversation; this does not delete booking records, previously submitted provider data or owner-only diagnostics. Disconnecting Google Calendar revokes the stored connection when successful, but does not delete existing Calendar events. Access can also be revoked from the relevant Google account settings.",
          "To ask about, correct or request deletion of information controlled by this service, email yazon2006@gmail.com. Some information may need to remain for active bookings, security, legal obligations or records held by third-party providers.",
        ],
      },
      {
        title: "Security and contact",
        paragraphs: [
          "Workspace access is authenticated and restricted to authorized administrators. Provider credentials are protected on the backend, including encryption for stored Google Calendar and Telegram account credentials. No online service can guarantee absolute security.",
          "For privacy questions or requests, contact the service operator at yazon2006@gmail.com.",
        ],
      },
    ],
  },
  uk: {
    title: "Політика конфіденційності",
    updated: "Чинна з 6 жовтня 2026 року",
    intro:
      "Ця політика пояснює, як сервіс Масаж / ШІ (Anna AI Assistant) обробляє інформацію в адмін-панелі та Telegram-асистенті для запису. З оператором сервісу можна зв’язатися за адресою yazon2006@gmail.com.",
    sections: [
      {
        title: "Яку інформацію обробляємо",
        paragraphs: [
          "Під час входу адміністратора через Google Firebase Authentication отримує дані облікового запису, потрібні для входу: наприклад, ім’я, email, зображення профілю та Firebase user ID. Доступ до панелі обмежений налаштуваннями доступу адміністраторів сервісу.",
          "Для запису сервіс обробляє числові ідентифікатори користувача й чату Telegram, доступні імена користувачів або відображувані імена, текст і час повідомлень. Також обробляються дані запису: вибрана послуга, час візиту, ціна, статус та бізнес-налаштування, необхідні асистенту.",
          "Якщо адміністратор підключає Google Calendar, сервіс отримує дані підключеного облікового запису й вибраного календаря. Для перевірки доступності він читає зайняті проміжки, а для записів створює або оновлює події. Події запису можуть містити дані клієнта й запису; опис події за наявності може містити обмежений фрагмент нещодавньої розмови.",
          "Браузер зберігає стан входу Firebase і вибрані мову інтерфейсу та тему. Сервіс не використовує ці налаштування для реклами або міжсайтового відстеження.",
        ],
      },
      {
        title: "Як використовуємо й передаємо інформацію",
        paragraphs: [
          "Інформація потрібна для входу адміністраторів і керування доступом, відповідей на повідомлення в Telegram, перевірки доступності та керування записами, роботи панелі, захисту сервісу й діагностики збоїв. Firebase і Google Cloud забезпечують авторизацію, хостинг і серверне зберігання; Telegram доставляє повідомлення; Google Calendar використовується після підключення адміністратором.",
          "Відповідні повідомлення Telegram і обмежений контекст недавньої розмови можуть передаватися OpenAI для формування відповідей і рішень щодо запису. Якщо адміністратор вибере TypeSafe AI для підтримуваного рішення, необхідна для нього інформація передається цьому провайдеру. Запит щодо розкладу може містити час початку й завершення зайнятих проміжків вибраного Google Calendar разом із потрібним контекстом запису. Назви, описи й учасники сторонніх подій календаря не передаються AI-провайдеру в цьому контексті доступності.",
          "Для діагностики помилок службові записи, доступні лише власнику, можуть зберігати очищений контекст запитів до AI та відповідей. Сервіс зберігає не більше 200 останніх діагностичних записів. Адміністратори робочого простору можуть переглядати розмови, записи й діагностику, необхідні для його роботи.",
          "Сервіс не продає персональні дані й не використовує їх для реклами. Провайдери обробляють інформацію відповідно до власних умов і політик конфіденційності. Ми не обіцяємо строки зберігання чи видалення, які контролюють ці провайдери.",
        ],
        links: [
          {
            label: "Політика Google API щодо даних користувачів",
            href: "https://developers.google.com/terms/api-services-user-data-policy",
          },
          {
            label: "Політика конфіденційності Google",
            href: "https://policies.google.com/privacy",
          },
          {
            label: "Конфіденційність і безпека Firebase",
            href: "https://firebase.google.com/support/privacy",
          },
          {
            label: "Керування даними OpenAI API",
            href: "https://platform.openai.com/docs/guides/your-data",
          },
          {
            label: "Політика конфіденційності Telegram",
            href: "https://telegram.org/privacy",
          },
        ],
      },
      {
        title: "Зберігання, строки та вибір користувача",
        paragraphs: [
          "Дані записів і розмов зберігаються в захищеному сховищі сервісу для його роботи й перегляду. Єдиного автоматичного строку видалення для всіх робочих даних немає. Telegram і Google Calendar також можуть зберігати повідомлення або події у своїх сервісах.",
          "Адміністратор може очистити збережений контекст асистента для окремої розмови; це не видаляє записи на прийом, раніше передані провайдерам дані або діагностику, доступну власнику. Після відключення Google Calendar збережене підключення відкликається, якщо відкликання успішне; наявні події календаря не видаляються. Доступ також можна відкликати в налаштуваннях облікового запису Google.",
          "Щоб дізнатися про дані, виправити їх або надіслати запит на видалення даних, контрольованих цим сервісом, напишіть на yazon2006@gmail.com. Частину інформації може знадобитися зберегти для активних записів, безпеки, вимог закону або через зберігання у сторонніх провайдерів.",
        ],
      },
      {
        title: "Безпека та зв’язок",
        paragraphs: [
          "Вхід до робочого простору захищений авторизацією та обмежений для уповноважених адміністраторів. Облікові дані провайдерів захищені на сервері; зокрема збережені облікові дані Google Calendar і Telegram шифруються. Жоден онлайн-сервіс не може гарантувати абсолютну безпеку.",
          "Із запитаннями щодо приватності або запитами на роботу з даними звертайтеся до оператора сервісу: yazon2006@gmail.com.",
        ],
      },
    ],
  },
};

const termsCopy: Record<"en" | "uk", PageCopy> = {
  en: {
    title: "Terms and Conditions",
    updated: "Effective date: October 6, 2026",
    intro:
      "These terms apply to the Massage / AI (Anna AI Assistant) admin workspace and its Telegram booking assistant. By using the service, you agree to these terms. The service operator can be contacted at yazon2006@gmail.com.",
    sections: [
      {
        title: "Who may use the service",
        paragraphs: [
          "The admin workspace is for administrators explicitly authorized by the service owner. You must use your own Google account, protect your sign-in access and stop using the workspace if your authorization is removed. The booking assistant is available through the configured Telegram business account.",
        ],
      },
      {
        title: "Acceptable use",
        paragraphs: [
          "Use the service only for legitimate business and booking activity. Do not attempt to bypass access controls, access information you are not authorized to see, disrupt the service, or use it for unlawful, abusive or misleading activity. Administrators are responsible for keeping their account secure and for using client information only as needed to manage the service.",
        ],
      },
      {
        title: "AI assistant and appointments",
        paragraphs: [
          "AI-generated answers can be incomplete or incorrect. Check service details, prices, availability and client-facing messages before relying on them. The assistant is not a medical service and does not provide medical advice, diagnosis or treatment.",
          "A proposed appointment is not confirmed until the service reports that the booking was successfully created in the connected Calendar. Availability can change before confirmation. If Calendar or another required provider is unavailable, booking features may be delayed or unavailable.",
        ],
      },
      {
        title: "Third-party services and privacy",
        paragraphs: [
          "The service depends on Google, Firebase, Telegram, OpenAI and, when selected, TypeSafe AI. Their services are subject to their own terms and privacy practices, and interruptions or changes in those services can affect this product. Information handling is described in the Privacy Policy.",
        ],
        links: [
          {
            label: "Privacy Policy",
            href: "/privacy-policy",
          },
          {
            label: "Google Terms",
            href: "https://policies.google.com/terms",
          },
          {
            label: "Telegram Terms",
            href: "https://telegram.org/tos",
          },
          {
            label: "OpenAI policies",
            href: "https://openai.com/policies/",
          },
        ],
      },
      {
        title: "Updates and contact",
        paragraphs: [
          "These terms may be updated as the service changes. Continued use after updated terms are published means you accept the updated terms. Questions about these terms can be sent to yazon2006@gmail.com.",
        ],
      },
    ],
  },
  uk: {
    title: "Умови використання",
    updated: "Чинні з 6 жовтня 2026 року",
    intro:
      "Ці умови стосуються адмін-панелі Масаж / ШІ (Anna AI Assistant) і Telegram-асистента для запису. Користуючись сервісом, ви погоджуєтеся з умовами. З оператором сервісу можна зв’язатися за адресою yazon2006@gmail.com.",
    sections: [
      {
        title: "Хто може користуватися сервісом",
        paragraphs: [
          "Адмін-панель призначена для адміністраторів, яким власник сервісу надав доступ. Використовуйте власний обліковий запис Google, захищайте дані входу та припиніть користування панеллю, якщо доступ відкликано. Асистент для запису працює через налаштований бізнес-акаунт Telegram.",
        ],
      },
      {
        title: "Допустиме використання",
        paragraphs: [
          "Використовуйте сервіс лише для законної роботи бізнесу та запису клієнтів. Не обходьте контроль доступу, не переглядайте дані без дозволу, не перешкоджайте роботі сервісу й не використовуйте його для незаконних, образливих або оманливих дій. Адміністратори відповідають за безпеку свого облікового запису та використання даних клієнтів лише для роботи сервісу.",
        ],
      },
      {
        title: "AI-асистент і записи",
        paragraphs: [
          "Відповіді AI можуть бути неповними або помилковими. Перевіряйте дані про послуги, ціни, доступність і повідомлення клієнтам перед використанням. Асистент не є медичним сервісом і не надає медичних порад, діагнозів чи лікування.",
          "Запропонований час не вважається підтвердженим, доки сервіс не повідомить про успішне створення запису в підключеному календарі. Доступність може змінитися до підтвердження. Якщо Calendar або інший необхідний провайдер недоступний, функції запису можуть затримуватися або бути недоступними.",
        ],
      },
      {
        title: "Сторонні сервіси та приватність",
        paragraphs: [
          "Сервіс залежить від Google, Firebase, Telegram, OpenAI та, якщо його вибрано, TypeSafe AI. На їхні послуги поширюються власні умови й політики конфіденційності; збої або зміни цих сервісів можуть впливати на роботу продукту. Обробку інформації описано в Політиці конфіденційності.",
        ],
        links: [
          {
            label: "Політика конфіденційності",
            href: "/privacy-policy",
          },
          {
            label: "Умови Google",
            href: "https://policies.google.com/terms",
          },
          {
            label: "Умови Telegram",
            href: "https://telegram.org/tos",
          },
          {
            label: "Політики OpenAI",
            href: "https://openai.com/policies/",
          },
        ],
      },
      {
        title: "Оновлення та зв’язок",
        paragraphs: [
          "Умови можуть оновлюватися разом зі змінами сервісу. Продовження користування після публікації оновлених умов означає згоду з ними. Запитання щодо умов надсилайте на yazon2006@gmail.com.",
        ],
      },
    ],
  },
};

function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const { language } = useI18n();
  const privacy = kind === "privacy";
  const copy = (privacy ? privacyCopy : termsCopy)[language];
  const pageId = privacy ? "privacy-policy-page" : "terms-and-conditions-page";
  const Icon = privacy ? PrivacyTipOutlined : GavelRounded;
  const backLabel =
    language === "uk" ? "Повернутися до входу" : "Back to sign in";

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${copy.title} | Anna AI Assistant`;
    return () => {
      document.title = previousTitle;
    };
  }, [copy.title]);

  return (
    <AdminAppearance>
      <Box
        component="main"
        data-testid={pageId}
        lang={language}
        sx={{
          minHeight: "100dvh",
          py: { xs: 2, md: 5 },
          background:
            "radial-gradient(ellipse at 20% 0%, var(--admin-login-teal), transparent 42%), radial-gradient(ellipse at 95% 70%, var(--admin-login-violet), transparent 44%), var(--admin-canvas)",
        }}
      >
        <Container maxWidth="md">
          <Paper
            variant="outlined"
            sx={{ p: { xs: 2.5, sm: 4, md: 5 }, bgcolor: "background.paper" }}
          >
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              alignItems={{ xs: "stretch", sm: "center" }}
              justifyContent="space-between"
              sx={{ mb: 4 }}
            >
              <Stack direction="row" alignItems="center" spacing={1.5}>
                <Box
                  sx={{
                    display: "grid",
                    placeItems: "center",
                    width: 42,
                    height: 42,
                    borderRadius: "12px 4px 12px 4px",
                    border: "1px solid var(--admin-accent-border)",
                    bgcolor: "var(--admin-accent-wash)",
                    color: "primary.main",
                  }}
                >
                  <HubOutlined />
                </Box>
                <Box>
                  <Typography
                    fontWeight={750}
                    sx={{ letterSpacing: "-0.04em" }}
                  >
                    {language === "uk" ? "Масаж / ШІ" : "Massage / AI"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {language === "uk"
                      ? "Публічна інформація"
                      : "Public information"}
                  </Typography>
                </Box>
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <LanguageToggle />
                <ThemeToggle />
              </Stack>
            </Stack>

            <Stack
              direction="row"
              spacing={1.25}
              alignItems="center"
              sx={{ mb: 1 }}
            >
              <Icon color="primary" />
              <Typography component="h1" variant="h4" sx={{ fontWeight: 700 }}>
                {copy.title}
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {copy.updated}
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 4, lineHeight: 1.75 }}>
              {copy.intro}
            </Typography>

            <Stack spacing={3}>
              {copy.sections.map((section) => (
                <Box component="section" key={section.title}>
                  <Typography component="h2" variant="h6" sx={{ mb: 1 }}>
                    {section.title}
                  </Typography>
                  <Stack spacing={1.25}>
                    {section.paragraphs.map((paragraph) => (
                      <Typography
                        key={paragraph}
                        variant="body2"
                        color="text.secondary"
                        sx={{ lineHeight: 1.75 }}
                      >
                        {paragraph}
                      </Typography>
                    ))}
                  </Stack>
                  {section.links && (
                    <Stack
                      component="ul"
                      spacing={0.5}
                      sx={{ mt: 1.25, mb: 0, pl: 2.5 }}
                    >
                      {section.links.map((item) => (
                        <Box component="li" key={item.href}>
                          <MuiLink
                            href={item.href}
                            {...(item.href.startsWith("http")
                              ? { target: "_blank", rel: "noreferrer" }
                              : {})}
                          >
                            {item.label}
                          </MuiLink>
                        </Box>
                      ))}
                    </Stack>
                  )}
                </Box>
              ))}
            </Stack>

            <Button
              component={Link}
              to="/login"
              variant="contained"
              size="large"
              startIcon={<ArrowBackRounded />}
              sx={{ mt: 4, minHeight: 48, px: 2.5 }}
            >
              {backLabel}
            </Button>
          </Paper>
        </Container>
      </Box>
    </AdminAppearance>
  );
}

export function PrivacyPolicy() {
  return <LegalPage kind="privacy" />;
}

export function TermsAndConditions() {
  return <LegalPage kind="terms" />;
}
