"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bold,
  Eraser,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Palette,
  Redo2,
  Underline,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface RichTextEditorProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (html: string) => void;
  helperText?: string;
  disabled?: boolean;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeDescriptionForEditor(value: string): string {
  if (!value) return "";
  const hasHtml = /<\/?[a-z][\s\S]*>/i.test(value);
  if (hasHtml) return value;
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function sanitizeDescriptionHtml(input: string): string {
  if (typeof window === "undefined") return input;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = input;

  const allowed = new Set([
    "B",
    "STRONG",
    "I",
    "EM",
    "U",
    "BR",
    "P",
    "DIV",
    "SPAN",
    "UL",
    "OL",
    "LI",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "HR",
  ]);
  const allowFontSizeOn = new Set(["P", "DIV", "SPAN", "LI", "H1", "H2", "H3", "H4", "H5", "H6"]);

  const isValidCssColor = (value: string) => {
    const v = value.trim().toLowerCase();
    if (!v) return false;
    if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v)) return true;
    if (/^rgba?\((\s*\d+\s*,){2}\s*\d+\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/.test(v)) return true;
    if (/^hsla?\((\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*)(,\s*(0|1|0?\.\d+)\s*)?\)$/.test(v)) return true;
    return false;
  };

  const sanitizeNode = (node: Node): Node | null => {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent ?? "");
    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const element = node as HTMLElement;
    const tag = element.tagName.toUpperCase();

    if (!allowed.has(tag)) {
      const fragment = document.createDocumentFragment();
      Array.from(element.childNodes).forEach((child) => {
        const cleaned = sanitizeNode(child);
        if (cleaned) fragment.appendChild(cleaned);
      });
      return fragment;
    }

    const out = document.createElement(tag.toLowerCase());

    if (allowFontSizeOn.has(tag)) {
      const rawFontSize = element.style.fontSize?.trim();
      if (rawFontSize) {
        const matched = rawFontSize.match(/^(\d{1,2})px$/);
        if (matched) {
          const size = Number(matched[1]);
          if (size >= 10 && size <= 48) out.style.fontSize = `${size}px`;
        }
      }

      const rawColor = element.style.color?.trim();
      if (rawColor && isValidCssColor(rawColor)) out.style.color = rawColor;

      const rawBackgroundColor = element.style.backgroundColor?.trim();
      if (rawBackgroundColor && isValidCssColor(rawBackgroundColor)) out.style.backgroundColor = rawBackgroundColor;
    }

    Array.from(element.childNodes).forEach((child) => {
      const cleaned = sanitizeNode(child);
      if (cleaned) out.appendChild(cleaned);
    });

    return out;
  };

  const cleanRoot = document.createElement("div");
  Array.from(wrapper.childNodes).forEach((child) => {
    const cleaned = sanitizeNode(child);
    if (cleaned) cleanRoot.appendChild(cleaned);
  });

  return cleanRoot.innerHTML
    .replace(/<div><br><\/div>/gi, "<br>")
    .replace(/(<br>\s*){3,}/gi, "<br><br>")
    .replace(/\u200B/g, "")
    .trim();
}

function markdownInlineToHtml(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*(?!\s)(.+?)(?<!\s)\*(?!\*)/g, "<em>$1</em>")
    .replace(/(?<!_)_(?!\s)(.+?)(?<!\s)_(?!_)/g, "<em>$1</em>");
}

function plainTextToHtml(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];

  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }

    if (/^([-*_])\1{2,}$/.test(line)) {
      blocks.push("<hr />");
      index += 1;
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      blocks.push(`<h${level}>${markdownInlineToHtml(headingMatch[2].trim())}</h${level}>`);
      index += 1;
      continue;
    }

    const bulletMatch = line.match(/^([-*•])\s+(.+)$/);
    const orderedMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (bulletMatch || orderedMatch) {
      const isOrdered = Boolean(orderedMatch);
      const items: string[] = [];

      while (index < lines.length) {
        const current = lines[index].trim();
        const currentBullet = current.match(/^([-*•])\s+(.+)$/);
        const currentOrdered = current.match(/^(\d+)\.\s+(.+)$/);
        if (!current) break;
        if (isOrdered && !currentOrdered) break;
        if (!isOrdered && !currentBullet) break;

        const itemText = (currentOrdered?.[2] ?? currentBullet?.[2] ?? "").trim();
        items.push(`<li>${markdownInlineToHtml(itemText)}</li>`);
        index += 1;
      }

      blocks.push(`<${isOrdered ? "ol" : "ul"}>${items.join("")}</${isOrdered ? "ol" : "ul"}>`);
      continue;
    }

    const paragraphLines = [line];
    index += 1;

    while (index < lines.length) {
      const current = lines[index].trim();
      if (!current) break;
      if (/^([-*•])\s+/.test(current) || /^\d+\.\s+/.test(current) || /^#{1,6}\s+/.test(current)) break;
      paragraphLines.push(current);
      index += 1;
    }

    blocks.push(`<p>${markdownInlineToHtml(paragraphLines.join(" "))}</p>`);
  }

  return blocks.join("");
}

