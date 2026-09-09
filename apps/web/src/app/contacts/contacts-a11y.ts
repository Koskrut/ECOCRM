/** Row/card keyboard activation must ignore nested interactive controls. */
export function shouldActivateRowKey(event: {
  target: EventTarget | null;
  currentTarget: EventTarget | null;
  key: string;
}): boolean {
  if (event.key !== "Enter" && event.key !== " ") return false;
  return event.target === event.currentTarget;
}
