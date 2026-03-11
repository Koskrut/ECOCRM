import { randomBytes } from "crypto";
import type { ProductImagesSyncResult } from "./product-images-sync.service";

export type ProductImagesSyncStatus = {
  jobId: string | null;
  running: boolean;
  filesProcessed: number;
  totalFiles: number | null;
  result: ProductImagesSyncResult | null;
  error: string | null;
};

/** In-memory state for the current/last sync job (single job at a time). */
export class ProductImagesSyncState {
  private state: ProductImagesSyncStatus = {
    jobId: null,
    running: false,
    filesProcessed: 0,
    totalFiles: null,
    result: null,
    error: null,
  };

  get(): ProductImagesSyncStatus {
    return { ...this.state };
  }

  start(): string {
    const jobId = randomBytes(8).toString("hex");
    this.state = {
      jobId,
      running: true,
      filesProcessed: 0,
      totalFiles: null,
      result: null,
      error: null,
    };
    return jobId;
  }

  setProgress(progress: { filesProcessed: number; totalFiles: number | null }) {
    this.state.filesProcessed = progress.filesProcessed;
    this.state.totalFiles = progress.totalFiles;
  }

  complete(result: ProductImagesSyncResult) {
    this.state.running = false;
    this.state.result = result;
    this.state.error = null;
  }

  fail(error: string) {
    this.state.running = false;
    this.state.error = error;
    this.state.result = null;
  }

  isRunning(): boolean {
    return this.state.running;
  }
}
