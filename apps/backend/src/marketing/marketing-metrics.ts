export function classifyLeadPayment(input: {
  insideWindow: boolean;
  leadMatured: boolean;
}): { countInPaymentsFromLeads: boolean; countInRoi: boolean } {
  return {
    countInPaymentsFromLeads: input.insideWindow,
    countInRoi: input.insideWindow && input.leadMatured,
  };
}
