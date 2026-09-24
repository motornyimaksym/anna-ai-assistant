# Специфікація проєкту — Telegram Booking Assistant

## 1. Призначення

Система — це асистент для запису клієнтів, який працює через Telegram Business account та відповідає клієнтам від імені підключеного Telegram-акаунта.

Основні задачі:

- відповідати на питання про послуги;
- повідомляти ціни та тривалість;
- знаходити доступні часові слоти;
- створювати записи;
- переносити записи;
- скасовувати записи;
- підтримувати контекст діалогу;
- враховувати зайнятість у Google Calendar;
- дозволяти ручне перехоплення діалогу людиною;
- запобігати дублюванню Telegram updates;
- запобігати подвійним записам;
- надавати web-admin для керування записами та конфігурацією.

---

## 2. Архітектура та стек

### 2.1. Основний стек

- TypeScript
- Node.js 22
- pnpm
- pnpm workspaces
- Turborepo
- NestJS
- React
- Vite
- Material UI
- TanStack React Query
- Zod
- Firebase Cloud Functions 2nd gen
- Firebase Hosting
- Firestore
- Firebase Admin SDK
- Firebase Authentication
- OpenAI API
- Google Calendar API
- Telegram Bot API / Telegram Business
- Jest
- Vitest
- ESLint
- Prettier

Увесь TypeScript має працювати у strict mode.

Для відтворюваних CI/Firebase збірок pnpm 11 має явно дозволяти install-скрипти лише для перевірених залежностей, потрібних монорепозиторію: `@firebase/util`, `esbuild`, `protobufjs`. Невідомі install-скрипти мають зупиняти збірку.

---

## 3. Структура монорепозиторію

```text
.
├── apps/
│   ├── api/
│   └── admin/
│
├── packages/
│   ├── contracts/
│   ├── domain/
│   ├── config/
│   ├── eslint-config/
│   └── typescript-config/
│
├── firebase/
│   ├── firestore.rules
│   ├── firestore.indexes.json
│   └── firebase.json
│
├── docs/
│   ├── architecture.md
│   ├── data-model.md
│   ├── local-development.md
│   └── deployment.md
│
├── scripts/
├── AGENTS.md
├── SPEC.md
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── .firebaserc.example
├── .gitignore
└── README.md
```

---

## 4. Відповідальність workspace-ів

### 4.1. `apps/api`

NestJS backend.

Відповідає за:

- Telegram webhook;
- Telegram Business messages;
- OpenAI orchestration;
- логіку записів;
- розрахунок доступності;
- роботу з Firestore;
- Google Calendar;
- admin REST API;
- authentication / authorization.

### 4.2. `apps/admin`

React admin application.

Відповідає за:

- керування записами;
- керування послугами;
- робочий графік;
- винятки з графіка;
- керування станом асистента;
- керування автоматизацією розмов;
- перегляд специфікації з репозиторію;
- перегляд та редагування system prompt асистента;
- базовий dashboard.

### 4.3. `packages/contracts`

Спільні API/transport типи та Zod-схеми.

Приклади:

- `BookingDto`
- `ServiceDto`
- `AvailabilityRuleDto`
- `ScheduleExceptionDto`
- `ConversationDto`
- `CreateBookingRequest`
- `UpdateBookingRequest`
- `AvailableSlotsRequest`
- `AvailableSlotsResponse`

API та frontend не повинні дублювати DTO.

### 4.4. `packages/domain`

Framework-independent domain logic:

- `BookingStatus`
- `Booking`
- `Service`
- `AvailabilityRule`
- `ScheduleException`
- `TimeInterval`
- генерація слотів;
- date/time helpers.

Не повинен залежати від NestJS, React, Firebase або HTTP.

### 4.5. `packages/config`

Спільна конфігурація, де це доречно.

Backend secrets не можуть потрапляти у frontend.

---

## 5. Firebase

### 5.1. Backend

NestJS API має бути доступний через Firebase Cloud Functions 2nd gen.

Параметри:

- Node.js 22
- region: `europe-west1`
- function name: `api`

Telegram webhook:

```text
POST /telegram/webhook
```

Production API через Hosting rewrite:

```text
/api/**
```

Firebase CLI має отримувати самодостатній Node.js 22 пакет функції `api` з усіма production-залежностями монорепозиторію. Збірка пакета не повинна включати локальні `.env` файли або секрети. Hosting передає `/api/**` у функцію, а NestJS обробляє маршрут після видалення префікса `/api`; прямі локальні маршрути (`/health`, `/admin/**`, `/telegram/webhook`) залишаються доступними.

