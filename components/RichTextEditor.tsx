"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";

// A small formatted-text box for typed answers. It uses the browser's built-in
// editing commands, so there's no editor library to load. The formatting is only
// for the student: the AI gets plain text from toPlainText. Pasted content is
// inserted as plain text, so no outside HTML ever gets into the page.

export type RichTextHandle = { clear: () => void };

const STYLES = [
  { value: "p", label: "Normal text" },
  { value: "h2", label: "Title" },
  { value: "h3", label: "Heading" },
];

const SIZES = [
  { value: "2", label: "Small" },
  { value: "3", label: "Medium" },
  { value: "5", label: "Large" },
  { value: "6", label: "Extra large" },
];

const BUTTONS = [
  { command: "bold", label: "B", name: "Bold", className: "rte-b" },
  { command: "italic", label: "I", name: "Italic", className: "rte-i" },
  { command: "underline", label: "U", name: "Underline", className: "rte-u" },
  { command: "superscript", label: "x²", name: "Superscript, for powers", className: "" },
  { command: "subscript", label: "x₂", name: "Subscript", className: "" },
  { command: "insertUnorderedList", label: "• List", name: "Bulleted list", className: "" },
  { command: "insertOrderedList", label: "1. List", name: "Numbered list", className: "" },
];

function raised(marker: string, content: string): string {
  if (!content) return ""; // an empty tag left behind by the editor
  return /^\w+$/.test(content) ? `${marker}${content}` : `${marker}(${content})`;
}

// Keeps what changes the meaning of an answer (powers, subscripts, headings, lists)
// and drops what doesn't (bold, size).
export function toPlainText(root: Node): string {
  function walk(node: Node, listIndex?: number): string {
    if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").replace(/ /g, " ");
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const tag = (node as Element).tagName;
    if (tag === "BR") return "\n";

    let itemNumber = 0;
    const inner = Array.from(node.childNodes)
      .map((child) => {
        const isItem = (child as Element).tagName === "LI";
        if (isItem) itemNumber += 1;
        return walk(child, tag === "OL" && isItem ? itemNumber : undefined);
      })
      .join("");

    switch (tag) {
      case "SUP":
        return raised("^", inner.trim());
      case "SUB":
        return raised("_", inner.trim());
      case "H2":
      case "H3":
        return `\n# ${inner.trim()}\n`;
      case "LI":
        return `\n${listIndex ? `${listIndex}.` : "-"} ${inner.trim()}\n`;
      case "P":
      case "DIV":
      case "UL":
      case "OL":
      case "BLOCKQUOTE":
        return `\n${inner}\n`;
      default:
        return inner;
    }
  }

  return walk(root)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function RichTextEditor({
  ref,
  onChange,
  placeholder,
  ariaLabel,
}: {
  ref?: Ref<RichTextHandle>;
  onChange: (plainText: string) => void;
  placeholder: string;
  ariaLabel: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const [empty, setEmpty] = useState(true);
  const [active, setActive] = useState<string[]>([]);
  const [block, setBlock] = useState("p");
  const [size, setSize] = useState("3");

  function refreshToolbar() {
    setActive(BUTTONS.map((b) => b.command).filter((c) => document.queryCommandState(c)));
    const value = document.queryCommandValue("formatBlock").toLowerCase();
    setBlock(value === "h2" || value === "h3" ? value : "p");
    const fontSize = String(document.queryCommandValue("fontSize"));
    setSize(SIZES.some((s) => s.value === fontSize) ? fontSize : "3");
  }

  function selectionInEditor(): Range | null {
    const selection = document.getSelection();
    const editor = editorRef.current;
    if (!selection || !editor || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    return editor.contains(range.commonAncestorContainer) ? range : null;
  }

  useEffect(() => {
    document.execCommand("defaultParagraphSeparator", false, "p");

    function onSelectionChange() {
      if (selectionInEditor()) refreshToolbar();
    }

    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  function changed() {
    const editor = editorRef.current;
    if (!editor) return;
    const text = toPlainText(editor);
    setEmpty(text === "");
    onChange(text);
  }

  function run(command: string, value?: string) {
    const editor = editorRef.current;
    if (!editor) return;
    // A dropdown takes focus from the text, so put the cursor back where it was.
    // Only then: restoring it otherwise would undo a pending bold, or jump backwards.
    if (document.activeElement !== editor) {
      editor.focus();
      if (savedRange.current) {
        const selection = document.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(savedRange.current);
      }
    }
    document.execCommand(command, false, value);
    changed();
    refreshToolbar();
  }

  useImperativeHandle(ref, () => ({
    clear() {
      if (editorRef.current) editorRef.current.innerHTML = "";
      savedRange.current = null;
      setEmpty(true);
    },
  }));

  return (
    <div className="rte">
      <div className="tool-row" role="toolbar" aria-label="Text formatting">
        <select
          className="input tool-select"
          aria-label="Text style"
          value={block}
          onChange={(e) => run("formatBlock", `<${e.target.value}>`)}
        >
          {STYLES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          className="input tool-select"
          aria-label="Font size"
          value={size}
          onChange={(e) => run("fontSize", e.target.value)}
        >
          {SIZES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        {BUTTONS.map((b) => (
          <button
            key={b.command}
            type="button"
            className={`tool-btn${active.includes(b.command) ? " is-active" : ""}`}
            aria-label={b.name}
            title={b.name}
            aria-pressed={active.includes(b.command)}
            // Stops the press from moving focus, which would lose the selection.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => run(b.command)}
          >
            <span className={b.className}>{b.label}</span>
          </button>
        ))}
      </div>
      <div
        ref={editorRef}
        className={`input rte-box${empty ? " is-empty" : ""}`}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        data-placeholder={placeholder}
        onInput={(e) => {
          // Browsers carry a power or subscript onto the next line. It never belongs there.
          if ((e.nativeEvent as InputEvent).inputType === "insertParagraph") {
            for (const command of ["superscript", "subscript"]) {
              if (document.queryCommandState(command)) document.execCommand(command);
            }
            refreshToolbar();
          }
          changed();
        }}
        onBlur={() => {
          savedRange.current = selectionInEditor()?.cloneRange() ?? savedRange.current;
        }}
        onPaste={(e) => {
          e.preventDefault();
          document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
          changed();
        }}
        onDrop={(e) => e.preventDefault()}
      />
    </div>
  );
}
