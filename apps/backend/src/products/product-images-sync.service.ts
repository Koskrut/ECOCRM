import { Injectable } from "@nestjs/common";
import { listFilesInFolder, getDriveFileViewUrl } from "./drive/google-drive.client";
import { extractArticleFromFileName, findBestProductMatch } from "./article-normalizer";
import { ProductStore } from "./product.store";
import { ProductImageStore } from "./product-image.store";

export type ProductImagesSyncResult = {
  filesProcessed: number;
  productsMatched: number;
  filesUnmatched: number;
  productsWithMultipleImages: number;
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
      filesProcessed: 0,
      productsMatched: 0,
      filesUnmatched: 0,
      productsWithMultipleImages: 0,
      unmatchedFileNames: [],
      errors: [],
    };

    const effectiveFolderId =
      folderId ?? (process.env.GOOGLE_DRIVE_FOLDER_ID ?? "").trim();
    if (!effectiveFolderId) {
      result.errors.push("GOOGLE_DRIVE_FOLDER_ID not set and no folderId passed");
      return result;
    }

    let driveFiles: Array<{ id: string; name: string }>;
    try {
      driveFiles = await listFilesInFolder(effectiveFolderId);
    } catch (err) {
      result.errors.push(
        err instanceof Error ? err.message : "Failed to list Google Drive files",
      );
      return result;
    }

    const totalFiles = driveFiles.length;
    onProgress?.({ filesProcessed: 0, totalFiles });

    const products = await this.productStore.listAllForImageSync();
    const matchedProductIds = new Set<string>();

    for (const file of driveFiles) {
      result.filesProcessed++;
      onProgress?.({ filesProcessed: result.filesProcessed, totalFiles });
      const fileArticle = extractArticleFromFileName(file.name);
      if (!fileArticle) {
        result.filesUnmatched++;
        result.unmatchedFileNames.push(file.name);
        continue;
      }

      const match = findBestProductMatch(fileArticle, products);
      if (!match) {
        result.filesUnmatched++;
        result.unmatchedFileNames.push(file.name);
        continue;
      }

      const hadPrimary = await this.productImageStore.productHasPrimary(
        match.productId,
      );
      const isFirstForProduct = !hadPrimary;

      const url = getDriveFileViewUrl(file.id);
      const upserted = await this.productImageStore.upsert({
        productId: match.productId,
        source: "google_drive",
        fileId: file.id,
        fileName: file.name,
        url,
        sortOrder: result.filesProcessed,
        isPrimary: isFirstForProduct,
      });

      if (isFirstForProduct) {
        await this.productImageStore.setPrimary(upserted.id);
      }

      matchedProductIds.add(match.productId);
    }

    result.productsMatched = matchedProductIds.size;

    for (const productId of matchedProductIds) {
      const images = await this.productImageStore.findByProductId(productId);
      if (images.length > 1) result.productsWithMultipleImages++;
    }

    return result;
  }
}
