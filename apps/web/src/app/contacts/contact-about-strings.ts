/**
 * Рядки блоку «Про контакт» + додаткові телефони.
 * v2 → UK (§28.10); інакше залишаємо попередні змішані рядки для legacy.
 */
export type ContactAboutBlockStrings = {
  loading: string;
  notFound: string;
  lastVisit: string;
  noVisits: string;
  scheduleVisit: string;
  telegramConnected: string;
  openTelegramChat: string;
  telegramNotLinked: string;
  fieldFirstName: string;
  fieldLastName: string;
  fieldPhone: string;
  fieldPhonePrimary: string;
  fieldEmail: string;
  fieldPosition: string;
  fieldExternalCode: string;
  fieldDocumentDisplayName: string;
  fieldRegion: string;
  fieldAddressInfo: string;
  fieldCity: string;
  fieldClientType: string;
  fieldStatus: string;
  fieldAddress: string;
  placeholderClickAdd: string;
  placeholderDocumentName: string;
  placeholderDash: string;
  clientTypeDoctor: string;
  clientTypeTech: string;
  addressRequiredForVisit: string;
  placeholderStreetCity: string;
  searchingAddresses: string;
  searchingCoords: string;
  addressGoogle: string;
  addressGeocoded: string;
  addressManual: string;
  mapsScriptFailed: string;
  coordsSet: string;
  coordsUnset: string;
  mapHide: string;
  mapShow: string;
  responsibleManager: string;
  placeholderNotAssigned: string;
  company: string;
  placeholderNoCompany: string;
  openCompany: string;
  createCompany: string;
  created: string;
  updated: string;
  /** Create flow (new contact) */
  createFirstName: string;
  createLastName: string;
  createPhone: string;
  createEmail: string;
  createPosition: string;
  createExternalCode: string;
  createExternalCodePh: string;
  createAddressInfoPh: string;
  createCityPh: string;
  placeholderJohn: string;
  placeholderDoe: string;
  placeholderPhone: string;
  placeholderEmail: string;
  placeholderManager: string;
};

export type ContactPhonesSectionStrings = {
  enterPhone: string;
  errorGeneric: string;
  additionalPhones: string;
  setPrimary: string;
  remove: string;
  addNumber: string;
  phonePlaceholder: string;
  labelPlaceholder: string;
  cancel: string;
  saving: string;
  add: string;
};

const aboutUk: ContactAboutBlockStrings = {
  loading: "Завантаження…",
  notFound: "Не знайдено",
  lastVisit: "Останній візит",
  noVisits: "Немає візитів",
  scheduleVisit: "Запланувати візит",
  telegramConnected: "Telegram підключено",
  openTelegramChat: "Відкрити чат у Telegram",
  telegramNotLinked: "Telegram не підключено",
  fieldFirstName: "Ім'я",
  fieldLastName: "Прізвище",
  fieldPhone: "Телефон",
  fieldPhonePrimary: "Телефон (основний)",
  fieldEmail: "Email",
  fieldPosition: "Посада",
  fieldExternalCode: "Код 1С",
  fieldDocumentDisplayName: "Як виводити на документ",
  fieldRegion: "Область",
  fieldAddressInfo: "Адреса (інфо)",
  fieldCity: "Місто",
  fieldClientType: "Тип клієнта",
  fieldStatus: "Статус",
  fieldAddress: "Адреса",
  placeholderClickAdd: "Натисніть, щоб додати…",
  placeholderDocumentName: "Напр. ФОП Петров П.",
  placeholderDash: "—",
  clientTypeDoctor: "Лікар",
  clientTypeTech: "Технік",
  addressRequiredForVisit: "Вкажіть адресу для планування візитів",
  placeholderStreetCity: "Вулиця, місто, індекс",
  searchingAddresses: "Пошук адрес…",
  searchingCoords: "Пошук координат за адресою…",
  addressGoogle: "Адресу обрано в Google (Places API New)",
  addressGeocoded: "Координати за адресою оновлено",
  addressManual: "Мітку змінено вручну",
  mapsScriptFailed: "Не вдалося завантажити скрипт Google Maps.",
  coordsSet: "Координати задано",
  coordsUnset: "Координати не задано",
  mapHide: "Сховати карту",
  mapShow: "Показати карту",
  responsibleManager: "Відповідальний менеджер",
  placeholderNotAssigned: "— Не призначено",
  company: "Компанія",
  placeholderNoCompany: "— Без компанії",
  openCompany: "Відкрити компанію",
  createCompany: "Створити компанію",
  created: "Створено",
  updated: "Оновлено",
  createFirstName: "Ім'я",
  createLastName: "Прізвище",
  createPhone: "Телефон",
  createEmail: "Email",
  createPosition: "Посада",
  createExternalCode: "Код 1С",
  createExternalCodePh: "Код 1С",
  createAddressInfoPh: "Адреса (інфо)",
  createCityPh: "Місто",
  placeholderJohn: "Іван",
  placeholderDoe: "Петренко",
  placeholderPhone: "+380…",
  placeholderEmail: "name@company.ua",
  placeholderManager: "Менеджер",
};

