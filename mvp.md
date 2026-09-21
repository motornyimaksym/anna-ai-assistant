# Telegram Booking Assistant — MVP

## 1. Мета

Асистент працює через **Telegram Business account** і відповідає клієнтам від імені звичайного Telegram-акаунта.

Основні сценарії:

* дізнатися про послуги;
* дізнатися ціну;
* знайти вільний час;
* записатися;
* перенести запис;
* скасувати запис;
* запитати адресу / умови / тривалість;
* передати діалог людині, якщо бот не справляється.

Telegram Bot API підтримує Business Connections і дозволяє надсилати повідомлення через `business_connection_id` від імені підключеного business-акаунта.

---

# 2. Стек

```text
TypeScript
Node.js 22
NestJS
Firebase Functions 2nd gen
Firestore
Firebase Secret Manager
Google Calendar API
OpenAI API
Telegram Bot API
```

Деплой:

```text
Firebase
   └── Cloud Functions 2nd gen
          └── NestJS application
```

Firebase Functions 2nd gen побудовані поверх Cloud Run і рекомендовані Firebase для нових функцій.

---

# 3. Загальна архітектура

```text
                    Telegram
                        │
                        │ business_message
                        ▼
               Telegram Webhook
                        │
                        ▼
              ┌─────────────────┐
              │    NestJS API    │
              └────────┬────────┘
                       │
          ┌────────────┼─────────────┐
          ▼            ▼             ▼
    Conversation    Booking       Telegram
      Service       Service       Service
          │            │
          ▼            ├───────────┐
     OpenAI API        ▼           ▼
                   Firestore   Google Calendar
```

Firebase матиме одну HTTP function:

```text
telegramWebhook
```

Наприклад:

```text
POST
https://europe-west1-project.cloudfunctions.net/telegramWebhook
```

Telegram викликатиме її для кожного нового повідомлення.

Webhook захищаємо через `secret_token`. Telegram у такому випадку надсилає секрет у заголовку:

```text
X-Telegram-Bot-Api-Secret-Token
```

---

# 4. NestJS структура

```text
src/
├── main.ts
├── app.module.ts
│
├── telegram/
│   ├── telegram.module.ts
│   ├── telegram.controller.ts
│   ├── telegram.service.ts
│   ├── telegram.types.ts
│   └── telegram.guard.ts
│
├── assistant/
│   ├── assistant.module.ts
│   ├── assistant.service.ts
│   ├── assistant.prompt.ts
│   └── assistant.tools.ts
│
├── booking/
│   ├── booking.module.ts
│   ├── booking.service.ts
│   ├── availability.service.ts
│   └── booking.types.ts
│
├── calendar/
│   ├── calendar.module.ts
│   └── google-calendar.service.ts
│
├── clients/
│   ├── clients.module.ts
│   └── clients.service.ts
│
├── conversations/
│   ├── conversations.module.ts
│   └── conversations.service.ts
│
├── services/
│   ├── services.module.ts
│   └── services.service.ts
│
├── firebase/
│   ├── firebase.module.ts
│   └── firestore.service.ts
│
└── common/
    ├── date/
    ├── errors/
    └── utils/
```

---

# 5. Firestore

## `services`

```json
{
  "id": "massage-60",
  "name": "Масаж 60 хв",
  "description": "Класичний масаж",
  "durationMinutes": 60,
  "bufferMinutes": 15,
  "price": 1500,
  "currency": "UAH",
  "enabled": true
}
```

Наприклад:

```text
services/massage-60
services/massage-90
```

---

# 6. Робочий графік

Колекція:

```text
availabilityRules/
```

Документ:

```json
{
  "dayOfWeek": 1,
  "start": "10:00",
  "end": "20:00",
  "enabled": true
}
```

Наприклад:

```text
Monday    10:00–20:00
Tuesday   10:00–20:00
Wednesday 10:00–20:00
Thursday  10:00–20:00
Friday    10:00–20:00
Saturday  11:00–17:00
Sunday    CLOSED
```

Окремо можна мати:

```text
scheduleExceptions/
```

для:

```text
відпустки
лікарняні
особливі робочі дні
вихідні
```

---

# 7. Client

```text
clients/{telegramUserId}
```

```json
{
  "telegramUserId": "123456",
  "username": "anna",
  "firstName": "Анна",
  "lastName": null,
  "phone": null,
  "createdAt": "...",
  "updatedAt": "..."
}
```

---

# 8. Booking

```text
bookings/{bookingId}
```

```json
{
  "clientId": "123456",
  "serviceId": "massage-60",

  "startAt": "2026-09-25T18:30:00+03:00",
  "endAt": "2026-09-25T19:30:00+03:00",

  "status": "confirmed",

  "telegramChatId": "123456",
  "businessConnectionId": "...",

  "googleCalendarEventId": "...",

  "createdAt": "...",
  "updatedAt": "..."
}
```