### 5.2. Hosting

Firebase Hosting обслуговує вміст `apps/admin/dist`, скопійований під час підготовки релізу до `firebase/public`. Каталог Hosting має залишатися всередині Firebase CLI project directory (`firebase/`).

SPA routes мають працювати через fallback на `index.html`.

`/api/**` має проксуватись у Cloud Function `api`.

### 5.3. Local development

Backend повинен запускатися локально без Firebase Functions:

```bash
pnpm --filter api dev
```

Бажаний URL:

```text
http://localhost:2301
```

Admin:

```text
http://localhost:5173
```

Firebase Emulator UI:

```text
http://localhost:4000
```

---

## 6. Конфігурація

### 6.1. Backend environment

```text
NODE_ENV
DEFAULT_TIMEZONE=Europe/Kyiv

TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
TELEGRAM_ALLOWED_USERNAME

OPENAI_API_KEY
OPENAI_MODEL

GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REFRESH_TOKEN
GOOGLE_CALENDAR_ID

FIREBASE_PROJECT_ID

ADMIN_UIDS
```

### 6.2. Frontend environment

Допускаються лише public variables:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_APP_ID
```

Не можна передавати у frontend:

- Telegram bot token;
- OpenAI API key;
- Google client secret;
- Google refresh token;
- webhook secret.

Конфігурація має валідуватися через Zod.

У Firebase Functions ідентифікатор проєкту визначається SDK з середовища виконання; `FIREBASE_PROJECT_ID` є необов'язковим явним перевизначенням. Production-збірка admin потребує чотири публічні `VITE_FIREBASE_*` значення. Backend secrets передаються лише через Secret Manager і не повинні з'являтися у build logs.

Порт `PORT` валідується для самостійного локального HTTP-сервера. Firebase Functions керує власним портом; службова конфігурація функції не залежить від значення `PORT` у її середовищі.

---

## 7. Telegram Business

### 7.1. Webhook

Endpoint:

```text
POST /telegram/webhook
```

Підтримати:

- `business_connection`
- `business_message`
- `edited_business_message`
- `deleted_business_messages`

Для відповідей від імені business account використовувати:

```text
business_connection_id
```

### 7.2. Webhook security

Перевіряти:

```text
X-Telegram-Bot-Api-Secret-Token
```

проти:

```text
TELEGRAM_WEBHOOK_SECRET
```

Для тестового розгортання `TELEGRAM_ALLOWED_USERNAME` задає єдине ім'я Telegram-користувача без `@`, якому бот може відповідати. Порівняння з `business_message.from.username` або `message.from.username` для private DM нечутливе до регістру. Якщо змінна відсутня, `from.username` відсутнє або ім'я не збігається, webhook повертає успішну відповідь без запису update/conversation у Firestore і без відправлення повідомлення. Перевірка виконується до idempotency claim. Пізніше обмеження можна замінити на стабільний числовий Telegram user ID, коли його буде підтверджено для цього акаунта.

### 7.3. Idempotency

Telegram update може бути доставлений повторно.

Колекція:

```text
telegramUpdates/{updateId}
```

Обробка має бути ідемпотентною.

Два паралельні однакові updates не повинні призводити до подвійної обробки.

---

## 8. Firestore data model

Використовується `(default)` база Cloud Firestore Standard у регіоні, узгодженому з функцією. Backend працює через Admin SDK; frontend не читає Firestore напряму.

Основні колекції:

```text
services
availabilityRules
scheduleExceptions
clients
bookings
bookingSlots
conversations
telegramUpdates
assistantSettings
```

Допускаються додаткові internal collections за обґрунтованої потреби.

Для system prompt використовується документ `assistantSettings/prompt` з полями `prompt` (string) та `updatedAt` (ISO timestamp). Документ існує лише для кастомного prompt. Якщо документа немає, backend використовує `ASSISTANT_SYSTEM_PROMPT` з коду. Reset видаляє документ і повертає default без migration.

Налаштування поведінки бота зберігаються в `assistantSettings/behavior`: `maxReadDelayMs` (integer, 0–3,540,000), `typingDelayPerSymbolMs` (integer, 0–800) та `updatedAt` (ISO timestamp). `maxReadDelayMs` задає верхню межу випадкової затримки перед Business read receipt, максимум — 59 хвилин. Admin UI вводить цю межу в секундах (0–3,540) і конвертує в мілісекунди через API. Якщо документа немає, використовуються defaults `maxReadDelayMs: 2000` і `typingDelayPerSymbolMs: 600`. Backend перевіряє значення за спільною Zod-схемою.

---

## 9. Послуги

Приклад:

```ts
{
  id: "massage-60",
  name: "Масаж 60 хв",
  description: "Класичний масаж",
  durationMinutes: 60,
  bufferMinutes: 15,
  price: 1500,
  durationOptions: [{ durationMinutes: 90, price: 2000 }],
  currency: "UAH",
  enabled: true
}
```

Admin повинен підтримувати:

- перегляд;
- створення;
- редагування;
- enable / disable;
- зміну ціни;
- зміну тривалості;
- зміну buffer;
- окремий Telegram client message: photo, rich caption and inline URL buttons;
- preview the exact Telegram message before saving.

Негативні ціни та некоректна тривалість заборонені.

### 9.1. Duration and price options

One service may offer 1–10 distinct duration/price options, sharing its name, description, currency, buffer, enabled state, photo and Telegram presentation. Keep the existing `durationMinutes` and `price` as the first option for backward compatibility; optional `durationOptions` holds up to nine additional `{ durationMinutes, price }` pairs. Durations must be unique across all options, integer 15–480 minutes; prices must be finite and nonnegative. Existing services without `durationOptions` remain single-option services without migration.

The Services editor shows editable duration/price rows with Add option and Remove option controls; at least one row must remain. Catalog cards and automatic Telegram captions show all options. Custom Telegram captions remain administrator-authored.

Availability and create-booking requests accept optional integer `durationMinutes`. It must match an offered option. Omission is allowed only for a single-option service; a multi-option service requires the client to choose before availability or booking. The assistant tools expose this selection, and the assistant asks which duration the client wants when unclear. Pending booking proposals persist and display the chosen duration. New bookings snapshot the selected `durationMinutes`, `price`, and `currency` from the server catalog, never a caller-supplied price. These values do not change when the catalog changes. Admin Bookings displays booked duration and price; old bookings derive duration from start/end and show unknown historical price rather than the current catalog price.

Rescheduling preserves booked duration, price, currency and stored buffer, even if the catalog option changes or is removed. Availability rechecks for an existing booking use its stored timing. Legacy bookings use their start/end interval as duration. Booking slot locks and Calendar end times use the selected/booked duration.

Service `description` remains plain information for the assistant. Optional `telegramCaption` stores plain text and Telegram message entities (UTF-16 offsets); optional `photoUrl` points to an uploaded service photo; optional `telegramButtons` stores rows of URL buttons. When no custom caption exists, the bot builds a plain service card from name, description, duration, and price. When `get_services` is used, send one Telegram service card per returned enabled service after the assistant's text answer. Cards use `sendPhoto` when a photo exists and `sendMessage` otherwise. Support Telegram formatting entities for bold, italic, underline, strikethrough, spoiler, code, preformatted text, quote, expandable quote, and linked text. Callback buttons and other media types are outside this service-card flow.

Service photos are JPEG, PNG, or WebP up to 5 MiB. Upload through the protected Admin API to Firebase Storage. Storage writes are backend-only; tokenized photo URLs allow Telegram and customers to view the intentionally public catalog images. Never accept arbitrary external photo URLs through the editor.

---

## 10. Робочий графік

### 10.1. Availability rules

Приклад:

```ts
{
  dayOfWeek: 1,
  start: "10:00",
  end: "20:00",
  enabled: true
}
```

### 10.2. Schedule exceptions

Підтримати:

- повний вихідний;
- додатковий робочий інтервал;
- заблокований інтервал;
- відпустку;
- спеціальний робочий день.

Приклади:

```text
12 жовтня — вихідний
14 жовтня — робота 12:00–17:00
15 жовтня — недоступно 14:00–16:00
```

---

## 11. Клієнти

Документ бажано ідентифікувати через Telegram user ID.

```ts
{
  telegramUserId,
  username,
  firstName,
  lastName,
  phone,
  createdAt,
  updatedAt
}
```

Не збирати зайві персональні дані.

---

## 12. Записи

```ts
{
  clientId,
  serviceId,

  durationMinutes, // selected duration snapshot; optional on legacy bookings
  price,           // server catalog price at booking creation
  currency,

  startAt,
  endAt,

  status,

  telegramChatId,
  businessConnectionId,

  googleCalendarEventId,
  calendarSyncStatus,

  createdAt,
  updatedAt
}
```

Статуси:

```text
pending
confirmed
cancelled
completed
no_show
```

`calendarSyncStatus`:

```text
pending
synced
failed
```

---

## 13. Захист від подвійного запису

Використовувати 15-хвилинні атомарні slot locks.

Приклад:

```text
18:30–19:30
```

блокує:

```text
18:30
18:45
19:00
19:15
```

Документи:

```text
bookingSlots/{resourceId}_{yyyy-MM-dd}_{HH-mm}
```

Для MVP використовується один therapist/resource, але модель не повинна унеможливлювати кілька ресурсів у майбутньому.

### 13.1. Booking transaction

Firestore transaction:

1. розрахувати необхідні slot locks;
2. прочитати всі slot locks;
3. перевірити, що вони вільні;
4. створити booking;
5. створити slot locks;
6. commit atomically.

Якщо інша транзакція вже зайняла slot — повернути domain conflict.

---

## 14. Buffer

Кожна послуга може мати:

```text
bufferMinutes
```

У MVP buffer застосовується **після запису**.

Створений booking зберігає застосований `bufferMinutes` як внутрішнє поле, щоб подальша зміна налаштувань послуги не скорочувала зайнятий інтервал вже існуючого запису.

Приклад:

```text
duration = 60
buffer = 15
```

Наступний запис не може початися раніше завершення booking + buffer.

---

## 15. Скасування

Cancellation повинно:

1. оновити booking status;
2. звільнити booking slot locks;
3. видалити/скасувати Google Calendar event.

Операція має бути ідемпотентною.

---

## 16. Перенесення запису

Rescheduling повинно бути атомарним у Firestore:

1. перевірити booking;
2. перевірити нові slot locks;
3. звільнити старі;
4. зайняти нові;
5. оновити час booking.

Якщо транзакція неуспішна — початковий запис повинен залишитися без змін.

Google Calendar синхронізується тільки після успішного Firestore commit.

---

## 17. Availability engine

Input:

```ts
{
  serviceId: string;
  durationMinutes?: number; // required for services with multiple options
  date: string;
  after?: string;
  before?: string;
}
```

Враховувати:

- weekly schedule;
- schedule exceptions;
- Firestore booking slots;
- Google Calendar busy intervals;
- service duration;
- buffer;
- timezone.

Default timezone:

```text
Europe/Kyiv
```

LLM не має права самостійно визначати доступність.

Використовувати одну date/time library послідовно в усьому проєкті.

---

## 18. Google Calendar

Сервіс має підтримувати:

```ts
getBusyIntervals(start, end)
createBookingEvent(booking)
updateBookingEvent(booking)
deleteBookingEvent(eventId)
```

Google Calendar використовується як додаткове джерело зайнятості.

Firestore залишається primary source of truth для booking.

Якщо Calendar OAuth не налаштовано повністю (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_CALENDAR_ID`), інтеграція вимкнена: доступність не враховує Google Calendar, а події не синхронізуються. Записи у Firestore продовжують працювати.

