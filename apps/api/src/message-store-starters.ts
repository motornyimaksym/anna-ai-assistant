/** Reviewed, exact owner-authored starter replies selected from the 2026-10-06 Telegram export. */
export const MESSAGE_STORE_STARTERS = [
  {
    "id": "starter-first-visit-deposit",
    "description": "Question about the first-visit booking deposit. Use only when client is booking a first visit; 500 UAH deposit counts toward session total.",
    "text": "Нових клієнтів я записую з бронюванням 500 грн 🤍\nЦе спосіб зафіксувати ваш запис і бути впевненою, що домовленість залишається в силі.\n\nСума бронювання входить у вартість масажу, тобто під час сеансу ці 500 грн віднімаються від загальної вартості.\n\nЯкщо вам усе підходить і ви точно будете в цей час - надішліть мені скрін оплати. Після цього час остаточно закріплюється за вами😌",
    "entities": [
      {
        "type": "bold",
        "offset": 39,
        "length": 7
      },
      {
        "type": "bold",
        "offset": 137,
        "length": 41
      }
    ],
    "enabled": true
  },
  {
    "id": "starter-public-location",
    "description": "Question about general location before booking. Shares public street only; do not use for exact address or entry instructions.",
    "text": "Приймаю по вул Генерала Юнаківа",
    "entities": [],
    "enabled": true
  },
  {
    "id": "starter-confirmed-directions",
    "description": "Client with a confirmed appointment asks for exact address or arrival directions. Verify current booking before sending.",
    "text": "Адреса: Львів, вул. Генерала Юнаківа 9В\n\nВхід у двір між двома продуктовими магазинами навпроти львівської майстерні шоколаду. Парковка у дворі тільки для мешканців, тому якщо ви на машині, то треба поруч  її залишити)",
    "entities": [],
    "enabled": true
  }
] as const;
