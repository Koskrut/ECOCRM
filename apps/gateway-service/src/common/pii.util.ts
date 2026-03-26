/** Mask phone for logs — keep last 4 digits if long enough */
export function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length <= 4) return "****";
  return `***${d.slice(-4)}`;
}