Calendar event повинен містити:

- ім'я клієнта;
- Telegram username;
- booking ID;
- назву послуги.

Calendar failures мають бути явно оброблені та відображені через `calendarSyncStatus`.

---

## 19. OpenAI assistant

LLM відповідає за:

- natural language;
- intent understanding;
- відносні дати;
- контекст діалогу;
- формулювання відповіді.

Backend відповідає за:

- services;
- prices;
- working schedule;
- availability;
- bookings;
- cancellation;
- rescheduling;
- Google Calendar.

LLM не є джерелом істини.

System prompt за замовчуванням експортується як `ASSISTANT_SYSTEM_PROMPT` з `apps/api/src/assistant-prompt.ts`. Для кожного нового запиту backend використовує збережений `assistantSettings/prompt`, якщо він є; інакше використовує default. Зміна prompt застосовується до наступного повідомлення без redeploy.

---

## 20. Assistant tools

Мінімальний набір:

```text
get_services
get_available_slots
create_booking
get_bookings
cancel_booking
reschedule_booking
```

Опційно:

```text
get_service_details
```

Усі tool arguments мають проходити Zod validation.

Не довіряти без перевірки:

- booking ID;
- service ID;
- date;
- time;
- price.

---

## 21. Assistant behavior

Базові правила:

