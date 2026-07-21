/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getDownloadURL,
  ref,
  uploadBytesResumable,
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
   * File category used by the UI.
   */
  kind?: "image" | "audio" | "pdf" | "text" | "document" | "file";

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

type AttachmentKind = "image" | "audio" | "pdf" | "text" | "document" | "file";

const safeFileName = (name: string) => {
  return String(name || "file").replace(/[^\w.\-() ]+/g, "_");
};

function getFileExtensionLower(name?: string): string {
  const clean = String(name || "").trim().toLowerCase();
  const ext = clean.includes(".") ? clean.split(".").pop() : "";

  return ext ? `.${ext}` : "";
}

function getAttachmentKind(file: File): AttachmentKind {
  const type = String(file.type || "").toLowerCase();
  const name = String(file.name || "").toLowerCase();
  const ext = getFileExtensionLower(name);

  if (type.startsWith("image/")) return "image";

  if (type.startsWith("audio/")) return "audio";

  if (type === "application/pdf" || ext === ".pdf") {
    return "pdf";
  }

  if (
    type.startsWith("text/") ||
    type === "application/json" ||
    ext === ".txt" ||
    ext === ".md" ||
    ext === ".csv" ||
    ext === ".json"
  ) {
    return "text";
  }

  if (
    type === "application/msword" ||
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    type === "application/rtf" ||
    ext === ".doc" ||
    ext === ".docx" ||
    ext === ".rtf"
  ) {
    return "document";
  }

  return "file";
}

function getContentType(file: File): string {
  const type = String(file.type || "").trim();
  const ext = getFileExtensionLower(file.name);

  if (type) return type;

  if (ext === ".pdf") return "application/pdf";
  if (ext === ".txt") return "text/plain";
  if (ext === ".md") return "text/markdown";
  if (ext === ".csv") return "text/csv";
  if (ext === ".json") return "application/json";
  if (ext === ".rtf") return "application/rtf";
  if (ext === ".doc") return "application/msword";
  if (ext === ".docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }

  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".m4a") return "audio/mp4";
  if (ext === ".aac") return "audio/aac";
  if (ext === ".ogg" || ext === ".oga") return "audio/ogg";
  if (ext === ".webm") return "audio/webm";
  if (ext === ".flac") return "audio/flac";

  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".bmp") return "image/bmp";
  if (ext === ".svg") return "image/svg+xml";

  return "application/octet-stream";
}

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
  const contentType = getContentType(file);

  if (!contentType.startsWith("image/")) return false;

  /**
   * SVG can contain scripts/foreign objects.
   * GIF previews would lose animation if drawn to canvas.
   * Keep them original-only.
   */
  if (contentType === "image/svg+xml") return false;
  if (contentType === "image/gif") return false;

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
export type UploadProgress = {
  bytesTransferred: number;
  totalBytes: number;
  percent: number;
};

/**
 * Uploads bytes with resumable transfer so progress can be reported.
 * Returns the same result contract callers already expect.
 * `onProgress` is optional — when omitted this behaves like a normal upload.
 */
function uploadWithProgress(
  fileRef: ReturnType<typeof ref>,
  data: Blob | File,
  metadata: Parameters<typeof uploadBytesResumable>[2],
  onProgress?: (progress: UploadProgress) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(fileRef, data, metadata);

    task.on(
      "state_changed",
      (snapshot) => {
        const totalBytes = snapshot.totalBytes || 0;
        const bytesTransferred = snapshot.bytesTransferred || 0;
        const percent =
          totalBytes > 0
            ? Math.min(100, Math.round((bytesTransferred / totalBytes) * 100))
            : 0;

        onProgress?.({ bytesTransferred, totalBytes, percent });
      },
      (error) => reject(error),
      () => resolve(),
    );
  });
}

export const storageService = {
    async uploadFile(
    userId: string,
    projectId: string,
    taskId: string,
    file: File,
    onProgress?: (progress: UploadProgress) => void
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
    const contentType = getContentType(file);
    const attachmentKind = getAttachmentKind(file);

    /**
     * Create a lightweight preview before uploading.
     * The original file is still uploaded untouched and full-quality.
     * Non-image files return null here and still upload normally.
     */
    const preview = await createImagePreview(file);

    const path = `${userId}/projects/${projectId}/tasks/${taskId}/originals/${attachmentId}-${fileName}`;
    const fileRef = ref(storage, path);

       await uploadWithProgress(
      fileRef,
      file,
      {
        contentType,
        cacheControl: ORIGINAL_CACHE_CONTROL,
        contentDisposition: `inline; filename="${fileName}"`,
        customMetadata: {
          userId,
          projectId,
          taskId,
          attachmentId,
          originalName: file.name || fileName,
          attachmentKind,
          hasPreview: preview ? "true" : "false",
        },
      },
      onProgress,
    );


    const url = await getDownloadURL(fileRef);

    let previewUrl: string | undefined;
    let previewPath: string | undefined;

    if (preview) {
      previewPath = `${userId}/projects/${projectId}/tasks/${taskId}/previews/${attachmentId}-preview.webp`;

      const previewRef = ref(storage, previewPath);

           await uploadWithProgress(previewRef, preview.blob, {
        contentType: preview.type,
        cacheControl: PREVIEW_CACHE_CONTROL,
        contentDisposition: `inline; filename="${attachmentId}-preview.webp"`,
        customMetadata: {
          userId,
          projectId,
          taskId,
          attachmentId,
          originalName: file.name || fileName,
          attachmentKind: "image",
          previewFor: path,
        },
      });


      previewUrl = await getDownloadURL(previewRef);
    }

    /**
     * IMPORTANT:
     * Do not return undefined fields.
     * Firestore rejects undefined values inside attachments[].
     */
    const uploadedAttachment: UploadedAttachment = {
      id: attachmentId,
      name: file.name || fileName,
      url,
      type: contentType,
      size: file.size,
      path,
      kind: attachmentKind,
      uploadedAt: new Date().toISOString(),
      uploadedBy: userId,
    };

    if (previewUrl) {
      uploadedAttachment.previewUrl = previewUrl;
    }

    if (previewPath) {
      uploadedAttachment.previewPath = previewPath;
    }

    if (typeof preview?.width === "number") {
      uploadedAttachment.width = preview.width;
    }

    if (typeof preview?.height === "number") {
      uploadedAttachment.height = preview.height;
    }

    if (typeof preview?.previewWidth === "number") {
      uploadedAttachment.previewWidth = preview.previewWidth;
    }

    if (typeof preview?.previewHeight === "number") {
      uploadedAttachment.previewHeight = preview.previewHeight;
    }

    if (preview?.blurDataUrl) {
      uploadedAttachment.blurDataUrl = preview.blurDataUrl;
    }

    return uploadedAttachment;
  },

  async deleteFile(path: string) {
    if (!path) return;

    const fileRef = ref(storage, path);
    await deleteObject(fileRef);
  },
};