Status:

```text
pending
confirmed
cancelled
completed
no_show
```

---

# 9. Захист від подвійного запису

Оце важлива частина.

Я б не робив просто:

```text
SELECT bookings WHERE...
```

і потім:

```text
CREATE booking
```

Бо два запити можуть одночасно побачити один і той самий вільний час.

Замість цього розбиваємо день на, наприклад, **15-хвилинні атомарні слоти**.

Запис:

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

Firestore:

```text
bookingSlots/
```

IDs:

```text
2026-09-25_18-30
2026-09-25_18-45
2026-09-25_19-00
2026-09-25_19-15
```

У Firestore transaction:

```text
1. прочитати всі slots
2. переконатися, що їх немає
3. створити booking
4. створити всі slot documents
5. commit
```

Якщо двоє клієнтів одночасно виберуть 18:30, один transaction програє.

---

# 10. Google Calendar

Google Calendar буде додатковим джерелом зайнятості.

Для пошуку зайнятого часу використовуємо:

```text
freeBusy.query()
```

Google повертає інтервали:

```json
{
  "busy": [
    {
      "start": "2026-09-25T14:00:00+03:00",
      "end": "2026-09-25T15:30:00+03:00"
    }
  ]
}
```

Офіційний Calendar API має окремий `freeBusy` endpoint саме для цього.

Після запису:

```text
events.insert()
```

і створюємо:

```text
Масаж — Анна

25.09.2026
18:30–19:30

Telegram: @anna
Booking: #7f8a...
```

Calendar API офіційно підтримує створення events через `events.insert`.

---

# 11. Алгоритм пошуку вільного часу

Наприклад клієнт пише:

```text
Хочу в четвер після 17
```

LLM визначає:

```json
{
  "intent": "find_slots",
  "date": "2026-09-24",
  "after": "17:00"
}
```

Backend:

```text
working schedule
        ↓
17:00–20:00
        ↓
Google Calendar busy intervals
        ↓
existing bookings
        ↓
service duration = 60 min
        ↓
buffer = 15 min
        ↓
available slots
```

Результат:

```json
[
  "17:15",
  "18:30",
  "19:45"
]
```

А вже AI відповідає:

```text
У четвер можу запропонувати 17:15 або 18:30 🙂
Який час тобі зручніший?
```

---

# 12. OpenAI

Модель не повинна сама створювати записи.

Вона має отримати набір tools.

## `get_services`

```json
{
  "name": "get_services",
  "description": "Return available services"
}
```

## `get_available_slots`

```json
{
  "name": "get_available_slots",
  "parameters": {
    "serviceId": "string",
    "date": "YYYY-MM-DD",
    "after": "HH:mm",
    "before": "HH:mm"
  }
}
```

## `create_booking`

```json
{
  "name": "create_booking",
  "parameters": {
    "serviceId": "string",
    "startAt": "ISO_DATE"
  }
}
```

## `get_bookings`

```json
{
  "name": "get_bookings"
}
```

## `cancel_booking`

```json
{
  "name": "cancel_booking",
  "parameters": {
    "bookingId": "string"
  }
}
```

## `reschedule_booking`

```json
{
  "name": "reschedule_booking",
  "parameters": {
    "bookingId": "string",
    "newStartAt": "ISO_DATE"
  }
}
```

---

# 13. System prompt

Приблизно:

```text
You are a booking assistant for a massage therapist.

Your task is to help clients:
- learn about services
- find available appointment times
- create bookings
- cancel bookings
- reschedule bookings

Never invent availability.

Always call get_available_slots before offering a specific time.

Never tell a client that a booking is confirmed until
create_booking returns success.

Use Ukrainian by default.
Reply in the language used by the client.

Be friendly, concise and natural.

Do not mention that you are an AI unless directly asked.
```

Останнє правило можна потім обговорити окремо з точки зору UX/прозорості.

---

# 14. Conversation

```text
conversations/{telegramChatId}
```

```json
{
  "telegramChatId": "123456",
  "clientId": "123456",

  "assistantEnabled": true,

  "state": {
    "selectedService": "massage-60",
    "requestedDate": "2026-09-25"
  },

  "summary": "Client wants a 60-minute massage Thursday evening.",

  "humanTakeoverUntil": null,

  "updatedAt": "..."
}
```

Не треба кожного разу відправляти LLM всю історію за рік.

Наприклад:

```text
system prompt
conversation summary
last 10–20 messages
```

---

# 15. Human takeover

Дуже хочу одразу це передбачити.

Наприклад власниця акаунта сама відповіла клієнту.

Тоді:

```text
assistantEnabled = false
```

або:

```text
humanTakeoverUntil =
2026-09-22T14:00:00
```

Бот мовчить.

Після певного часу можна автоматично повернути його в роботу.

Так бот не почне паралельно сперечатися з власником акаунта :)