```text
You are a booking assistant for a massage therapist.

Help clients:
- learn about services;
- learn prices and duration;
- find available appointment times;
- create bookings;
- cancel bookings;
- reschedule bookings.

Never invent availability.
Always call get_available_slots before offering a concrete appointment time.
Never claim a booking is confirmed before create_booking returns success.
Never invent prices, services, policies, addresses or durations.
Use Ukrainian by default.
Reply in the same language as the client when possible.
Be concise, warm and natural.
```

Prompt має зберігатися в окремому файлі та легко редагуватися.

---

## 22. Conversations

```text
conversations/{telegramChatId}
```

```ts
{
  telegramChatId,
  clientId,
  businessConnectionId,

  assistantEnabled,

  state,
  summary,

  humanTakeoverUntil,

  createdAt,
  updatedAt
}
```

Messages:

```text
conversations/{id}/messages/{messageId}
```

```ts
{
  role: "user" | "assistant" | "human",
  text,
  telegramMessageId,
  createdAt
}
```

Не відправляти в LLM необмежену історію.

Для MVP:

- system prompt;
- conversation summary;
- останні 20 messages.

---

## 23. Human takeover

Підтримати:

```ts
assistantEnabled: boolean
humanTakeoverUntil?: Timestamp
```

Якщо automation disabled або `humanTakeoverUntil > now`, бот не відповідає автоматично.

