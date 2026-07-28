import fs from "node:fs";
import path from "node:path";

const FONT_FILES = {
  regular: "DejaVuSans.ttf",
  bold: "DejaVuSans-Bold.ttf",
} as const;

/**
 * Resolve bundled DejaVu fonts (Cyrillic). Works from ts-node (src/),
 * compiled dist/, Docker (/app/assets), and monorepo root cwd.
 */
export function resolveDocumentFontPaths(): { regular: string; bold: string } {
  const dirs = [
    path.join(__dirname, "..", "..", "assets", "fonts"),
    path.join(process.cwd(), "assets", "fonts"),
    path.join(process.cwd(), "apps", "backend", "assets", "fonts"),
  ];
  for (const dir of dirs) {
    const regular = path.join(dir, FONT_FILES.regular);
    const bold = path.join(dir, FONT_FILES.bold);
    if (fs.existsSync(regular) && fs.existsSync(bold)) {
      return { regular, bold };
    }
  }
  throw new Error(
    `Order document fonts not found (looked for ${FONT_FILES.regular} under assets/fonts)`,
  );
}