---

# 16. Telegram webhook

Основний endpoint:

```text
POST /telegram/webhook
```

Обробляємо:

```text
business_connection
business_message
edited_business_message
deleted_business_messages
```

Business API має відповідні update types та `business_connection_id`.

Алгоритм:

```text
 Telegram update
       ↓
validate webhook secret
       ↓
check updateId idempotency
       ↓
extract business message
       ↓
find/create Client
       ↓
load Conversation
       ↓
send context to OpenAI
       ↓
execute requested tool
       ↓
generate response
       ↓
Telegram sendMessage(
    business_connection_id
)
```

---

# 17. Idempotency

Telegram може повторно доставити webhook, якщо сервер вчасно не відповів.

Тому:

```text
telegramUpdates/{updateId}
```

Перед обробкою:

```text
if updateId exists:
    return 200
```

Після прийняття:

```text
create telegramUpdates/updateId
```

---

# 18. Нагадування

MVP v1.1:

```text
за 24 години
за 2 години
```

Для цього можемо використати:

```text
Cloud Tasks
```

або Firebase scheduled functions.

Наприклад:

```text
Привіт 🙂 Нагадую про запис завтра о 18:30.

Масаж 60 хв.
Якщо плани змінилися — напиши мені.
```

---

# 19. Secrets

Нічого такого:

```env
TELEGRAM_BOT_TOKEN=
OPENAI_API_KEY=
GOOGLE_REFRESH_TOKEN=
```

не повинно зберігатися в git.

У Firebase використовуємо secrets.

Локально:

```text
.env.local
```

Прод:

```text
Firebase / Google Secret Manager
```

---

# 20. Firebase

Структура репозиторію:

```text
telegram-booking-assistant/
│
├── functions/
│   ├── src/
│   ├── package.json
│   └── tsconfig.json
│
├── firestore.rules
├── firestore.indexes.json
├── firebase.json
├── .firebaserc
├── .gitignore
└── README.md
```

Firebase CLI:

```bash
npm install -g firebase-tools

firebase login

firebase init
```

Вибираємо:

```text
Functions
Firestore
Emulators
```

Functions:

```text
TypeScript
Node 22
```

Firebase офіційно підтримує Node.js 20 і 22 для Cloud Functions.

---

# 21. Локальна розробка

```bash
firebase emulators:start
```

Для Telegram локально можемо використовувати:

```text
ngrok
```

або:

```text
Cloudflare Tunnel
```

і поставити тимчасовий webhook:

```text
Telegram
   ↓
https://xxxx.ngrok.app
   ↓
localhost
```

---

# 22. Production deployment

У підсумку буде приблизно:

```bash
npm run build

firebase deploy --only functions
```

Після deploy отримуємо URL:

```text
https://europe-west1-xxx.cloudfunctions.net/telegramWebhook
```

і реєструємо його через Telegram:

```text
setWebhook
```

з:

```text
url
secret_token
allowed_updates
```

Telegram вимагає HTTPS webhook і підтримує `secret_token` для його перевірки.

---

# 23. MVP scope

### V1

```text
Telegram Business messages
OpenAI assistant
Services
Working schedule
Google Calendar busy check
Find slots
Create booking
Cancel booking
Reschedule booking
Firestore
Human takeover
```

### V1.1

```text
reminders
admin commands
conversation summary
blacklist
analytics
```

### V2

```text
payments
multiple therapists
multiple locations
CRM
web admin panel
statistics
automatic follow-ups
client segmentation
```

---

# 24. Перший end-to-end сценарій

```text
CLIENT:
Привіт, хочу записатися на масаж

BOT:
Привіт 🙂
Є масаж на 60 та 90 хвилин.
Який тебе цікавить?

CLIENT:
60

BOT:
На який день хочеш?

CLIENT:
На четвер після 18

        ↓

AI:
get_available_slots(
  service="massage-60",
  date="2026-09-24",
  after="18:00"
)

        ↓

BACKEND:
["18:30", "20:00"]

        ↓

BOT:
У четвер є 18:30 та 20:00.
Що зручніше?

CLIENT:
18:30

        ↓

AI:
create_booking(
  service="massage-60",
  start="2026-09-24T18:30:00+03:00"
)

        ↓

Firestore transaction
Google Calendar event
        ↓

SUCCESS

        ↓

BOT:
Готово 🙂
Записала тебе на четвер, 24 вересня,
о 18:30 на 60 хвилин.

За день до запису нагадаю.
```

---

# 25. Головний принцип

LLM відповідає за:

```text
розуміння природної мови
контекст діалогу
формулювання відповіді
```

Backend відповідає за:

```text
дати
час
ціни
послуги
наявність слотів
створення запису
скасування
перенесення
Google Calendar
```

Тобто:

```text
AI = мозок діалогу

Backend = джерело істини
```

Саме так я б будував першу версію.

