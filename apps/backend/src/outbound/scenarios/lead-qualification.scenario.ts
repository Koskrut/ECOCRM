import type { ScenarioDefinition } from "./scenario.types";

export const LEAD_QUALIFICATION_SCENARIO_VERSION = "1.0.0";

export const leadQualificationScenario: ScenarioDefinition = {
  code: "LEAD_QUALIFICATION",
  version: LEAD_QUALIFICATION_SCENARIO_VERSION,
  name: "Lead qualification",
  nameUk: "Кваліфікація ліда",
  goal: "Qualify relevance, need, readiness for a human manager, and next step.",
  goalUk: "Зʼясувати релевантність, потребу, готовність до менеджера та наступний крок.",
  targetSegment: "New or warm leads with a valid phone number.",
  targetSegmentUk: "Нові або теплі ліди з валідним телефоном.",
  entryConditionsSummary:
    "Lead status not terminal (e.g. not LOST/SPAM unless business overrides); phone present; not opted out.",
  entryConditionsSummaryUk:
    "Статус ліда не фінальний; є телефон; без відмови від дзвінків (якщо політика ввімкнена).",
  requiredContextKeys: [
    "lead.displayName",
    "lead.phone",
    "lead.status",
    "lead.source",
    "lead.message",
    "lead.city",
    "lead.ownerName",
    "company.name",
  ],
  openings: [
    "Brief intro, state purpose of the call, ask if now is a good time.",
    "Alternative: shorter intro if the lead came from a specific campaign (use source in context).",
  ],
  openingsUk: [
    "Коротке представлення, мета дзвінка, чи зручно зараз говорити.",
    "Альтернатива: коротший вступ з урахуванням джерела ліда з контексту.",
  ],
  qualificationQuestions: [
    "What does the contact or company do?",
    "What are they looking for (product/category)?",
    "Timeline for purchase or decision?",
    "Volume or frequency if relevant?",
    "Who makes the decision?",
    "Preferred follow-up channel (call, messenger, email)?",
    "Any objections or blockers?",
  ],
  qualificationQuestionsUk: [
    "Чим займається контакт або компанія?",
    "Що саме цікавить (продукт/категорія)?",
    "Які орієнтовні терміни рішення/закупівлі?",
    "Обсяг або частота, якщо доречно?",
    "Хто приймає рішення?",
    "Зручний канал для продовження (дзвінок, месенджер, email)?",
    "Є заперечення або обмеження?",
  ],
  branchLogicSummary:
    "If not interested → neutral/failed path. If interested but timing bad → schedule callback. If high intent or requests human → handoff.",
  branchLogicSummaryUk:
    "Немає інтересу → нейтрально/відмова. Є інтерес, але не зараз → колбек. Високий інтерес або запит людини → передача менеджеру.",
  objectionHandlingSummary:
    "Acknowledge, do not argue; offer facts only from CRM context; never invent prices or guarantees.",
  objectionHandlingSummaryUk:
    "Визнати заперечення, не сперечатися; факти лише з контексту CRM; не вигадувати ціни чи гарантії.",
  allowedActions: [
    "Offer to connect with a manager.",
    "Offer to send catalog/price list if aligned with business policy.",
    "Schedule a callback time window.",
  ],
  allowedActionsUk: [
    "Запропонувати зʼєднання з менеджером.",
    "Запропонувати каталог/прайс, якщо це дозволено політикою.",
    "Запропонувати колбек у зрубний час.",
  ],
  forbiddenClaims: [
    "Specific discounts or prices not in CRM.",
    "Delivery dates or stock guarantees.",
    "Legal or medical claims about products.",
  ],
  forbiddenClaimsUk: [
    "Знижки чи ціни, яких немає в CRM.",
    "Гарантії термінів доставки чи наявності.",
    "Юридичні або медичні твердження про продукти.",
  ],
  escalationRules: [
    "Escalate to human if the lead explicitly asks for a person or manager.",
    "Escalate if qualification score is high per captured field rules.",
  ],
  escalationRulesUk: [
    "Передати людині, якщо лід явно просить менеджера.",
    "Передати при високій оцінці кваліфікації за правилами полів.",
  ],
  successOutcomes: ["Qualified, ready for manager", "Qualified, materials accepted"],
  neutralOutcomes: ["Callback later", "Needs materials only", "Low priority follow-up"],
  failedOutcomes: ["Not a fit", "Refused", "No answer", "Wrong number"],
  captureFields: [
    { key: "need_summary", label: "Need summary", labelUk: "Коротко про потребу", type: "string" },
    {
      key: "product_interest",
      label: "Product interest",
      labelUk: "Інтерес до продукту/категорії",
      type: "string",
    },
    { key: "timeline", label: "Timeline", labelUk: "Терміни", type: "string" },
    { key: "decision_maker", label: "Decision maker", labelUk: "ЛПР", type: "string" },
    {
      key: "callback_preference",
      label: "Callback preference",
      labelUk: "Бажаний канал/час",
      type: "string",
    },
    {
      key: "objection_type",
      label: "Objection type",
      labelUk: "Тип заперечення",
      type: "enum",
      enumValues: ["price", "timing", "competitor", "no_need", "other"],
    },
    {
      key: "qualification_score",
      label: "Qualification score 1-5",
      labelUk: "Оцінка кваліфікації 1-5",
      type: "number",
    },
  ],
  outcomeMappings: [
    {
      outcomeKey: "QUALIFIED_MANAGER_HANDOFF",
      description: "High intent or explicit request for human",
      crm: {
        bucket: "HANDOFF",
        createActivityComment: true,
        activityTitleTemplate: "AI дзвінок: кваліфікація — передача менеджеру",
        createFollowUpTask: true,
        taskTitleTemplate: "Передзвонити ліду (після AI-кваліфікації)",
        taskBodyTemplate: "Лід готовий до менеджера. Перегляньте підсумок у активності.",
        taskDueHoursFromNow: 4,
        assignTaskToLeadOwner: true,
        assignTaskToContactOwner: false,
        assignTaskToCampaignDefault: true,
        appendLeadEventNote: true,
      },
    },
    {
      outcomeKey: "QUALIFIED_MATERIALS",
      description: "Wants catalog/price only",
      crm: {
        bucket: "SUCCESS",
        createActivityComment: true,
        activityTitleTemplate: "AI дзвінок: кваліфікація — матеріали",
        createFollowUpTask: true,
        taskTitleTemplate: "Надіслати матеріали ліду",
        taskDueHoursFromNow: 24,
        assignTaskToLeadOwner: true,
        assignTaskToContactOwner: false,
        assignTaskToCampaignDefault: true,
        appendLeadEventNote: true,
      },
    },
    {
      outcomeKey: "NEUTRAL_CALLBACK",
      description: "Interested but later",
      crm: {
        bucket: "NEUTRAL",
        createActivityComment: true,
        activityTitleTemplate: "AI дзвінок: кваліфікація — колбек пізніше",
        createFollowUpTask: true,
        taskTitleTemplate: "Повторний контакт з лідом",
        taskDueHoursFromNow: 48,
        assignTaskToLeadOwner: true,
        assignTaskToContactOwner: false,
        assignTaskToCampaignDefault: true,
        appendLeadEventNote: true,
      },
    },
    {
      outcomeKey: "FAILED_NOT_TARGET",
      description: "Not a fit or refused",
      crm: {
        bucket: "FAILED",
        createActivityComment: true,
        activityTitleTemplate: "AI дзвінок: кваліфікація — не цільовий/відмова",
        createFollowUpTask: false,
        assignTaskToLeadOwner: false,
        assignTaskToContactOwner: false,
        assignTaskToCampaignDefault: false,
        appendLeadEventNote: true,
      },
    },
    {
      outcomeKey: "NO_ANSWER",
      description: "No answer / voicemail",
      crm: {
        bucket: "FAILED",
        createActivityComment: true,
        activityTitleTemplate: "AI дзвінок: кваліфікація — недозвон",
        createFollowUpTask: true,
        taskTitleTemplate: "Повторити дзвінок ліду",
        taskDueHoursFromNow: 24,
        assignTaskToLeadOwner: true,
        assignTaskToContactOwner: false,
        assignTaskToCampaignDefault: true,
        appendLeadEventNote: false,
      },
    },
  ],
  handoffRules: [
    "If the lead asks for a manager, stop selling and create handoff task.",
    "If qualification_score >= 4, prefer handoff unless lead declined human contact.",
  ],
  handoffRulesUk: [
    "Якщо лід просить менеджера — припинити продаж і створити задачу передачі.",
    "Якщо qualification_score >= 4 — віддавати перевагу передачі менеджеру.",
  ],
  followUpRules: [
    "Neutral: schedule task within 48h unless lead specified a time.",
    "Failed not target: optional note only; do not spam retries without campaign rules.",
  ],
  followUpRulesUk: [
    "Нейтрально: задача протягом 48 год, якщо лід не назвав час.",
    "Нецільовий: зазвичай лише нотатка; без повторів без правил кампанії.",
  ],
  systemPromptHints:
    "Ukrainian, concise, polite B2B tone. Never promise prices or delivery. Use only CRM context facts. Capture structured fields after the call.",
};
