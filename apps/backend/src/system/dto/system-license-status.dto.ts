export type SystemLicenseStatusDto = {
  status: "valid" | "missing" | "invalid" | "expired";
  expiresAt: string | null;
  customer: string | null;
  licenseId: string | null;
};
