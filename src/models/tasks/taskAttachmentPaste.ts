export type TaskAttachmentPasteDecision =
  | { kind: "accept"; file: File; notice: null }
  | {
      kind: "resize-image";
      file: File;
      notice: "resized-image";
    }
  | {
      kind: "reject";
      reason: "too-large" | "image-still-too-large" | "too-many" | "unsupported-type";
      maxBytes?: number;
      maxCount?: number;
    };

const ACCEPTED_MIME_TYPES = new Set([
  "application/pdf",
  "text/markdown",
  "text/plain",
]);

function isImage(file: File): boolean {
  return file.type.startsWith("image/");
}

function isMarkdownByName(file: File): boolean {
  return file.name.toLowerCase().endsWith(".md");
}

function isSupportedAttachmentType(file: File): boolean {
  return isImage(file) || ACCEPTED_MIME_TYPES.has(file.type) || isMarkdownByName(file);
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error("Image resize failed"));
    }, type, quality);
  });
}

async function resizeImage(file: File, maxBytes: number): Promise<File | null> {
  const bitmap = await createImageBitmap(file);
  try {
    const longestEdge = 2048;
    const scale = Math.min(1, longestEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    for (const quality of [0.82, 0.72, 0.62, 0.52]) {
      const blob = await canvasToBlob(canvas, "image/jpeg", quality);
      if (blob.size <= maxBytes) {
        return new File([blob], file.name, { type: "image/jpeg" });
      }
    }
    return null;
  } finally {
    bitmap.close?.();
  }
}

export async function preparePastedTaskAttachment(input: {
  file: File;
  existingAttachmentCount: number;
  maxBytes: number;
  maxAttachments: number;
}): Promise<TaskAttachmentPasteDecision> {
  if (input.existingAttachmentCount >= input.maxAttachments) {
    return { kind: "reject", reason: "too-many", maxCount: input.maxAttachments };
  }

  if (!isSupportedAttachmentType(input.file)) {
    return { kind: "reject", reason: "unsupported-type" };
  }

  if (input.file.size > input.maxBytes) {
    if (isImage(input.file)) {
      const resized = await resizeImage(input.file, input.maxBytes);
      if (resized) {
        return { kind: "resize-image", file: resized, notice: "resized-image" };
      }
      return { kind: "reject", reason: "image-still-too-large", maxBytes: input.maxBytes };
    }

    return { kind: "reject", reason: "too-large", maxBytes: input.maxBytes };
  }

  return { kind: "accept", file: input.file, notice: null };
}