Admin повинен дозволяти:

- enable assistant;
- disable assistant;
- resume assistant;
- temporary takeover.

---

## 24. Admin authentication

Використовувати Firebase Authentication.

MVP:

- Google Sign-In;
- backend перевіряє Firebase ID token;
- `ADMIN_UIDS` містить UID власників, які завжди мають admin доступ і можуть керувати stakeholder allowlist;
- verified email з Firestore allowlist дає admin доступ без права змінювати allowlist;
- email нормалізується до lowercase, а unverified email не дає доступ.

Environment:

```text
ADMIN_UIDS=uid1,uid2
```

Frontend route guard не є достатнім захистом.

Власники керують stakeholder email list на сторінці Bot Settings. Дані зберігаються у `assistantSettings/adminAccess`. Список містить до 100 унікальних валідних email адрес. Owner може переглядати, додавати та видаляти адреси; stakeholder адміністратор має доступ до інших admin сторінок, але не може змінювати список.

---

## 25. Admin application

Routes:

```text
/login
/dashboard
/bookings
/services
/schedule
/conversations
/specs
/prompt
/bot-settings
```

### 25.1. Dashboard

Показувати:

- bookings today;
- bookings this week;
- upcoming bookings;
- assistant enabled / disabled;
- calendar sync failures.

### 25.2. Bookings

Показувати:

- client;
- service;
- date;
- time;
- status;
- Telegram username;
- calendar sync status.

Actions:

- view;
- cancel;
- reschedule.

### 25.3. Services

Actions:

- create;
- edit;
- enable / disable;
- price;
- duration;
- add, edit and remove duration/price options for one service;
- buffer;
- upload or remove a catalog photo;
- edit Telegram caption text with formatting toolbar and link support;
- add, edit, reorder, and remove inline URL buttons;
- preview the photo, formatted caption, and buttons as a Telegram card.

The editor has clear validation and save/error states. Photo upload accepts JPEG, PNG, or WebP up to 5 MiB. The service's plain description remains the assistant's source of truth; optional Telegram presentation content is separate.

### 25.4. Schedule

Редагування weekly working hours та schedule exceptions.

### 25.5. Conversations

Показувати:

- Telegram client;
- last message;
- last activity;
- assistant enabled;
- human takeover status.

Actions:

- disable automation;
- resume automation.

Повний Telegram chat UI в MVP не потрібен.

### 25.6. Specs

Захищена сторінка показує `SPEC.md` версії, запакованої з відповідним backend release, відформатований як Markdown. Вміст доступний лише через Admin API після Firebase ID token перевірки.

### 25.7. Assistant prompt

Захищена сторінка показує ефективний prompt у редагованому полі. Save зберігає кастомний prompt довжиною 1–12,000 символів та застосовує його до наступного запиту асистента. Reset видаляє кастомний prompt і повертає prompt з `assistant-prompt.ts`. Порожній prompt не приймається. UI показує, чи використовується default або кастомний prompt, та надає явні Save і Reset actions.

