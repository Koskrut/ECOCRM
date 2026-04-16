import { Injectable } from "@nestjs/common";
import type {
  ContactPriorityReasonCode,
  ContactPriorityResult,
  ContactScoringSignal,
  ContactScoreBreakdownEntry,
  ContactSuggestionResult,
} from "./types/contacts-priority.types";

const RULE_EXPLANATION: Record<ContactPriorityReasonCode, string> = {
  OVERDUE_FOLLOWUP: "Есть просроченный follow-up, нужен контакт сегодня.",
  NEW_LEAD_NO_FIRST_CONTACT: "Новый клиент без первого контакта.",
  NO_CONTACT_14_DAYS: "Давно не было контакта (14+ дней).",
  NO_ORDER_30_DAYS: "Раньше покупал, но давно без заказа (30+ дней).",
  HAS_DEBT: "Есть задолженность, нужен контроль оплаты.",
  HIGH_VALUE_CLIENT: "Клиент с высокой ценностью/оборотом.",
  RETURN_TO_WORK: "Клиент выпал из контакта, стоит вернуть в работу.",
  AT_RISK: "Есть риск потери клиента.",
  DORMANT: "Клиент спящий, нужен реактивационный контакт.",
};

const HIGH_VALUE_CLIENT_REVENUE_90_THRESHOLD = 1000;

@Injectable()
export class ContactsPriorityService {
  score(signal: ContactScoringSignal): ContactPriorityResult {
    const entries: ContactScoreBreakdownEntry[] = [];

    if (signal.overdueFollowupTasks > 0) {
      entries.push(this.entry("OVERDUE_FOLLOWUP", 35, 35));
    }
    if (signal.isNewLeadNoFirstContact) {
      entries.push(this.entry("NEW_LEAD_NO_FIRST_CONTACT", 30, 30));
    }
    if (signal.daysSinceLastContact != null && signal.daysSinceLastContact >= 14) {
      entries.push(this.entry("NO_CONTACT_14_DAYS", 20, 20));
    }
    if (
      signal.hasOrderHistory &&
      signal.daysSinceLastOrder != null &&
      signal.daysSinceLastOrder >= 30
    ) {
      entries.push(this.entry("NO_ORDER_30_DAYS", 15, 15));
    }
    if (signal.debtAmount > 0) {
      entries.push(this.entry("HAS_DEBT", 28, 28));
    }
    if (signal.revenue90 >= HIGH_VALUE_CLIENT_REVENUE_90_THRESHOLD) {
      entries.push(this.entry("HIGH_VALUE_CLIENT", 12, 12));
    }
    if (
      signal.hasOrderHistory &&
      signal.daysSinceLastContact != null &&
      signal.daysSinceLastContact >= 21 &&
      signal.ordersCount365 >= 2
    ) {
      entries.push(this.entry("RETURN_TO_WORK", 18, 18));
    }
    if (signal.hasOrderHistory && signal.isAtRisk) {
      entries.push(this.entry("AT_RISK", 22, 22));
    }
    if (signal.hasOrderHistory && signal.isDormant) {
      entries.push(this.entry("DORMANT", 14, 14));
    }

    const inactivityCodes: ContactPriorityReasonCode[] = [
      "NO_CONTACT_14_DAYS",
      "RETURN_TO_WORK",
      "AT_RISK",
      "DORMANT",
    ];
    const inactivitySum = entries
      .filter((e) => inactivityCodes.includes(e.code))
      .reduce((sum, e) => sum + e.value, 0);
    const inactivityCap = 35;
    if (inactivitySum > inactivityCap) {
      const overflow = inactivitySum - inactivityCap;
      let left = overflow;
      for (const e of entries) {
        if (left <= 0) break;
        if (!inactivityCodes.includes(e.code)) continue;
        const dec = Math.min(left, e.value);
        e.value -= dec;
        left -= dec;
      }
    }

    const total = entries.reduce((sum, e) => sum + e.value, 0);
    const score = Math.max(0, Math.min(100, total));
    const reasons = entries.filter((e) => e.value > 0).map((e) => e.code);
    const breakdown = entries.filter((e) => e.value > 0);
    return { score, reasons, breakdown };
  }

  suggest(signal: ContactScoringSignal, priority: ContactPriorityResult): ContactSuggestionResult {
    if (priority.reasons.includes("HAS_DEBT")) {
      return {
        suggestedStage: "PROBLEM_DEBT",
        suggestedNextActionType: "CONTROL_PAYMENT",
        explanation: [RULE_EXPLANATION.HAS_DEBT],
      };
    }
    if (priority.reasons.includes("NEW_LEAD_NO_FIRST_CONTACT")) {
      return {
        suggestedStage: "NEW_LEAD",
        suggestedNextActionType: "CALL",
        explanation: [RULE_EXPLANATION.NEW_LEAD_NO_FIRST_CONTACT],
      };
    }
    if (priority.reasons.includes("AT_RISK")) {
      return {
        suggestedStage: "AT_RISK",
        suggestedNextActionType: "CALL",
        explanation: [RULE_EXPLANATION.AT_RISK],
      };
    }
    if (priority.reasons.includes("DORMANT")) {
      return {
        suggestedStage: "DORMANT_CLIENT",
        suggestedNextActionType: "CALL",
        explanation: [RULE_EXPLANATION.DORMANT],
      };
    }
    if (priority.reasons.includes("OVERDUE_FOLLOWUP")) {
      return {
        suggestedStage: "IN_PROGRESS",
        suggestedNextActionType: "CALL",
        explanation: [RULE_EXPLANATION.OVERDUE_FOLLOWUP],
      };
    }
    return {
      suggestedStage: signal.hasOrderHistory ? "ACTIVE_CLIENT" : "IN_PROGRESS",
      suggestedNextActionType: priority.score > 0 ? "CALL" : "NO_ACTION",
      explanation:
        priority.breakdown.length > 0
          ? priority.breakdown.map((x) => x.explanation)
          : ["Недостаточно сигналов для приоритизации."],
    };
  }

  private entry(
    code: ContactPriorityReasonCode,
    weight: number,
    value: number,
  ): ContactScoreBreakdownEntry {
    return {
      code,
      weight,
      value,
      explanation: RULE_EXPLANATION[code],
    };
  }
}
