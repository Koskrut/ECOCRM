let counter = 0;

export const createId = (prefix: string): string => {
  counter += 1;
  const time = Date.now().toString(36);
  const seq = counter.toString(36);
  return `${prefix}_${time}_${seq}`;
};

export const createOrderNumber = (): string => {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const daily = (counter % 10000).toString().padStart(4, "0");
  return `ORD-${y}${m}${d}-${daily}`;
};
