import { Injectable } from "@nestjs/common";
import { listFilesInFolder, getDriveFileViewUrl, type DriveFile } from "./drive/google-drive.client";
import { extractArticleFromFileName, resolveProductMatchForImageFile } from "./article-normalizer";
import { ProductStore } from "./product.store";
import { ProductImageStore } from "./product-image.store";

const UNMATCHED_EXAMPLES_CAP = 25;

function isLikelyImageByName(name: string): boolean {
  return /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(name.trim());
}

/** Folders and Google Docs/Sheets are skipped; images by mime or by file extension fallback. */
function shouldProcessFileForImages(file: DriveFile): "process" | "folder" | "nonImage" {
  const mt = file.mimeType ?? "";
  if (mt === "application/vnd.google-apps.folder") return "folder";
  if (mt.startsWith("image/")) return "process";
  if (
    isLikelyImageByName(file.name) &&
    (mt === "" || mt === "application/octet-stream")
  ) {
    return "process";
  }
  if (mt.startsWith("application/vnd.google.")) return "nonImage";
  if (mt && !mt.startsWith("image/")) return "nonImage";
  return isLikelyImageByName(file.name) ? "process" : "nonImage";
}

export type ProductImagesSyncResult = {
  /** All items returned by Drive for the folder (before filters). */
  driveItemsTotal: number;
  skippedFolders: number;
  skippedNonImage: number;
  filesProcessed: number;
  productsMatched: number;
  /** Имя файла без распознанного артикула (или не картинка после фильтра — не используется здесь). */
  filesUnmatchedNoArticle: number;
  /** Артикул из имени есть, но в БД нет товара с подходящим SKU. */
  filesUnmatchedNoProduct: number;
  /** Сумма двух предыдущих (удобно для старых интеграций). */
  filesUnmatched: number;
  productsWithMultipleImages: number;
  unmatchedNoArticleExamples: string[];
  unmatchedNoProductExamples: string[];
  /** Первые примеры любого типа несовпадения (обратная совместимость). */
  unmatchedFileNames: string[];
  errors: string[];
};

@Injectable()
export class ProductImagesSyncService {
  constructor(
    private readonly productStore: ProductStore,
    private readonly productImageStore: ProductImageStore,
  ) {}

  async syncFromGoogleDrive(
    folderId?: string,
    onProgress?: (p: { filesProcessed: number; totalFiles: number | null }) => void,
  ): Promise<ProductImagesSyncResult> {
    const result: ProductImagesSyncResult = {
      driveItemsTotal: 0,
      skippedFolders: 0,
      skippedNonImage: 0,
      filesProcessed: 0,
      productsMatched: 0,
      filesUnmatchedNoArticle: 0,
      filesUnmatchedNoProduct: 0,
      filesUnmatched: 0,
      productsWithMultipleImages: 0,
      unmatchedNoArticleExamples: [],
      unmatchedNoProductExamples: [],
      unmatchedFileNames: [],
      errors: [],
    };

    const effectiveFolderId =
      folderId ?? (process.env.GOOGLE_DRIVE_FOLDER_ID ?? "").trim();
    if (!effectiveFolderId) {
      result.errors.push("GOOGLE_DRIVE_FOLDER_ID not set and no folderId passed");
      return result;
    }

    let driveFiles: DriveFile[];
    try {
      driveFiles = await listFilesInFolder(effectiveFolderId);
    } catch (err) {
      result.errors.push(
        err instanceof Error ? err.message : "Failed to list Google Drive files",
      );
      return result;
    }

    result.driveItemsTotal = driveFiles.length;

    const imageFiles: DriveFile[] = [];
    for (const file of driveFiles) {
      const kind = shouldProcessFileForImages(file);
      if (kind === "folder") {
        result.skippedFolders++;
        continue;
      }
      if (kind === "nonImage") {
        result.skippedNonImage++;
        continue;
      }
      imageFiles.push(file);
    }
    /** Стабильный порядок: при нескольких файлах на один SKU побеждает последний по имени. */
    const sortedImageFiles = [...imageFiles].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
    const totalFiles = sortedImageFiles.length;
    onProgress?.({ filesProcessed: 0, totalFiles });

    const products = await this.productStore.listAllForImageSync();
    const matchedProductIds = new Set<string>();

    const pushExample = (arr: string[], name: string) => {
      if (arr.length < UNMATCHED_EXAMPLES_CAP) arr.push(name);
    };

    for (const file of sortedImageFiles) {
      result.filesProcessed++;
      onProgress?.({ filesProcessed: result.filesProcessed, totalFiles });
      const fileArticle = extractArticleFromFileName(file.name);
      if (!fileArticle) {
        result.filesUnmatchedNoArticle++;
        pushExample(result.unmatchedNoArticleExamples, file.name);
        pushExample(result.unmatchedFileNames, file.name);
        continue;
      }

      const match = resolveProductMatchForImageFile(file.name, products);
      if (!match) {
        result.filesUnmatchedNoProduct++;
        pushExample(result.unmatchedNoProductExamples, file.name);
        pushExample(result.unmatchedFileNames, file.name);
        continue;
      }

      /** Одно фото на товар из Drive: сносим старые и ставим текущий файл как единственный primary. */
      await this.productImageStore.deleteAllGoogleDriveForProduct(match.productId);

      const url = getDriveFileViewUrl(file.id);
      const upserted = await this.productImageStore.upsert({
        productId: match.productId,
        source: "google_drive",
        fileId: file.id,
        fileName: file.name,
        url,
        sortOrder: result.filesProcessed,
        isPrimary: true,
      });

      await this.productImageStore.setPrimary(upserted.id);

      matchedProductIds.add(match.productId);
    }

    result.filesUnmatched = result.filesUnmatchedNoArticle + result.filesUnmatchedNoProduct;
    result.productsMatched = matchedProductIds.size;

    await this.productImageStore.repairAllGoogleDrivePrimaries();

    for (const productId of matchedProductIds) {
      const images = await this.productImageStore.findByProductId(productId);
      if (images.length > 1) result.productsWithMultipleImages++;
    }

    return result;
  }
}