### 25.8. Bot settings

Захищена сторінка дозволяє змінити максимальну випадкову затримку перед Telegram Business read receipt (`maxReadDelayMs`, UI 0–3,540 seconds; API/storage 0–3,540,000 ms) і затримку typing-відповіді на кожен Unicode символ (`typingDelayPerSymbolMs`, 0–800 ms). Початкові значення: 2 seconds та 600 ms. Поле read delay приймає дробові секунди до мілісекундної точності та показує межу 59 хвилин. Сторінка валідує значення та має явну кнопку Save. Збережені значення застосовуються до наступного вхідного повідомлення без redeploy.

---

## 26. Admin API

Орієнтовні endpoints:

```text
GET    /admin/bookings
GET    /admin/bookings/:id
POST   /admin/bookings
PATCH  /admin/bookings/:id
POST   /admin/bookings/:id/cancel
POST   /admin/bookings/:id/reschedule

GET    /admin/services
POST   /admin/services
PATCH  /admin/services/:id
POST   /admin/services/:id/photo

GET    /admin/schedule
PUT    /admin/schedule

GET    /admin/schedule-exceptions
POST   /admin/schedule-exceptions
PATCH  /admin/schedule-exceptions/:id
DELETE /admin/schedule-exceptions/:id

GET    /admin/conversations
PATCH  /admin/conversations/:id

GET    /admin/dashboard
GET    /admin/spec
GET    /admin/assistant-prompt
PUT    /admin/assistant-prompt
DELETE /admin/assistant-prompt
GET    /admin/bot-settings
PUT    /admin/bot-settings
GET    /admin/admin-access
PUT    /admin/admin-access

GET    /health
```

`GET /admin/spec` повертає `{ content: string }`. Prompt endpoints використовують спільні Zod contracts. `GET` повертає `{ prompt: string, isCustom: boolean, updatedAt?: string }`; `PUT` приймає `{ prompt: string }` і повертає ефективне значення; `DELETE` видаляє override та повертає default. Усі `/admin/**` endpoints вимагають Firebase ID token від owner UID у `ADMIN_UIDS` або verified email з stakeholder allowlist.

Bot settings endpoints використовують спільні Zod contracts. `GET /admin/bot-settings` повертає `{ maxReadDelayMs, typingDelayPerSymbolMs, isCustom, updatedAt? }`, включно з defaults коли override відсутній. `PUT` приймає `{ maxReadDelayMs, typingDelayPerSymbolMs }` у мілісекундах і зберігає налаштування. `maxReadDelayMs` обмежений 0–3,540,000 ms, `typingDelayPerSymbolMs` — 0–800 ms. Збереження доступне лише авторизованому адміністратору.

Admin access endpoints використовують спільні Zod contracts. `GET /admin/admin-access` повертає `{ emails, canManage, updatedAt? }`. `PUT` приймає `{ emails }` з максимум 100 унікальними email адресами та повертає той самий response shape. Лише UID з `ADMIN_UIDS` може зберегти allowlist; прочитати її можуть усі авторизовані адміністратори.

Service endpoints використовують спільну `serviceSchema`; create and update accept all editable catalog and Telegram presentation fields. `POST /admin/services/:id/photo` accepts `{ contentType, base64 }` for a JPEG, PNG, or WebP up to 5 MiB, uploads it to Firebase Storage, saves the `photoUrl` on the service, and returns `{ photoUrl }`. All routes require an owner UID or verified stakeholder email Firebase ID token.

---

## 27. Firestore security

Backend використовує Firebase Admin SDK.

Прямий client access до Firestore за замовчуванням заборонений:

```text
allow read, write: if false;
```

Admin frontend працює через REST API.

---

## 28. Seed data

Development seed має бути ідемпотентним.

Послуги:

```text
Масаж 60 хв
duration: 60
buffer: 15
price: 1500 UAH

Масаж 90 хв
duration: 90
buffer: 15
price: 2000 UAH
```

Графік:

```text
Monday-Friday 10:00-20:00
Saturday 11:00-17:00
Sunday closed
```

Production автоматично не seed-ити.

---

## 29. Testing

### 29.1. Domain

- slot generation;
- timezone conversion;
- working-hour calculations;
- buffer handling;
- schedule exceptions.

