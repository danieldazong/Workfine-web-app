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
  url: string;
  type: string;
  size?: number;
  path: string;
  uploadedAt: string;
  uploadedBy: string;
};

const safeFileName = (name: string) => {
  return name.replace(/[^\w.\-() ]+/g, "_");
};

export const storageService = {
  async uploadFile(
    userId: string,
    projectId: string,
    taskId: string,
    file: File,
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

    const path = `${userId}/projects/${projectId}/tasks/${taskId}/${attachmentId}-${fileName}`;

    const fileRef = ref(storage, path);

    await uploadBytes(fileRef, file, {
      contentType: file.type || "application/octet-stream",
      customMetadata: {
        userId,
        projectId,
        taskId,
      },
    });

    const url = await getDownloadURL(fileRef);

    return {
      id: attachmentId,
      name: file.name,
      url,
      type: file.type || "application/octet-stream",
      size: file.size,
      path,
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
