import { MAX_MENU_IMAGE_BYTES, type MenuImageContentType } from "@/domain/menu";

const MAX_SOURCE_IMAGE_BYTES = 20_000_000;
const MAX_IMAGE_DIMENSION = 1_600;

export type PreparedMenuImage = {
  contentType: MenuImageContentType;
  base64Data: string;
};

export async function prepareMenuImage(file: File): Promise<PreparedMenuImage> {
  if (!(["image/jpeg", "image/png", "image/webp"] as string[]).includes(file.type)) {
    throw new Error("Choose a JPEG, PNG or WebP image.");
  }
  if (file.size === 0 || file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error("Choose an image smaller than 20 MB.");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This image could not be read. Convert HEIC photos to JPEG first.");
  }

  try {
    let dimensionLimit = MAX_IMAGE_DIMENSION;
    let quality = 0.86;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const scale = Math.min(1, dimensionLimit / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image processing is unavailable in this browser.");
      context.drawImage(bitmap, 0, 0, width, height);

      const blob = await canvasToBlob(canvas, quality);
      if (blob.size <= MAX_MENU_IMAGE_BYTES) {
        return {
          contentType: "image/webp",
          base64Data: arrayBufferToBase64(await blob.arrayBuffer()),
        };
      }

      if (quality > 0.56) quality -= 0.1;
      else {
        dimensionLimit = Math.round(dimensionLimit * 0.8);
        quality = 0.76;
      }
    }
  } finally {
    bitmap.close();
  }

  throw new Error("The image is too detailed to compress below 700 KB. Try a smaller photo.");
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The image could not be compressed."))),
      "image/webp",
      quality,
    );
  });
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return btoa(binary);
}
