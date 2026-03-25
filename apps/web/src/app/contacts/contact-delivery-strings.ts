/** Профілі доставки в модалці контакта: v2 → UK, інакше EN. */

export type DeliveryUiStrings = {
  saveFirst: string;
  loading: string;
  sectionTitle: string;
  addProfile: string;
  noProfiles: string;
  defaultBadge: string;
  unnamed: string;
  editTitle: string;
  deleteTitle: string;
  deleteConfirm: (label: string) => string;
  modalTitleAdd: string;
  modalTitleEdit: string;
  errLabelRequired: string;
  errSelectCity: string;
  errSelectWarehouse: string;
  errFailedSave: string;
  labelField: string;
  labelPlaceholder: string;
  recipientType: string;
  recipientPerson: string;
  recipientCompany: string;
  deliveryType: string;
  warehouse: string;
  postomat: string;
  address: string;
  firstName: string;
  lastName: string;
  phone: string;
  cityFromDirectory: string;
  cityPlaceholder: string;
  warehouseFromDirectory: string;
  postomatFromDirectory: string;
  warehousePlaceholder: string;
  cancel: string;
  submitAdd: string;
  submitEdit: string;
  saving: string;
};

const uk: DeliveryUiStrings = {
  saveFirst: "Збережіть контакт, щоб керувати профілями доставки.",
  loading: "Завантаження…",
  sectionTitle: "Профілі доставки",
  addProfile: "Додати профіль",
  noProfiles: "Поки немає профілів доставки.",
  defaultBadge: "За замовчуванням",
  unnamed: "Без назви",
  editTitle: "Редагувати",
  deleteTitle: "Видалити",
  deleteConfirm: (label) => `Видалити профіль «${label}»?`,
  modalTitleAdd: "Новий профіль доставки",
  modalTitleEdit: "Редагувати профіль доставки",
  errLabelRequired: "Вкажіть назву профілю.",
  errSelectCity: "Оберіть місто з довідника.",
  errSelectWarehouse: "Оберіть відділення з довідника.",
  errFailedSave: "Не вдалося зберегти профіль",
  labelField: "Назва *",
  labelPlaceholder: "Напр. дім, офіс",
  recipientType: "Тип одержувача",
  recipientPerson: "Фізособа",
  recipientCompany: "Компанія",
  deliveryType: "Тип доставки",
  warehouse: "Відділення",
  postomat: "Поштомат",
  address: "Адреса",
  firstName: "Ім'я",
  lastName: "Прізвище",
  phone: "Телефон",
  cityFromDirectory: "Місто (з довідника)",
  cityPlaceholder: "Введіть щонайменше 2 символи…",
  warehouseFromDirectory: "Відділення (з довідника)",
  postomatFromDirectory: "Поштомат (з довідника)",
  warehousePlaceholder: "Пошук…",
  cancel: "Скасувати",
  submitAdd: "Додати профіль",
  submitEdit: "Зберегти",
  saving: "Збереження…",
};

const en: DeliveryUiStrings = {
  saveFirst: "Save the contact first to see delivery profiles.",
  loading: "Loading…",
  sectionTitle: "Delivery profiles",
  addProfile: "Add profile",
  noProfiles: "No delivery profiles yet.",
  defaultBadge: "Default",
  unnamed: "Unnamed",
  editTitle: "Edit",
  deleteTitle: "Delete",
  deleteConfirm: (label) => `Delete profile "${label}"?`,
  modalTitleAdd: "Add delivery profile",
  modalTitleEdit: "Edit delivery profile",
  errLabelRequired: "Label is required.",
  errSelectCity: "Select a city from the directory.",
  errSelectWarehouse: "Select a warehouse from the directory.",
  errFailedSave: "Failed to create profile",
  labelField: "Label *",
  labelPlaceholder: "e.g. Home, Office",
  recipientType: "Recipient type",
  recipientPerson: "Person",
  recipientCompany: "Company",
  deliveryType: "Delivery type",
  warehouse: "Warehouse",
  postomat: "Postomat",
  address: "Address",
  firstName: "First name",
  lastName: "Last name",
  phone: "Phone",
  cityFromDirectory: "City (from directory)",
  cityPlaceholder: "Type at least 2 characters…",
  warehouseFromDirectory: "Warehouse (from directory)",
  postomatFromDirectory: "Postomat (from directory)",
  warehousePlaceholder: "Type to search…",
  cancel: "Cancel",
  submitAdd: "Add profile",
  submitEdit: "Save",
  saving: "Saving…",
};

export function getDeliveryUiStrings(v2: boolean): DeliveryUiStrings {
  return v2 ? uk : en;
}
