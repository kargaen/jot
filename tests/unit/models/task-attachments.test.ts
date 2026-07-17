import {
  preparePastedTaskAttachment,
  type TaskAttachmentPasteDecision,
} from "../../../src/models/tasks/taskAttachmentPaste";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENTS = 3;

function fileOfSize(name: string, type: string, sizeBytes: number): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

function summarizeDecision(decision: TaskAttachmentPasteDecision) {
  if (decision.kind === "accept") {
    return {
      kind: decision.kind,
      notice: decision.notice,
      name: decision.file.name,
      size: decision.file.size,
      type: decision.file.type,
    };
  }

  if (decision.kind === "resize-image") {
    return {
      kind: decision.kind,
      notice: decision.notice,
      name: decision.file.name,
      size: decision.file.size,
      type: decision.file.type,
    };
  }

  return decision;
}


function installImageResizeMocks(outputBytes: number) {
  const globals = globalThis as typeof globalThis & {
    createImageBitmap: (file: File) => Promise<{ width: number; height: number; close: () => void }>;
    document: { createElement: (tagName: string) => unknown };
  };

  globals.createImageBitmap = async () => ({
    width: 4000,
    height: 3000,
    close: () => {},
  });

  globals.document = {
    createElement: (tagName: string) => {
      if (tagName !== "canvas") {
        throw new Error(`unexpected element requested in image-resize test: ${tagName}`);
      }

      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: () => {} }),
        toBlob: (callback: (blob: Blob | null) => void) => {
          callback(new Blob([new Uint8Array(outputBytes)], { type: "image/jpeg" }));
        },
      };
    },
  };
}

function assertEqual<T>(label: string, actual: T, expected: T) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) {
    throw new Error(`${label}: expected ${right}, got ${left}`);
  }
}

async function decide(input: {
  file: File;
  existingAttachmentCount?: number;
}): Promise<TaskAttachmentPasteDecision> {
  return preparePastedTaskAttachment({
    file: input.file,
    existingAttachmentCount: input.existingAttachmentCount ?? 0,
    maxBytes: MAX_BYTES,
    maxAttachments: MAX_ATTACHMENTS,
  });
}

const acceptedPdf = fileOfSize("brief.pdf", "application/pdf", MAX_BYTES);
assertEqual(
  "accepts PDF at the stored-size limit",
  summarizeDecision(await decide({ file: acceptedPdf })),
  {
    kind: "accept",
    notice: null,
    name: "brief.pdf",
    size: MAX_BYTES,
    type: "application/pdf",
  },
);

const acceptedMarkdown = fileOfSize("notes.md", "text/markdown", 1024);
assertEqual(
  "accepts markdown under the stored-size limit",
  summarizeDecision(await decide({ file: acceptedMarkdown })),
  {
    kind: "accept",
    notice: null,
    name: "notes.md",
    size: 1024,
    type: "text/markdown",
  },
);

assertEqual(
  "rejects a fourth attachment before upload",
  summarizeDecision(
    await decide({
      file: fileOfSize("fourth.pdf", "application/pdf", 1024),
      existingAttachmentCount: 3,
    }),
  ),
  { kind: "reject", reason: "too-many", maxCount: MAX_ATTACHMENTS },
);

assertEqual(
  "rejects oversized non-image files before upload",
  summarizeDecision(
    await decide({
      file: fileOfSize("archive.pdf", "application/pdf", MAX_BYTES + 1),
    }),
  ),
  { kind: "reject", reason: "too-large", maxBytes: MAX_BYTES },
);

assertEqual(
  "rejects unsupported file types before upload",
  summarizeDecision(
    await decide({
      file: fileOfSize("installer.exe", "application/x-msdownload", 1024),
    }),
  ),
  { kind: "reject", reason: "unsupported-type" },
);

installImageResizeMocks(MAX_BYTES - 1);
assertEqual(
  "resizes oversized images before upload",
  summarizeDecision(
    await decide({
      file: fileOfSize("large-photo.jpg", "image/jpeg", MAX_BYTES + 1),
    }),
  ),
  {
    kind: "resize-image",
    notice: "resized-image",
    name: "large-photo.jpg",
    size: MAX_BYTES - 1,
    type: "image/jpeg",
  },
);

installImageResizeMocks(MAX_BYTES + 1);
assertEqual(
  "rejects images that remain too large after resizing",
  summarizeDecision(
    await decide({
      file: fileOfSize("still-too-large.jpg", "image/jpeg", MAX_BYTES + 1),
    }),
  ),
  { kind: "reject", reason: "image-still-too-large", maxBytes: MAX_BYTES },
);

console.log("Task attachment paste-limit tests passed: 7/7");
