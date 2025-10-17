import { getServerEnv } from "@/config/env";
import { getFirebaseAdmin } from "@/lib/firebase/admin";
import { logger } from "@/lib/utils/logger";
import { getStorage } from "firebase-admin/storage";

export interface PersistResearchPdfInput {
  researchId: string;
  buffer: Buffer;
  filename?: string;
  contentType?: string;
}

export interface PersistResearchPdfResult {
  status: "uploaded" | "skipped";
  bucket?: string;
  path: string | null;
  storageUri: string | null;
}

const DEFAULT_PREFIX = "reports";
const DEFAULT_FILENAME = "report.pdf";

export async function persistResearchPdf(
  input: PersistResearchPdfInput
): Promise<PersistResearchPdfResult> {
  const env = getServerEnv();
  const filename = input.filename?.trim() || DEFAULT_FILENAME;

  if (!env.FIREBASE_STORAGE_BUCKET) {
    logger.info("pdf.storage.skipped", {
      researchId: input.researchId,
      reason: "No storage bucket configured"
    });

    return {
      status: "skipped",
      bucket: undefined,
      path: `buffer://${input.researchId}/${filename}`,
      storageUri: null
    };
  }

  const app = getFirebaseAdmin();
  const storage = getStorage(app);
  const bucket = storage.bucket(env.FIREBASE_STORAGE_BUCKET);

  const objectPath = `${DEFAULT_PREFIX}/${input.researchId}/${filename}`;
  const file = bucket.file(objectPath);

  try {
    await file.save(input.buffer, {
      contentType: input.contentType ?? "application/pdf",
      resumable: false,
      metadata: {
        cacheControl: "private, max-age=0, no-transform"
      }
    });

    logger.info("pdf.storage.uploaded", {
      researchId: input.researchId,
      bucket: bucket.name,
      path: objectPath
    });

    return {
      status: "uploaded",
      bucket: bucket.name,
      path: objectPath,
      storageUri: `gs://${bucket.name}/${objectPath}`
    };
  } catch (error) {
    logger.error("pdf.storage.failed", {
      researchId: input.researchId,
      bucket: bucket.name,
      path: objectPath,
      error: error instanceof Error ? error.message : String(error)
    });

    throw new Error("Failed to upload research PDF to storage");
  }
}
