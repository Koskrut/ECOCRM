/** Build consistent manager playbook markdown bodies. */
export function playbookBody(input: {
  situation: string;
  when: string;
  goal: string;
  time: string;
  steps: Array<{ title: string; items: string[] }>;
  checklist: string[];
  fallback: string[];
  crmSections: string[];
}): string {
  const stepsMd = input.steps
    .map(
      (step, index) =>
        `## Крок ${index + 1}. ${step.title}\n\n${step.items.map((item, i) => `${i + 1}. ${item}`).join("\n")}`,
    )
    .join("\n\n");

  return `# Ситуація: ${input.situation}

**Коли:** ${input.when}
**Мета:** ${input.goal}
**Час:** ${input.time}

${stepsMd}

## Що зафіксувати в CRM
${input.checklist.map((item) => `- [ ] ${item}`).join("\n")}

## Якщо не вийшло
${input.fallback.map((item) => `- ${item}`).join("\n")}

## Де в CRM
${input.crmSections.map((s) => `**${s}**`).join(" · ")}`;
}
