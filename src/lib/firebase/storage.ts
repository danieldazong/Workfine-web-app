/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getDownloadURL,
  ref,
  uploadBytes,
  deleteObject,
} from "firebase/storage";
import { storage } from "./config";

export type UploadedAttachment = {
  id: string;
  name: string;

  /**
   * Original full-quality file URL.
   * Always use this for opening/downloading.
   */
  url: string;

  type: string;
  size?: number;
  path: string;

  /**
   * Fast lightweight image preview.
   * Use this only inside the UI preview.
   * The original quality is preserved in `url`.
   */
  previewUrl?: string;
  previewPath?: string;

  /**
   * Original image dimensions.
   */
  width?: number;
  height?: number;

  /**
   * Preview dimensions.
   */
  previewWidth?: number;
  previewHeight?: number;

  /**
   * Tiny blurred placeholder shown while the preview loads.
   */
  blurDataUrl?: string;

  uploadedAt: string;
  uploadedBy: string;
};

const safeFileName = (name: string) => {
  return name.replace(/[^\w.\-() ]+/g, "_");
};
const ORIGINAL_CACHE_CONTROL = "public,max-age=31536000,immutable";
const PREVIEW_CACHE_CONTROL = "public,max-age=31536000,immutable";

const MAX_PREVIEW_EDGE = 960;
const BLUR_PREVIEW_EDGE = 28;

type ImagePreviewResult = {
  blob: Blob;
  width: number;
  height: number;
  previewWidth: number;
  previewHeight: number;
  blurDataUrl: string;
  type: string;
};

function canCreateImagePreview(file: File): boolean {
  if (!file.type.startsWith("image/")) return false;

  /**
   * SVG can contain scripts/foreign objects.
   * GIF previews would lose animation if drawn to canvas.
   * Keep them original-only.
   */
  if (file.type === "image/svg+xml") return false;
  if (file.type === "image/gif") return false;

  return true;
}

function getContainedSize(
  width: number,
  height: number,
  maxEdge: number
): { width: number; height: number } {
  if (!width || !height) {
    return {
      width: maxEdge,
      height: Math.round(maxEdge * 0.5625),
    };
  }

  const largest = Math.max(width, height);

  if (largest <= maxEdge) {
    return {
      width,
      height,
    };
  }

  const scale = maxEdge / largest;

  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Could not create image preview"));
        }
      },
      type,
      quality
    );
  });
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read image file"));
    };

    img.src = objectUrl;
  });
}

async function createImagePreview(file: File): Promise<ImagePreviewResult | null> {
  if (!canCreateImagePreview(file)) return null;

  try {
    const img = await loadImageFromFile(file);

    const originalWidth = img.naturalWidth || img.width;
    const originalHeight = img.naturalHeight || img.height;

    if (!originalWidth || !originalHeight) return null;

    const previewSize = getContainedSize(
      originalWidth,
      originalHeight,
      MAX_PREVIEW_EDGE
    );

    const previewCanvas = document.createElement("canvas");
    previewCanvas.width = previewSize.width;
    previewCanvas.height = previewSize.height;

    const previewCtx = previewCanvas.getContext("2d", {
      alpha: false,
    });

    if (!previewCtx) return null;

    previewCtx.imageSmoothingEnabled = true;
    previewCtx.imageSmoothingQuality = "high";
    previewCtx.drawImage(img, 0, 0, previewSize.width, previewSize.height);

    /**
     * WebP gives small, high-quality previews.
     * The original image is still uploaded untouched.
     */
    const previewType = "image/webp";
    const previewBlob = await canvasToBlob(previewCanvas, previewType, 0.84);

    const blurSize = getContainedSize(
      originalWidth,
      originalHeight,
      BLUR_PREVIEW_EDGE
    );

    const blurCanvas = document.createElement("canvas");
    blurCanvas.width = blurSize.width;
    blurCanvas.height = blurSize.height;

    const blurCtx = blurCanvas.getContext("2d", {
      alpha: false,
    });

    if (blurCtx) {
      blurCtx.imageSmoothingEnabled = true;
      blurCtx.imageSmoothingQuality = "low";
      blurCtx.drawImage(img, 0, 0, blurSize.width, blurSize.height);
    }

    const blurDataUrl = blurCanvas.toDataURL("image/jpeg", 0.45);

    return {
      blob: previewBlob,
      width: originalWidth,
      height: originalHeight,
      previewWidth: previewSize.width,
      previewHeight: previewSize.height,
      blurDataUrl,
      type: previewType,
    };
  } catch (error) {
    console.warn("[storageService] image preview skipped:", error);
    return null;
  }
}


export const storageService = {
  async uploadFile(
  userId: string,
  projectId: string,
  taskId: string,
  file: File
): Promise<UploadedAttachment> {
  if (!userId) {
    throw new Error("userId is required");
  }

  if (!projectId) {
    throw new Error("projectId is required");
  }

  if (!taskId) {
    throw new Error("taskId is required");
  }

  const attachmentId = crypto.randomUUID();
  const fileName = safeFileName(file.name);
  const contentType = file.type || "application/octet-stream";

  /**
   * Create a lightweight preview before uploading.
   * The original file is still uploaded untouched and full-quality.
   */
  const preview = await createImagePreview(file);

  const path = `${userId}/projects/${projectId}/tasks/${taskId}/originals/${attachmentId}-${fileName}`;
  const fileRef = ref(storage, path);

  await uploadBytes(fileRef, file, {
    contentType,
    cacheControl: ORIGINAL_CACHE_CONTROL,
    contentDisposition: `inline; filename="${fileName}"`,
    customMetadata: {
      userId,
      projectId,
      taskId,
      attachmentId,
      originalName: file.name,
      hasPreview: preview ? "true" : "false",
    },
  });

  const url = await getDownloadURL(fileRef);

  let previewUrl: string | undefined;
  let previewPath: string | undefined;

  if (preview) {
    previewPath = `${userId}/projects/${projectId}/tasks/${taskId}/previews/${attachmentId}-preview.webp`;

    const previewRef = ref(storage, previewPath);

    await uploadBytes(previewRef, preview.blob, {
      contentType: preview.type,
      cacheControl: PREVIEW_CACHE_CONTROL,
      contentDisposition: `inline; filename="${attachmentId}-preview.webp"`,
      customMetadata: {
        userId,
        projectId,
        taskId,
        attachmentId,
        originalName: file.name,
        previewFor: path,
      },
    });

    previewUrl = await getDownloadURL(previewRef);
  }

  return {
    id: attachmentId,
    name: file.name,

    /**
     * Original full-quality file.
     */
    url,

    type: contentType,
    size: file.size,
    path,

    /**
     * Fast preview fields.
     */
    previewUrl,
    previewPath,
    width: preview?.width,
    height: preview?.height,
    previewWidth: preview?.previewWidth,
    previewHeight: preview?.previewHeight,
    blurDataUrl: preview?.blurDataUrl,

    uploadedAt: new Date().toISOString(),
    uploadedBy: userId,
  };
},


  async deleteFile(path: string) {
    if (!path) return;

    const fileRef = ref(storage, path);
    await deleteObject(fileRef);
  },
};
