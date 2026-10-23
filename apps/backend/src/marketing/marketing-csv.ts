export type SpendCsvRow = {
  date: string;
  campaignExternalId: string;
  adSetExternalId: string;
  adExternalId: string;
  spend: number;
  impressions: number;
  clicks: number;
  currency: string | null;
  campaignName: string | null;
  adSetName: string | null;
  adName: string | null;
};

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function parseDate(value: string): string | null {
  const trimmed = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(trimmed);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return null;
}

/**
 * Ad-level rows only. A row without an ad id is rejected so a campaign total cannot be stored beside its ads.
 */
export function parseSpendCsv(text: string): { rows: SpendCsvRow[]; errors: string[] } {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return { rows: [], errors: ["Порожній файл"] };

  const header = lines[0]!.split(/[;,\t]/).map(normalizeHeader);
  const index = new Map<string, number>();
  header.forEach((name, i) => index.set(name, i));
  const col = (...names: string[]) => {
    for (const name of names) {
      const found = index.get(name);
      if (found != null) return found;
    }
    return -1;
  };
  const dateCol = col("date", "day", "дата");
  const campaignCol = col("campaign_id", "campaignid", "campaign");
  const adsetCol = col("adset_id", "ad_set_id", "adgroup_id", "ad_group_id", "adset");
  const adCol = col("ad_id", "adid", "ad");
  const spendCol = col("spend", "cost", "amount", "витрати");
  const impressionsCol = col("impressions", "impr");
  const clicksCol = col("clicks");
  const currencyCol = col("currency", "валюта");
  const campaignNameCol = col("campaign_name");
  const adsetNameCol = col("adset_name", "ad_group_name");
  const adNameCol = col("ad_name");

  const errors: string[] = [];
  const byKey = new Map<string, SpendCsvRow>();
  if (dateCol < 0 || adCol < 0 || spendCol < 0 || campaignCol < 0) {
    return { rows: [], errors: ["У файлі мають бути дата, кампанія, оголошення і витрати"] };
  }

  for (let i = 1; i < lines.length; i += 1) {
    const cells = lines[i]!.split(/[;,\t]/).map((cell) => cell.trim());
    const adExternalId = cells[adCol] ?? "";
    if (!adExternalId) {
      errors.push(`Рядок ${i + 1}: немає оголошення, рядок кампанії цілком не додаємо`);
      continue;
    }
    const date = parseDate(cells[dateCol] ?? "");
    if (!date) {
      errors.push(`Рядок ${i + 1}: незрозуміла дата`);
      continue;
    }
    const campaignExternalId = cells[campaignCol] ?? "";
    if (!campaignExternalId) {
      errors.push(`Рядок ${i + 1}: немає кампанії`);
      continue;
    }
    const spend = Number((cells[spendCol] ?? "").replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(spend) || spend < 0) {
      errors.push(`Рядок ${i + 1}: незрозумілі витрати`);
      continue;
    }
    const impressions = impressionsCol >= 0 ? Number(cells[impressionsCol] ?? 0) : 0;
    const clicks = clicksCol >= 0 ? Number(cells[clicksCol] ?? 0) : 0;
    const row: SpendCsvRow = {
      date,
      campaignExternalId,
      adSetExternalId: adsetCol >= 0 ? cells[adsetCol] || campaignExternalId : campaignExternalId,
      adExternalId,
      spend,
      impressions: Number.isFinite(impressions) ? impressions : 0,
      clicks: Number.isFinite(clicks) ? clicks : 0,
      currency: currencyCol >= 0 ? cells[currencyCol] || null : null,
      campaignName: campaignNameCol >= 0 ? cells[campaignNameCol] || null : null,
      adSetName: adsetNameCol >= 0 ? cells[adsetNameCol] || null : null,
      adName: adNameCol >= 0 ? cells[adNameCol] || null : null,
    };
    byKey.set(`${date}:${adExternalId}`, row);
  }

  return { rows: [...byKey.values()], errors };
}