### 29.2. Booking

- successful booking;
- concurrent booking attempts;
- only one concurrent attempt succeeds;
- cancellation releases slots;
- rescheduling moves slots;
- failed rescheduling preserves original booking.

### 29.3. Availability

- normal slot;
- booking overlap;
- Google busy interval;
- schedule exception;
- closing-time boundary;
- buffer boundary;
- Europe/Kyiv timezone.

### 29.4. Telegram

- valid webhook secret;
- invalid webhook secret;
- duplicate update;
- `business_message` parsing;
- service cards with photo, caption entities, and URL buttons;
- card failure logs without blocking text reply.

### 29.5. Admin API

- authentication;
- authorization;
- critical booking actions;
- service catalog validation and protected image upload.

### 29.6. Frontend

Кілька ключових component/page tests через Vitest + React Testing Library, включно зі створенням/редагуванням послуги, caption formatting, photo selection, and Telegram card preview.

---

## 30. Logging та errors

Structured logging.

Допустимі context fields:

- request ID;
- Telegram update ID;
- booking ID;
- conversation ID.

Не логувати:

- API keys;
- bot tokens;
- refresh tokens;
- Authorization headers;
- webhook secret;
- зайвий sensitive user content.

Domain errors:

- `BookingConflictError`
- `BookingNotFoundError`
- `ServiceNotFoundError`
- `InvalidScheduleError`
- `CalendarSyncError`
- `UnauthorizedError`

Stack traces не повинні потрапляти користувачам.

---

## 31. Health endpoint

```text
GET /health
```

Повертає тільки базовий system status.

Не повинен показувати secrets або sensitive config.

---

## 32. Архітектурні принципи

```text
LLM розуміє мову.
Backend володіє бізнес-правилами.
Firestore забезпечує concurrency для booking.
Google Calendar дає додаткову інформацію про зайнятість.
Shared packages володіють contracts/domain logic.
Frontend ніколи не отримує backend secrets.
```

Уникати:

- business logic у controllers;
- Firestore calls напряму з React;
- duplicated DTO;
- magic strings;
- unvalidated LLM calls;
- unbounded conversation history;
- hardcoded production URLs;
- hardcoded Firebase project IDs;
- secrets у git.

---

## 33. Майбутні розширення

Архітектура повинна дозволяти у майбутньому:

- multiple therapists;
- multiple locations;
- payments;
- reminders;
- analytics;
- CRM;
- multiple businesses.

MVP залишається single-therapist / single-business.

Не потрібно передчасно реалізовувати multi-tenancy.

---

## 34. Reminder architecture

Повна reminder-система не входить у MVP.

Модель booking повинна дозволяти додати reminders через:

- Cloud Tasks;
- scheduled Firebase Functions.

---

## 35. Spec Driven Development

Цей файл є функціональним джерелом істини для проєкту.

Будь-яка зміна функціоналу повинна виконуватися в такому порядку:

1. Спочатку оновити `SPEC.md`.
2. За потреби оновити пов'язані документи в `docs/`.
3. Перевірити, чи зміна впливає на data model, contracts, API, tests або UI.
4. Лише після цього змінювати production code.
5. Додати або оновити тести відповідно до нової специфікації.
6. Переконатися, що реалізація відповідає актуальному `SPEC.md`.

Заборонено реалізовувати функціональну зміну, не відобразивши її попередньо у специфікації.

Якщо запит користувача суперечить поточній специфікації, агент повинен:

1. оновити специфікацію відповідно до нового запиту;
2. явно зберегти консистентність документа;
3. лише після цього реалізувати код.

`AGENTS.md` повинен явно містити це правило як обов'язковий workflow для всіх coding agents.

---

## 36. Definition of Done

Перед завершенням функціональної зміни повинні проходити:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Також перевірити:

- немає випадкових secrets;
- немає незавершеного MVP functionality;
- немає необґрунтованого `any`;
- немає hardcoded Firebase project IDs;
- contracts синхронізовані;
- `SPEC.md` відповідає реалізації.


## 37. Private OpenAI conversation test