function getSelectedRange(editor: HTMLDivElement | null): Range | null {
  if (typeof window === "undefined" || !editor) return null;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return null;
  return range;
}

export function RichTextEditor({
  id = "rich-text-editor",
  label = "Description",
  value,
  onChange,
  helperText = "Supports bold, italic, underline, lists, headings, text size, text color, highlight, clear formatting, and undo/redo. Drag the bottom-right corner to expand the editor.",
  disabled = false,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);
  const savedRangeRef = useRef<Range | null>(null);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const applyingHistoryRef = useRef(false);

  const [textSize, setTextSize] = useState<number>(16);
  const [textColor, setTextColor] = useState<string>("#111827");
  const [highlightColor, setHighlightColor] = useState<string>("#fff59d");
  const [commandState, setCommandState] = useState({ bold: false, italic: false, underline: false });

  useEffect(() => {
    if (!editorRef.current) return;
    const nextHtml = normalizeDescriptionForEditor(value);
    if (editorRef.current.innerHTML !== nextHtml) {
      syncingRef.current = true;
      editorRef.current.innerHTML = nextHtml;
      syncingRef.current = false;

      const seeded = sanitizeDescriptionHtml(nextHtml);
      historyRef.current = [seeded];
      historyIndexRef.current = 0;
    }
  }, [value]);

  const refreshCommandState = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) {
      setCommandState({ bold: false, italic: false, underline: false });
      return;
    }

    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) {
      setCommandState({ bold: false, italic: false, underline: false });
      return;
    }

    try {
      setCommandState({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
      });
    } catch {
      setCommandState({ bold: false, italic: false, underline: false });
    }
  };

  useEffect(() => {
    if (typeof document === "undefined") return;

    const handleSelectionChange = () => {
      const editor = editorRef.current;
      const selection = window.getSelection();
      if (!editor || !selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      if (editor.contains(range.commonAncestorContainer)) {
        savedRangeRef.current = range.cloneRange();
        refreshCommandState();
      } else {
        setCommandState({ bold: false, italic: false, underline: false });
      }
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);

  const pushHistory = (sanitizedHtml: string) => {
    if (applyingHistoryRef.current) return;
    const history = historyRef.current;
    const currentIndex = historyIndexRef.current;
    const currentValue = history[currentIndex];
    if (currentValue === sanitizedHtml) return;

    const nextHistory = history.slice(0, currentIndex + 1);
    nextHistory.push(sanitizedHtml);
    if (nextHistory.length > 200) nextHistory.shift();
    historyRef.current = nextHistory;
    historyIndexRef.current = nextHistory.length - 1;
  };

  const syncToParent = (recordHistory = true) => {
    if (disabled) return;
    const editor = editorRef.current;
    if (!editor) return;
    const sanitized = sanitizeDescriptionHtml(editor.innerHTML);
    onChange(sanitized);
    if (recordHistory) pushHistory(sanitized);
    refreshCommandState();
  };

  const saveSelection = () => {
    if (typeof window === "undefined") return;
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    savedRangeRef.current = range.cloneRange();
  };

  const restoreSelection = () => {
    if (typeof window === "undefined") return;
    const editor = editorRef.current;
    const savedRange = savedRangeRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || !savedRange) return;
    selection.removeAllRanges();
    selection.addRange(savedRange);
  };

  const applyInlineStyle = (styles: { color?: string; backgroundColor?: string }) => {
    if (disabled) return;
    const editor = editorRef.current;
    if (!editor || typeof window === "undefined") return;

    editor.focus();
    restoreSelection();
    const selection = window.getSelection();
    const range = getSelectedRange(editor);
    if (!selection || !range) return;

    const wrapper = document.createElement("span");
    if (styles.color) wrapper.style.color = styles.color;
    if (styles.backgroundColor) wrapper.style.backgroundColor = styles.backgroundColor;

    if (range.collapsed) {
      wrapper.innerHTML = "&#8203;";
      range.insertNode(wrapper);
    } else {
      const contents = range.extractContents();
      wrapper.appendChild(contents);
      range.insertNode(wrapper);
    }

    const nextRange = document.createRange();
    nextRange.selectNodeContents(wrapper);
    nextRange.collapse(false);
    selection.removeAllRanges();
    selection.addRange(nextRange);
    savedRangeRef.current = nextRange.cloneRange();
    syncToParent();
  };

  const applyList = (tag: "ul" | "ol") => {
    if (disabled) return;
    const editor = editorRef.current;
    if (!editor || typeof window === "undefined") return;

    editor.focus();
    restoreSelection();
    const selection = window.getSelection();
    const range = getSelectedRange(editor);
    if (!selection || !range) return;

    const list = document.createElement(tag);
    const li = document.createElement("li");
    if (range.collapsed) {
      li.innerHTML = "<br>";
      list.appendChild(li);
      range.insertNode(list);
    } else {
      const contents = range.extractContents();
      li.appendChild(contents);
      list.appendChild(li);
      range.insertNode(list);
    }

    const nextRange = document.createRange();
    nextRange.selectNodeContents(li);
    nextRange.collapse(false);
    selection.removeAllRanges();
    selection.addRange(nextRange);
    savedRangeRef.current = nextRange.cloneRange();
    syncToParent();
  };

  const applyCommand = (command: "bold" | "italic" | "underline") => {
    if (disabled) return;
    const editor = editorRef.current;
    if (!editor || typeof document === "undefined") return;

    editor.focus();
    restoreSelection();
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand(command, false);
    saveSelection();
    syncToParent();
  };

  const applyTextSize = (size: number) => {
    if (disabled) return;
    const editor = editorRef.current;
    if (!editor || typeof window === "undefined") return;

    setTextSize(size);
    editor.focus();
    restoreSelection();

    const selection = window.getSelection();
    const range = getSelectedRange(editor);
    if (!selection || !range) return;

    const span = document.createElement("span");
    span.style.fontSize = `${size}px`;

    if (range.collapsed) {
      span.innerHTML = "&#8203;";
      range.insertNode(span);
    } else {
      const extracted = range.extractContents();
      span.appendChild(extracted);
      range.insertNode(span);
    }

    const nextRange = document.createRange();
    nextRange.selectNodeContents(span);
    nextRange.collapse(false);
    selection.removeAllRanges();
    selection.addRange(nextRange);
    savedRangeRef.current = nextRange.cloneRange();
    syncToParent();
  };

  const clearFormatting = () => {
    if (disabled) return;
    const editor = editorRef.current;
    if (!editor || typeof window === "undefined") return;

    editor.focus();
    restoreSelection();
    const selection = window.getSelection();
    const range = getSelectedRange(editor);
    if (!selection || !range || range.collapsed) return;

    const fragment = range.cloneContents();
    const container = document.createElement("div");
    container.appendChild(fragment);
    const plain = container.textContent ?? "";

    range.deleteContents();
    const textNode = document.createTextNode(plain);
    range.insertNode(textNode);

    const nextRange = document.createRange();
    nextRange.setStartAfter(textNode);
    nextRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(nextRange);
    savedRangeRef.current = nextRange.cloneRange();
    syncToParent();
  };

  const applyHistory = (action: "undo" | "redo") => {
    if (disabled) return;
    const editor = editorRef.current;
    if (!editor) return;

    const history = historyRef.current;
    if (history.length === 0) return;

    if (action === "undo") {
      if (historyIndexRef.current <= 0) return;
      historyIndexRef.current -= 1;
    } else {
      if (historyIndexRef.current >= history.length - 1) return;
      historyIndexRef.current += 1;
    }

    const snapshot = history[historyIndexRef.current];
    applyingHistoryRef.current = true;
    syncingRef.current = true;
    editor.innerHTML = snapshot;
    syncingRef.current = false;
    applyingHistoryRef.current = false;
    saveSelection();
    syncToParent(false);
  };

  const insertHtmlAtSelection = (html: string) => {
    const editor = editorRef.current;
    if (!editor || typeof window === "undefined") return;

    editor.focus();
    restoreSelection();

    const selection = window.getSelection();
    const range = getSelectedRange(editor);
    if (!selection || !range) return;

    const sanitized = sanitizeDescriptionHtml(html);
    const container = document.createElement("div");
    container.innerHTML = sanitized;
    const fragment = document.createDocumentFragment();

    while (container.firstChild) {
      fragment.appendChild(container.firstChild);
    }

    range.deleteContents();
    const lastNode = fragment.lastChild;
    range.insertNode(fragment);

    if (lastNode) {
      const nextRange = document.createRange();
      nextRange.setStartAfter(lastNode);
      nextRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(nextRange);
      savedRangeRef.current = nextRange.cloneRange();
    }

    syncToParent();
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.preventDefault();

    const html = event.clipboardData.getData("text/html");

    if (html) {
      insertHtmlAtSelection(html);
      return;
    }

    const text = event.clipboardData.getData("text/plain");
    const asHtml = plainTextToHtml(text);
    insertHtmlAtSelection(asHtml);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const isCtrlOrCmd = event.ctrlKey || event.metaKey;
    if (!isCtrlOrCmd) return;

    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation?.();

    const key = event.key.toLowerCase();
    if (key === "b") {
      event.preventDefault();
      applyCommand("bold");
      return;
    }
    if (key === "i") {
      event.preventDefault();
      applyCommand("italic");
      return;
    }
    if (key === "u") {
      event.preventDefault();
      applyCommand("underline");
      return;
    }
    if (key === "z" && !event.shiftKey) {
      event.preventDefault();
      applyHistory("undo");
      return;
    }
    if (key === "y" || (key === "z" && event.shiftKey)) {
      event.preventDefault();
      applyHistory("redo");
    }
  };

  const activeButtonClass = "h-8 px-2 bg-zinc-900 text-white border-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100 dark:hover:bg-zinc-200";

  return (
    <div className="space-y-1.5 md:col-span-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="rounded-xl border border-input bg-background overflow-hidden" onMouseDownCapture={saveSelection} onPointerDownCapture={saveSelection}>
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-2 py-2 bg-muted/35">
          <Button type="button" variant="outline" size="sm" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => applyCommand("bold")} className={commandState.bold ? activeButtonClass : "h-8 px-2"}>
            <Bold className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => applyCommand("italic")} className={commandState.italic ? activeButtonClass : "h-8 px-2"}>
            <Italic className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => applyCommand("underline")} className={commandState.underline ? activeButtonClass : "h-8 px-2"}>
            <Underline className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => applyList("ul")} className="h-8 px-2">
            <List className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => applyList("ol")} className="h-8 px-2">
            <ListOrdered className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={clearFormatting} className="h-8 px-2">
            <Eraser className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => applyHistory("undo")} className="h-8 px-2">
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => applyHistory("redo")} className="h-8 px-2">
            <Redo2 className="h-4 w-4" />
          </Button>

          <div className="ml-1 flex items-center gap-2">
            <Label htmlFor={`${id}-size`} className="text-xs text-muted-foreground">Text Size</Label>
            <select id={`${id}-size`} value={textSize} disabled={disabled} onMouseDown={saveSelection} onPointerDown={saveSelection} onChange={(event) => applyTextSize(Number(event.target.value))} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              {[12, 14, 16, 18, 20, 24, 28, 32].map((size) => (
                <option key={size} value={size}>{size}px</option>
              ))}
            </select>
          </div>

          <div className="ml-1 flex items-center gap-1.5">
            <Palette className="h-4 w-4 text-muted-foreground" />
            <input type="color" aria-label="Text color" value={textColor} disabled={disabled} onMouseDown={saveSelection} onPointerDown={saveSelection} onChange={(event) => { setTextColor(event.target.value); applyInlineStyle({ color: event.target.value }); }} className="h-8 w-8 cursor-pointer rounded border border-input bg-background p-0" />
          </div>

          <div className="ml-1 flex items-center gap-1.5">
            <Highlighter className="h-4 w-4 text-muted-foreground" />
            <input type="color" aria-label="Highlight color" value={highlightColor} disabled={disabled} onMouseDown={saveSelection} onPointerDown={saveSelection} onChange={(event) => { setHighlightColor(event.target.value); applyInlineStyle({ backgroundColor: event.target.value }); }} className="h-8 w-8 cursor-pointer rounded border border-input bg-background p-0" />
          </div>
        </div>

        <div
          id={id}
          ref={editorRef}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={() => {
            if (syncingRef.current) return;
            saveSelection();
            syncToParent();
          }}
          onMouseUp={saveSelection}
          onKeyUp={saveSelection}
          onKeyDown={handleKeyDown}
          onBlur={saveSelection}
          onPaste={handlePaste}
          className="min-h-36 max-h-104 w-full resize-y overflow-auto px-3 py-2 text-sm leading-relaxed focus:outline-none [&_ul]:my-2 [&_ul]:ml-6 [&_ul]:list-disc [&_ol]:my-2 [&_ol]:ml-6 [&_ol]:list-decimal [&_li]:my-1 [&_h1]:mb-2 [&_h1]:text-2xl [&_h1]:font-black [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-bold [&_h4]:mb-1 [&_h4]:text-base [&_h4]:font-semibold [&_h5]:mb-1 [&_h5]:text-sm [&_h5]:font-semibold [&_h6]:mb-1 [&_h6]:text-xs [&_h6]:font-semibold [&_hr]:my-3 [&_hr]:border-border"
          aria-label="Description editor"
        />
      </div>
      <p className="text-xs text-muted-foreground">{helperText}</p>
    </div>
  );
}
