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
```

Допускаються додаткові internal collections за обґрунтованої потреби.

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
- зміну buffer.

Негативні ціни та некоректна тривалість заборонені.

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
- доступ лише для allowlisted UID.

Environment:

```text
ADMIN_UIDS=uid1,uid2
```

Frontend route guard не є достатнім захистом.

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
- buffer.

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

GET    /admin/schedule
PUT    /admin/schedule

GET    /admin/schedule-exceptions
POST   /admin/schedule-exceptions
PATCH  /admin/schedule-exceptions/:id
DELETE /admin/schedule-exceptions/:id

GET    /admin/conversations
PATCH  /admin/conversations/:id

GET    /admin/dashboard

GET    /health
```

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
- `business_message` parsing.

### 29.5. Admin API

- authentication;
- authorization;
- critical booking actions.

### 29.6. Frontend

Кілька ключових component/page tests через Vitest + React Testing Library.

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
