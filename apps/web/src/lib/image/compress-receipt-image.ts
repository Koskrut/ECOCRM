const MAX_BYTES = 4 * 1024 * 1024;
const MAX_DIMENSION = 2048;
const JPEG_QUALITY_STEPS = [0.85, 0.75, 0.65, 0.55, 0.45];

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не вдалося прочитати зображення"));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Не вдалося стиснути зображення"))),
      "image/jpeg",
      quality,
    );
  });
}

function scaledSize(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= MAX_DIMENSION) {
    return { width, height };
  }
  const scale = MAX_DIMENSION / longest;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

/** Resize and compress receipt photos before upload (phones often exceed nginx/proxy limits). */
export async function compressReceiptImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    return file;
  }
  if (file.size <= 400_000 && file.type === "image/jpeg") {
    return file;
  }

  const img = await loadImage(file);
  const { width, height } = scaledSize(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return file;
  }
  ctx.drawImage(img, 0, 0, width, height);

  let blob: Blob | null = null;
  for (const quality of JPEG_QUALITY_STEPS) {
    const candidate = await canvasToBlob(canvas, quality);
    blob = candidate;
    if (candidate.size <= MAX_BYTES) {
      break;
    }
  }

  if (!blob) {
    throw new Error("Фото занадто велике. Спробуйте інше зображення.");
  }

  const baseName = file.name.replace(/\.[^.]+$/, "") || "receipt";
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
}
