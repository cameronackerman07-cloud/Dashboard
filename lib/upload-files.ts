// Upload rules shared by the browser and the server (no "server-only").

export const MAX_DIRECT_UPLOAD_BYTES = 25 * 1024 * 1024;
export type UploadKind = "pdf" | "docx" | "pptx" | "txt" | "md" | "image";

const OK: Record<string, UploadKind> = { pptx: "pptx", ppsx: "pptx", pdf: "pdf", docx: "docx", txt: "txt", md: "md", markdown: "md", png: "image", jpg: "image", jpeg: "image", webp: "image", heic: "image", heif: "image" };

const REJECT: Record<string, string> = {
  ppt: "That's an old PowerPoint file (.ppt). Open it in PowerPoint, Keynote or Google Slides and save or export it as .pptx, then upload that.",
  pps: "That's an old PowerPoint file. Open it in PowerPoint, Keynote or Google Slides and save or export it as .pptx, then upload that.",
  pptm: "PowerPoint files with macros (.pptm) aren't accepted, for safety. Save it as a normal .pptx and upload that.",
  potx: "That's a PowerPoint template. Save it as a normal .pptx and upload that.",
  potm: "PowerPoint files with macros aren't accepted, for safety. Save it as a normal .pptx and upload that.",
  ppsm: "PowerPoint files with macros aren't accepted, for safety. Save it as a normal .pptx and upload that.",
  key: "Keynote files can't be read yet. In Keynote choose File → Export To → PowerPoint, then upload the .pptx.",
  doc: "That's an old Word file (.doc). Save it as .docx or PDF and upload that.",
  docm: "Word files with macros aren't accepted, for safety. Save it as a normal .docx and upload that.",
  pages: "Pages files can't be read yet. Export it as PDF or Word (.docx) and upload that.",
};

export function uploadKind(name: string): { kind: UploadKind } | { error: string } {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (OK[ext]) return { kind: OK[ext] };
  if (REJECT[ext]) return { error: REJECT[ext] };
  if (ext === "gif") return { error: "GIFs can't be read. Save it as a PNG or JPG and upload that." };
  return { error: "That type of file isn't supported. Upload a PowerPoint (.pptx), PDF, Word (.docx), a photo (JPG, PNG, HEIC), .txt or .md file." };
}

// A storage-safe file name: letters, numbers, dot, dash and underscore only.
export function safeFileName(name: string): string {
  const base = name.normalize("NFKD").replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_").replace(/^[._]+/, "").slice(-120);
  return base || "upload";
}

export function sizeText(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
