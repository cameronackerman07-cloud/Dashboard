import "server-only";

// Pulls the text out of an uploaded file, on the server. Only the text is kept
// (the original is deleted after processing unless "Keep original files" is on).

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // Vercel refuses request bodies over 4.5 MB

export class ExtractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractError";
  }
}

type Kind = "pdf" | "docx" | "text";

function kindOf(name: string, bytes: Uint8Array): Kind | "image" | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const startsWith = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (startsWith(0x25, 0x50, 0x44, 0x46)) return "pdf"; // %PDF
  if (["png", "jpg", "jpeg", "heic", "heif", "webp", "gif"].includes(ext)) return "image";
  if (startsWith(0x89, 0x50, 0x4e, 0x47) || startsWith(0xff, 0xd8, 0xff)) return "image";
  if (ext === "docx" && startsWith(0x50, 0x4b)) return "docx"; // a zip
  if (["txt", "md", "markdown"].includes(ext)) return "text";
  return null;
}

function tidy(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractText(file: File): Promise<string> {
  if (file.size === 0) throw new ExtractError("That file is empty.");
  if (file.size > MAX_UPLOAD_BYTES) throw new ExtractError("That file is over 4 MB. Split it into smaller files, or paste the text instead.");
  return extractBytes(file.name, new Uint8Array(await file.arrayBuffer()));
}

// Text from a PDF, Word or text file already in memory (used for uploads that
// went straight to Storage, up to 25 MB).
export async function extractBytes(name: string, bytes: Uint8Array, opts: { allowLittleText?: boolean } = {}): Promise<string> {
  if (bytes.length === 0) throw new ExtractError("That file is empty.");
  const kind = kindOf(name, bytes);

  if (kind === "image") throw new ExtractError("Upload photos with the file uploader on Summaries, so their pictures can be read.");
  if (!kind) throw new ExtractError("That type of file isn't supported. Upload a PowerPoint (.pptx), PDF, Word (.docx), .txt or .md file.");

  let text = "";
  try {
    if (kind === "pdf") {
      const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(bytes);
      const result = await pdfText(pdf, { mergePages: true });
      text = Array.isArray(result.text) ? result.text.join("\n") : result.text;
    } else if (kind === "docx") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      text = result.value;
    } else {
      text = new TextDecoder("utf-8").decode(bytes);
    }
  } catch {
    if (kind === "pdf") throw new ExtractError("Couldn't read that PDF. It may be password-protected or damaged.");
    if (kind === "docx") throw new ExtractError("Couldn't read that Word file. Try saving it again as .docx, or upload a PDF.");
    throw new ExtractError("Couldn't read that file.");
  }

  const clean = tidy(text);
  // Uploads whose pictures will be read (scans, diagrams) can have little text.
  if (clean.length < 40 && opts.allowLittleText) return clean;
  if (clean.length < 40) {
    if (kind === "pdf") {
      throw new ExtractError(
        "This PDF has no text to read. It's probably a scan: upload it with the file uploader on Summaries, which reads the pages as pictures.",
      );
    }
    throw new ExtractError("There isn't enough text in that file to summarise.");
  }
  return clean;
}