- The allowed test sender (`TELEGRAM_ALLOWED_USERNAME`, currently `user61785`) can use both Telegram Business messages and private direct bot messages. Group messages, missing senders, other usernames, and edited updates are ignored before persistence or OpenAI calls. Existing manual takeover remains authoritative.
- Replace the fixed greeting with the OpenAI Responses API using `OPENAI_API_KEY` and `OPENAI_MODEL`. Use the separate system prompt, current UTC time and configured timezone, and at most the latest 20 stored messages. Store user/assistant text in Firestore; do not log message contents or credentials. Limit input to 4,000 characters, each API call to 15 seconds, total model time to 40 seconds, and each turn to four model requests. Failures produce a neutral retry message, never a false booking confirmation.
- Expose service lookup, availability, own bookings, creation, cancellation and rescheduling tools. Validate arguments with Zod. Bind client/chat/business connection identity on the server, never from model arguments. Reject access to another client's or chat's booking. Recheck future availability before create/reschedule; existing slot transactions prevent collisions.
- Mutating tools only prepare one pending action per conversation. Explain its details and require the user's exact `/confirm` command in a subsequent message. `/cancel` discards it. Pending actions expire after 15 minutes. Confirmation consumes the action before execution and revalidates identity and availability. A new request can replace the pending action. Only report success after persistence succeeds. An interrupted consumed action is not automatically retried; the user can inspect their bookings and start again.
- Persist bookings in the existing application Firestore database, independently of Google Calendar. No browser-local or instance-local booking storage. Do not automatically seed production data. Empty catalogs/schedules must be explained honestly.
- Admin Bookings shows service name (ID fallback), client ID, Kyiv date/time, status, booking ID and Calendar sync state, with loading/error/empty states, manual refresh and 15-second polling.
- Update claims provide at-most-once processing. An upstream failure after claiming does not replay mutations; the user can send a fresh message. Telegram delivery failure is logged without credentials. Webhook delivery is configured with one connection for the private test.


## 38. Telegram typing indicator

Before the assistant calls OpenAI, send `sendChatAction` with `action: "typing"`, carrying the current chat ID and `business_connection_id` when present. Refresh every four seconds during long requests because Telegram clears the status after five seconds or less. Stop refreshing as soon as the assistant returns or fails. Typing indicator failures are logged without credentials and must not block the assistant reply. Do not send typing to rejected users, duplicate updates, disabled conversations, or during human takeover.


## 39. Assistant response pacing

Wait `typingDelayPerSymbolMs` for each Unicode code point in each generated assistant reply before sending it to Telegram. The default is 600 ms; admins can configure 0–800 ms per symbol. Keep the typing indicator refreshed throughout this wait. Empty replies and non-LLM control messages do not incur this delay. Limit reply text to 4,000 characters; the maximum configured artificial wait is 53 minutes 20 seconds. Set the HTTPS function timeout to 3,600 seconds. Read delay and response pacing share this one-hour invocation budget; near-maximum read delays leave little time for generating and sending the reply.


## 40. Telegram Business read receipt

For an accepted `business_message`, wait a random integer number of milliseconds from 0 through `maxReadDelayMs` (inclusive; default 2,000 ms) before marking the incoming message as read, then begin the typing indicator and assistant response. Call Telegram Bot API `readBusinessMessage` with its `business_connection_id`, `chat_id`, and `message_id`. This requires the connected bot's `can_read_messages` right. If that right is unavailable or the API call fails, log a credential-free warning and continue answering. Do not call the method or add its delay for regular private bot DMs, rejected senders, duplicate updates, disabled conversations, or human takeover; the method only supports messages received through a Business connection.

The maximum configurable delay is 59 minutes. Telegram webhook requests must target the direct Cloud Function URL for this setting: Firebase Hosting rewrites time out at 60 seconds, even when the function allows longer requests. The function's HTTP timeout is configured to 3,600 seconds. A long delay keeps the webhook request open and may queue later updates; preserve update idempotency so Telegram retries do not start duplicate assistant work. The assistant response and configured typing pace also consume this one-hour invocation budget after the read delay.

## 41. Telegram service cards

When the assistant uses `get_services`, deliver one card per returned enabled service after the assistant's text response. A card uses `sendPhoto` with caption/entities when `photoUrl` is set, otherwise `sendMessage`; attach configured inline URL buttons to that card. Use `telegramCaption.text` and its Telegram `entities` when customized, otherwise compose a plain caption from the service's name, plain description, duration, and price. Service captions remain within Telegram's 1,024-character photo-caption limit; text-only cards remain within 4,096 characters. Include `business_connection_id` for Business replies. Card delivery failures are logged without credentials and must not prevent remaining cards or normal conversation persistence.
