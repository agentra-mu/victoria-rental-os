import type { DocumentStorage } from "../storage";

export interface StoredFile {
  buffer: Buffer;
  contentType: string;
}

export function createFakeDocumentStorage() {
  const files = new Map<string, StoredFile>();

  const storage: DocumentStorage = {
    async upload(path, buffer, contentType) {
      files.set(path, { buffer, contentType });
    },
  };

  return { storage, files };
}