const aboutLegacy: ContactAboutBlockStrings = {
  loading: "Loading…",
  notFound: "Not found",
  lastVisit: "Last visit",
  noVisits: "Нет визитов",
  scheduleVisit: "Запланировать встречу",
  telegramConnected: "Telegram подключен",
  openTelegramChat: "Открыть Telegram чат",
  telegramNotLinked: "Telegram не подключен",
  fieldFirstName: "First name",
  fieldLastName: "Last name",
  fieldPhone: "Phone",
  fieldPhonePrimary: "Phone (основной)",
  fieldEmail: "Email",
  fieldPosition: "Position",
  fieldExternalCode: "КОД 1С",
  fieldDocumentDisplayName: "Як виводити на документ",
  fieldRegion: "Область",
  fieldAddressInfo: "Адрес (инфо)",
  fieldCity: "Город",
  fieldClientType: "Тип клиента",
  fieldStatus: "Статус",
  fieldAddress: "Address",
  placeholderClickAdd: "Click to add…",
  placeholderDocumentName: "Напр. ФОП Петров Петр",
  placeholderDash: "—",
  clientTypeDoctor: "Врач",
  clientTypeTech: "Техник",
  addressRequiredForVisit: "Заполните адрес для планирования встреч",
  placeholderStreetCity: "Street, city, index",
  searchingAddresses: "Searching addresses…",
  searchingCoords: "Searching coordinates from address…",
  addressGoogle: "Address selected from Google (Places API New)",
  addressGeocoded: "Address coordinates updated",
  addressManual: "Pin adjusted manually",
  mapsScriptFailed: "Google Maps script failed to load.",
  coordsSet: "Координаты установлены",
  coordsUnset: "Координаты не заданы",
  mapHide: "Скрыть карту",
  mapShow: "Показать карту",
  responsibleManager: "Responsible manager",
  placeholderNotAssigned: "— Not assigned",
  company: "Company",
  placeholderNoCompany: "— No company",
  openCompany: "Open company",
  createCompany: "Create company",
  created: "Created",
  updated: "Updated",
  createFirstName: "First name",
  createLastName: "Last name",
  createPhone: "Phone",
  createEmail: "Email",
  createPosition: "Position",
  createExternalCode: "КОД 1С",
  createExternalCodePh: "Код 1С",
  createAddressInfoPh: "Адрес (инфо)",
  createCityPh: "Город",
  placeholderJohn: "John",
  placeholderDoe: "Doe",
  placeholderPhone: "+1…",
  placeholderEmail: "john@example.com",
  placeholderManager: "Manager",
};

const phonesUk: ContactPhonesSectionStrings = {
  enterPhone: "Введіть номер",
  errorGeneric: "Помилка",
  additionalPhones: "Додаткові номери",
  setPrimary: "Зробити основним",
  remove: "Видалити",
  addNumber: "+ Додати номер",
  phonePlaceholder: "Номер телефону",
  labelPlaceholder: "Мітка (моб., робочий…)",
  cancel: "Скасувати",
  saving: "Збереження…",
  add: "Додати",
};

const phonesLegacy: ContactPhonesSectionStrings = {
  enterPhone: "Введите номер",
  errorGeneric: "Ошибка",
  additionalPhones: "Доп. номера",
  setPrimary: "Сделать основным",
  remove: "Удалить",
  addNumber: "+ Добавить номер",
  phonePlaceholder: "Номер телефона",
  labelPlaceholder: "Метка (моб., рабочий…)",
  cancel: "Отмена",
  saving: "Сохранение…",
  add: "Добавить",
};

export function getContactAboutStrings(v2: boolean): ContactAboutBlockStrings {
  return v2 ? aboutUk : aboutLegacy;
}

export function getContactPhonesSectionStrings(v2: boolean): ContactPhonesSectionStrings {
  return v2 ? phonesUk : phonesLegacy;
}
