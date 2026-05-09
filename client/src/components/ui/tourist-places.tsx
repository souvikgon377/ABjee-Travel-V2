import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { uploadImageToR2 } from '@/lib/r2Upload';
import {
  MapPin,
  Plus,
  Trash2,
  Pencil,
  X,
  Loader2,
  Image as ImageIcon,
  Check,
  Video,
  Map as MapIcon,
  Play,
  ChevronLeft,
  ChevronRight,
  Eye,
  Star,
  FileText,
  Globe,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { modernConfirm } from '@/lib/modernDialog';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { adminAPI } from '@/lib/api';
import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';

// ─── Types ───────────────────────────────────────────────────────────────────
export interface MediaItem {
  url: string;
  publicId: string;
  type: 'image' | 'video';
  thumbnail?: string;
  caption?: string;
}

export interface InfoSection {
  id: string;
  heading: string;
  description: string;
}

export interface TouristPlace {
  id?: string;
  name: string;
  area: string;
  city?: string;
  state: string;
  country: string;
  description: string;
  category: string;
  isActive?: boolean;
  googleMapsUrl: string;
  coverImage: string;
  media: MediaItem[];
  extraInfo: InfoSection[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

interface TouristImportSummary {
  totalRows: number;
  importedRows: number;
  failedRows: number;
  errors: string[];
}

interface MigrationProgress {
  jobId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  total: number;
  processed: number;
  updated: number;
  skipped: number;
  startedAt: string;
  finishedAt?: string;
  error?: string;
}

interface TouristPlacesSummary {
  totalCount: number;
  categories: Record<string, number>;
  updatedAtLabel: string | null;
}

interface TouristPlacesListCache {
  places: TouristPlace[];
  hasMore: boolean;
  lastFetchMs: number;
}

interface TouristPlacesFilters {
  search: string;
  location: string;
  status: 'all' | 'photos-added' | 'photos-not-added' | 'recently-updated';
}

export function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function stripRichTextTags(html: string) {
  const tmp = document.createElement('DIV');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

// ─── Constants ───────────────────────────────────────────────────────────────
const CATEGORIES = [
  'Temple / Religious',
  'Nature / Wildlife',
  'Beach',
  'Hill Station',
  'Historical / Heritage',
  'Adventure',
  'City / Urban',
  'Other',
];
const EMPTY_FORM: Omit<TouristPlace, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '',
  area: '',
  city: '',
  state: '',
  country: 'India',
  description: '',
  category: 'Other',
  isActive: true,
  googleMapsUrl: '',
  coverImage: '',
  media: [],
  extraInfo: [],
};

const TOURIST_CSV_TEMPLATE_TEXT = `Name,Area,City,State,Country,Category,Description,Google Maps URL,Extra Info
Mysore Palace,Karnataka Heritage Zone,Mysore,Karnataka,India,Historical,"A grand palace known for Indo-Saracenic architecture and evening illumination.","https://maps.google.com/?q=Mysore+Palace","Best Time::Oct to Mar|Highlights::Palace illumination|Highlights::Museum galleries"`;
const TOURIST_PLACES_CACHE_KEY = 'tourist-places-admin-list';
const TOURIST_PLACES_PAGE_SIZE = 30;
const TOURIST_PLACES_SEARCH_DEBOUNCE_MS = 450;
const TOURIST_PLACES_SUMMARY_COLLECTION = 'tourPlaces_summary';
const TOURIST_PLACES_SUMMARY_DOC = 'metadata';

const toMillis = (value: unknown): number => {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value === 'object' && value !== null) {
    const candidate = value as { toDate?: () => Date; seconds?: number; nanoseconds?: number };
    if (typeof candidate.toDate === 'function') return candidate.toDate().getTime();
    if (typeof candidate.seconds === 'number') {
      return (candidate.seconds * 1000) + Math.floor((candidate.nanoseconds || 0) / 1_000_000);
    }
  }
  return 0;
};

const compareTouristPlaces = (left: TouristPlace, right: TouristPlace) => {
  const leftPopularity = Number((left as Record<string, unknown>).popularity ?? 0);
  const rightPopularity = Number((right as Record<string, unknown>).popularity ?? 0);
  if (leftPopularity !== rightPopularity) {
    return rightPopularity - leftPopularity;
  }

  const leftUpdatedAt = toMillis(left.updatedAt ?? left.createdAt);
  const rightUpdatedAt = toMillis(right.updatedAt ?? right.createdAt);
  if (leftUpdatedAt !== rightUpdatedAt) {
    return rightUpdatedAt - leftUpdatedAt;
  }

  return String(left.name || '').localeCompare(String(right.name || ''));
};

const sortTouristPlaces = (items: TouristPlace[]) => [...items].sort(compareTouristPlaces);

// ─── Video upload (R2 S3-compatible API) ───────────────────────────────────
async function uploadVideoToR2(file: File): Promise<MediaItem> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder', 'tourist-places/videos');

  const response = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  });

  const payload = await response.json().catch(() => ({})) as {
    url?: string;
    key?: string;
    publicId?: string;
    thumbnail?: string;
    error?: string;
  };

  if (!response.ok || !payload.url) {
    throw new Error(payload.error || 'Failed to upload video.');
  }

  return {
    url: payload.url,
    publicId: payload.publicId || payload.key || payload.url,
    type: 'video',
    thumbnail: payload.thumbnail,
  };
}

function detectDelimiter(text: string): ',' | ';' | '\t' | '|' {
  const delimiters: Array<',' | ';' | '\t' | '|'> = [',', ';', '\t', '|'];
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20);

  if (lines.length === 0) return ',';

  let best: ',' | ';' | '\t' | '|' = ',';
  let bestScore = -1;

  for (const delimiter of delimiters) {
    const counts = lines.map((line) => line.split(delimiter).length);
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    const avg = counts.reduce((sum, count) => sum + count, 0) / counts.length;
    const score = avg - (max - min);

    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }

  return best;
}

function parseCsvTable(text: string, delimiter: ',' | ';' | '\t' | '|'): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i += 1;
      }

      currentRow.push(currentCell.trim());
      currentCell = '';

      const hasData = currentRow.some((cell) => cell.length > 0);
      if (hasData) rows.push(currentRow);
      currentRow = [];
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((cell) => cell.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const HEADER_ALIASES: Record<string, string> = {
  name: 'name',
  title: 'name',
  place: 'name',
  area: 'area',
  city: 'city',
  location: 'area',
  state: 'state',
  province: 'state',
  country: 'country',
  category: 'category',
  type: 'category',
  description: 'description',
  details: 'description',
  googlemapsurl: 'googleMapsUrl',
  mapsurl: 'googleMapsUrl',
  googlemaps: 'googleMapsUrl',
  mapurl: 'googleMapsUrl',
  extrainfo: 'extraInfo',
  info: 'extraInfo',
};

function normalizeHeaderToField(value: string): string {
  const normalized = normalizeHeader(value);
  return HEADER_ALIASES[normalized] || normalized;
}

function normalize(v: any) {
  return String(v ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSearchIndexFields(place: { name: string; area?: string; city?: string; state?: string; country?: string }) {
  const data = {
    name: place.name,
    area: place.area || '',
    city: place.city || '',
    state: place.state || '',
    country: place.country || '',
  };

  return {
    name_lower: normalize(data.name),
    location_search: normalize(
      [data.country, data.state, data.city, data.area].filter(Boolean).join(' ')
    ),
    location_lower: normalize(
      [data.city, data.area, data.state, data.country].filter(Boolean).join(' ')
    ),
  };
}

function normalizeImportedText(value: string): string {
  if (!value) return '';
  return value
    .replace(/<br\s*\/?>(\s*)/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseExtraInfo(value: string): InfoSection[] {
  if (!value.trim()) return [];

  return value
    .split('|')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment, index) => {
      const [rawHeading, ...rest] = segment.split('::');
      const heading = (rawHeading || '').trim() || `Info ${index + 1}`;
      const description = rest.join('::').trim() || heading;

      return {
        id: `extra-${index}-${heading.toLowerCase().replace(/\s+/g, '-')}`,
        heading,
        description,
      };
    });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeDescriptionForEditor(value: string): string {
  if (!value) return '';
  const hasHtml = /<\/?[a-z][\s\S]*>/i.test(value);
  if (hasHtml) return value;
  return escapeHtml(value).replace(/\n/g, '<br>');
}

function sanitizeDescriptionHtml(input: string): string {
  if (typeof window === 'undefined') return input;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = input;

  const allowed = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'P', 'DIV', 'SPAN', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR']);
  const allowFontSizeOn = new Set(['P', 'DIV', 'SPAN', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

  const isValidCssColor = (value: string) => {
    const v = value.trim().toLowerCase();
    if (!v) return false;
    if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v)) return true;
    if (/^rgba?\((\s*\d+\s*,){2}\s*\d+\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/.test(v)) return true;
    if (/^hsla?\((\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*)(,\s*(0|1|0?\.\d+)\s*)?\)$/.test(v)) return true;
    return false;
  };

  const sanitizeNode = (node: Node): Node | null => {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent ?? '');
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

  const cleanRoot = document.createElement('div');
  Array.from(wrapper.childNodes).forEach((child) => {
    const cleaned = sanitizeNode(child);
    if (cleaned) cleanRoot.appendChild(cleaned);
  });

  return cleanRoot.innerHTML
    .replace(/<div><br><\/div>/gi, '<br>')
    .replace(/(<br>\s*){3,}/gi, '<br><br>')
    .replace(/\u200B/g, '')
    .trim();
}

function markdownInlineToHtml(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*(?!\s)(.+?)(?<!\s)\*(?!\*)/g, '<em>$1</em>')
    .replace(/(?<!_)_(?!\s)(.+?)(?<!\s)_(?!_)/g, '<em>$1</em>');
}

function plainTextToHtml(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: string[] = [];

  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }

    if (/^([-*_])\1{2,}$/.test(line)) {
      blocks.push('<hr />');
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

        const itemText = (currentOrdered?.[2] ?? currentBullet?.[2] ?? '').trim();
        items.push(`<li>${markdownInlineToHtml(itemText)}</li>`);
        index += 1;
      }

      blocks.push(`<${isOrdered ? 'ol' : 'ul'}>${items.join('')}</${isOrdered ? 'ol' : 'ul'}>`);
      continue;
    }

    const paragraphLines = [line];
    index += 1;

    while (index < lines.length) {
      const current = lines[index].trim();
      if (!current) break;
      if (/^([-*•])\s+/.test(current) || /^\d+\.\s+/.test(current)) break;
      paragraphLines.push(current);
      index += 1;
    }

    blocks.push(`<p>${markdownInlineToHtml(paragraphLines.join(' '))}</p>`);
  }

  return blocks.join('');
}

function getSelectedDescriptionRange(editor: HTMLDivElement | null): Range | null {
  if (typeof window === 'undefined' || !editor) return null;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return null;
  return range;
}

// ─── Pending file item ───────────────────────────────────────────────────────
interface PendingFile {
  id: string;
  file: File;
  preview: string;
  type: 'image' | 'video';
  progress: 'idle' | 'uploading' | 'done' | 'error';
  errorMsg?: string;
  result?: MediaItem;
  thumbnailFile?: File;
  thumbnailPreview?: string;
  caption?: string;
}

// ─── Gallery Modal ────────────────────────────────────────────────────────────
function GalleryModal({
  media,
  startIndex,
  onClose,
}: {
  media: MediaItem[];
  startIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const item = media[index];
  const prev = () => setIndex((i) => (i - 1 + media.length) % media.length);
  const next = () => setIndex((i) => (i + 1) % media.length);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.88, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.88, y: 24 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className="relative max-w-4xl w-full flex flex-col items-center gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <motion.button
          whileHover={{ scale: 1.1, rotate: 90 }}
          whileTap={{ scale: 0.9 }}
          onClick={onClose}
          className="absolute -top-12 right-0 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors"
        >
          <X className="h-6 w-6" />
        </motion.button>

        {/* Media display with slide transition */}
        <div className="w-full rounded-2xl overflow-hidden bg-black shadow-2xl shadow-black/60 ring-1 ring-white/10 max-h-[70vh] flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={index}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.22, ease: 'easeInOut' }}
              className="w-full"
            >
              {item.type === 'video' ? (
                <video src={item.url} controls className="max-h-[70vh] w-full" />
              ) : (
                <img src={item.url} alt="" className="max-h-[70vh] w-full object-contain" />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Caption */}
        {item.caption && (
          <motion.p
            key={`cap-${index}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-white/70 text-sm text-center px-6"
          >
            {item.caption}
          </motion.p>
        )}

        {media.length > 1 && (
          <div className="flex items-center gap-4">
            <motion.button
              whileHover={{ scale: 1.12 }}
              whileTap={{ scale: 0.9 }}
              onClick={prev}
              className="p-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white backdrop-blur-sm border border-white/10 transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </motion.button>
            <span className="text-white/70 text-sm font-medium tabular-nums">{index + 1} / {media.length}</span>
            <motion.button
              whileHover={{ scale: 1.12 }}
              whileTap={{ scale: 0.9 }}
              onClick={next}
              className="p-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white backdrop-blur-sm border border-white/10 transition-colors"
            >
              <ChevronRight className="h-5 w-5" />
            </motion.button>
          </div>
        )}

        {/* Dot indicators */}
        {media.length > 1 && media.length <= 12 && (
          <div className="flex gap-1.5">
            {media.map((_, i) => (
              <motion.button
                key={i}
                onClick={() => setIndex(i)}
                animate={{ scale: i === index ? 1.3 : 1, opacity: i === index ? 1 : 0.4 }}
                className={`w-2 h-2 rounded-full transition-colors ${i === index ? 'bg-white' : 'bg-white/40 hover:bg-white/70'}`}
              />
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export function TouristPlacesManager() {
  const [places, setPlaces] = useState<TouristPlace[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [cityInput, setCityInput] = useState('');
  const [statusInput, setStatusInput] = useState<TouristPlacesFilters['status']>('all');
  const [appliedFilters, setAppliedFilters] = useState<TouristPlacesFilters>({
    search: '',
    location: '',
    status: 'all',
  });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [scanningFilters, setScanningFilters] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [lastFetchMs, setLastFetchMs] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [summary, setSummary] = useState<TouristPlacesSummary>({
    totalCount: 0,
    categories: {},
    updatedAtLabel: null,
  });

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const lastDocRef = useRef<number | null>(null);
  const lastPageNum = lastDocRef.current;
  const appliedFiltersRef = useRef(appliedFilters);
  const lastAppliedFilterKeyRef = useRef('');
  const inFlightListRequestsRef = useRef(new Map<string, Promise<unknown>>());

  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importingCsv, setImportingCsv] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importError, setImportError] = useState('');
  const [importSummary, setImportSummary] = useState<TouristImportSummary | null>(null);
  const [copiedTemplate, setCopiedTemplate] = useState(false);
  const [migrationJobId, setMigrationJobId] = useState<string | null>(null);
  const [migrationProgress, setMigrationProgress] = useState<MigrationProgress | null>(null);
  const [migrationStarting, setMigrationStarting] = useState(false);

  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryMedia, setGalleryMedia] = useState<MediaItem[]>([]);
  const [galleryStart, setGalleryStart] = useState(0);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);      // for saved video thumbnails
  const pendingThumbInputRef = useRef<HTMLInputElement>(null);   // for pending video thumbnails
  const descriptionEditorRef = useRef<HTMLDivElement>(null);
  const syncingDescriptionRef = useRef(false);
  const savedDescriptionRangeRef = useRef<Range | null>(null);
  const descriptionHistoryRef = useRef<string[]>([]);
  const descriptionHistoryIndexRef = useRef<number>(-1);
  const applyingDescriptionHistoryRef = useRef(false);
  const [thumbnailTarget, setThumbnailTarget] = useState<string | null>(null);
  const [pendingThumbTarget, setPendingThumbTarget] = useState<string | null>(null);
  const [descriptionTextSize, setDescriptionTextSize] = useState<number>(16);
  const [descriptionTextColor, setDescriptionTextColor] = useState<string>('#111827');
  const [descriptionHighlightColor, setDescriptionHighlightColor] = useState<string>('#fff59d');
  const [descriptionCommandState, setDescriptionCommandState] = useState({
    bold: false,
    italic: false,
    underline: false,
  });

  const buildFilterCacheKey = useCallback((filters: TouristPlacesFilters) => {
    return `${TOURIST_PLACES_CACHE_KEY}:${filters.search.trim().toLowerCase()}:${filters.location.trim().toLowerCase()}:${filters.status}`;
  }, []);

  const matchesContentFilter = useCallback((place: TouristPlace, status: TouristPlacesFilters['status']) => {
    const hasPhotos = Boolean(place.coverImage) || (place.media?.length || 0) > 0;
    const updatedAtValue = place.updatedAt instanceof Date
      ? place.updatedAt.getTime()
      : place.updatedAt && typeof place.updatedAt === 'object' && 'toDate' in place.updatedAt
        ? (place.updatedAt as { toDate: () => Date }).toDate().getTime()
        : 0;

    if (status === 'photos-added') return hasPhotos;
    if (status === 'photos-not-added') return !hasPhotos;
    if (status === 'recently-updated') {
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      return Boolean(updatedAtValue && updatedAtValue >= sevenDaysAgo);
    }
    return true;
  }, []);

  const matchesLocationFilter = useCallback((place: TouristPlace, locationInput: string) => {
    const normalized = locationInput.trim().toLowerCase();
    if (!normalized) return true;

    const haystack = [place.city, place.area, place.state, place.country]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(normalized);
  }, []);

  const matchesSearchFilter = useCallback((place: TouristPlace, searchInputValue: string) => {
    const normalized = searchInputValue.trim().toLowerCase();
    if (!normalized) return true;

    const tokens = normalized.split(/\s+/).filter(Boolean);
    const haystack = [place.name, place.city, place.area, place.state, place.country]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (haystack.includes(normalized)) return true;
    return tokens.length > 0 && tokens.every((token) => haystack.includes(token));
  }, []);

  const applyClientFilters = useCallback((items: TouristPlace[], filters: TouristPlacesFilters) => {
    console.log({ resultsBeforeFilter: items.length, query: filters.search });
    return items.filter((place) => (
      matchesContentFilter(place, filters.status)
      && matchesLocationFilter(place, filters.location)
      && matchesSearchFilter(place, filters.search)
    ));
  }, [matchesContentFilter, matchesLocationFilter, matchesSearchFilter]);

  const mapTouristPlaceDoc = useCallback((docSnap: QueryDocumentSnapshot<DocumentData>): TouristPlace => {
    const raw = docSnap.data() as Omit<TouristPlace, 'id'>;
    return {
      id: docSnap.id,
      city: raw.city || raw.area || '',
      isActive: raw.isActive ?? true,
      ...raw,
    };
  }, []);

  const normalizeTouristPlaceRow = useCallback((row: unknown): TouristPlace | null => {
    if (!row || typeof row !== 'object') return null;

    const raw = row as Record<string, unknown>;
    const id = typeof raw.id === 'string' ? raw.id : undefined;
    if (!id) return null;

    return {
      id,
      name: String(raw.name || ''),
      area: String(raw.area || ''),
      city: String(raw.city || raw.area || ''),
      state: String(raw.state || ''),
      country: String(raw.country || ''),
      description: String(raw.description || ''),
      category: String(raw.category || 'Other'),
      isActive: raw.isActive !== false,
      googleMapsUrl: String(raw.googleMapsUrl || ''),
      coverImage: String(raw.coverImage || ''),
      media: Array.isArray(raw.media) ? (raw.media as MediaItem[]) : [],
      extraInfo: Array.isArray(raw.extraInfo) ? (raw.extraInfo as InfoSection[]) : [],
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }, []);

  const mergePlaces = useCallback((current: TouristPlace[], updates: TouristPlace[]) => {
    const byId = new Map<string, TouristPlace>();
    current.forEach((place) => {
      if (place.id) byId.set(place.id, place);
    });
    updates.forEach((place) => {
      if (place.id) byId.set(place.id, place);
    });
    return sortTouristPlaces(Array.from(byId.values()));
  }, []);

  const fetchSummary = useCallback(async () => {
    try {
      const response = await adminAPI.getTouristPlaceList({ page: 1, limit: TOURIST_PLACES_PAGE_SIZE });
      const data = response.data?.data ?? response.data ?? {};
      const totalCount = Number(data.totalCount || 0);
      setSummary((current) => ({
        ...current,
        totalCount,
        updatedAtLabel: new Date().toLocaleString(),
      }));
    } catch {
      // Summary is optional and should not block list operations.
    }
  }, []);

  const updateSummary = useCallback(async (delta: { total?: number; categoryDelta?: Record<string, number> }) => {
    setSummary((current) => ({
      ...current,
      totalCount: Math.max(0, current.totalCount + (delta.total || 0)),
      updatedAtLabel: new Date().toLocaleString(),
    }));
  }, []);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchPlaces = useCallback(async (options?: { reset?: boolean; forceRefresh?: boolean; filters?: TouristPlacesFilters }) => {
    const selectedFilters = options?.filters ?? appliedFiltersRef.current;
    const reset = options?.reset ?? false;
    if (reset) setLoading(true);
    else setLoadingMore(true);
    setScanningFilters(false);

    try {
      const nextPage = reset ? 1 : ((lastDocRef.current || 0) + 1);
      const requestKey = [
        buildFilterCacheKey(selectedFilters),
        `page:${nextPage}`,
        `limit:${TOURIST_PLACES_PAGE_SIZE}`,
      ].join(':');
      let request = inFlightListRequestsRef.current.get(requestKey);

      if (!request) {
        request = adminAPI.getTouristPlaceList({
          search: selectedFilters.search,
          location: selectedFilters.location,
          filter: selectedFilters.status,
          page: nextPage,
          limit: TOURIST_PLACES_PAGE_SIZE,
        }).finally(() => {
          inFlightListRequestsRef.current.delete(requestKey);
        });
        inFlightListRequestsRef.current.set(requestKey, request);
      }

      const response = await request as Awaited<ReturnType<typeof adminAPI.getTouristPlaceList>>;
      console.info('[TouristPlaces] API_CALL', {
        requestKey,
        search: selectedFilters.search,
        location: selectedFilters.location,
        filter: selectedFilters.status,
        page: nextPage,
        limit: TOURIST_PLACES_PAGE_SIZE,
      });
      const data = response.data?.data ?? response.data ?? {};
      const incoming = Array.isArray(data.rows)
        ? data.rows
            .map((item: unknown) => normalizeTouristPlaceRow(item))
            .filter((item: TouristPlace | null): item is TouristPlace => item !== null)
        : [];

      setPlaces((prev) => (reset ? sortTouristPlaces(incoming) : mergePlaces(prev, incoming)));
      lastDocRef.current = nextPage;
      setHasMore(Boolean(data.hasMore));
      setLastFetchMs(Date.now());
      setSummary((current) => ({
        ...current,
        totalCount: Number(data.totalCount || current.totalCount || 0),
        updatedAtLabel: new Date().toLocaleString(),
      }));
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[TouristPlaces] fetchPlaces failed:', error);
      }
      flash('Failed to load tourist places.', 'error');
    } finally {
      setScanningFilters(false);
      if (reset) setLoading(false);
      else setLoadingMore(false);
    }
    }, [buildFilterCacheKey, mergePlaces, normalizeTouristPlaceRow]);

  useEffect(() => {
    appliedFiltersRef.current = appliedFilters;
  }, [appliedFilters]);

  const handleUpdateCache = useCallback(async () => {
    setLoading(true);
    try {
      await adminAPI.updatePlacesCache();
      await fetchPlaces({ reset: true, filters: appliedFilters });
      await fetchSummary();
    } catch {
      flash('Failed to update the shared cache.', 'error');
    } finally {
      setLoading(false);
    }
  }, [appliedFilters, fetchPlaces, fetchSummary]);

  useEffect(() => {
    const initialFilters = {
      search: '',
      location: '',
      status: 'all' as const,
    };
    lastAppliedFilterKeyRef.current = buildFilterCacheKey(initialFilters);
    void fetchPlaces({
      reset: true,
      filters: initialFilters,
    });
    void fetchSummary();
  }, [buildFilterCacheKey, fetchPlaces, fetchSummary]);


  const flash = (msg: string, type: 'success' | 'error') => {
    if (type === 'success') { setSuccess(msg); setTimeout(() => setSuccess(''), 1200); }
    else { setError(msg); setTimeout(() => setError(''), 1800); }
  };

  const resetForm = () => {
    setForm({ ...EMPTY_FORM });
    setPendingFiles((prev) => {
      prev.forEach((p) => {
        URL.revokeObjectURL(p.preview);
        if (p.thumbnailPreview) URL.revokeObjectURL(p.thumbnailPreview);
      });
      return [];
    });
    setThumbnailTarget(null);
    setPendingThumbTarget(null);
    setEditingId(null);
    setEditingCategory(null);
    setShowForm(false);
    setError('');
  };

  const handleEdit = async (placeId: string) => {
    const place = places.find((item) => item.id === placeId);
    if (!place) {
      flash('Tourist place no longer exists in the current list.', 'error');
      return;
    }

    setForm({
      name: place.name,
      area: place.area || '',
      city: place.city || place.area || '',
      state: place.state,
      country: place.country,
      description: place.description,
      category: place.category,
      isActive: place.isActive ?? true,
      googleMapsUrl: place.googleMapsUrl || '',
      coverImage: place.coverImage || '',
      media: place.media || [],
      extraInfo: (place.extraInfo || []).map((s) => ({
        ...s,
        id: s.id || `${Date.now()}-${Math.random()}`,
      })),
    });
    setPendingFiles([]);
    setEditingId(place.id || null);
    setEditingCategory(place.category);
    setShowForm(true);
  };

  useEffect(() => {
    if (!showForm || !descriptionEditorRef.current) return;
    const nextHtml = normalizeDescriptionForEditor(form.description);
    if (descriptionEditorRef.current.innerHTML !== nextHtml) {
      syncingDescriptionRef.current = true;
      descriptionEditorRef.current.innerHTML = nextHtml;
      syncingDescriptionRef.current = false;

      const seeded = sanitizeDescriptionHtml(nextHtml);
      descriptionHistoryRef.current = [seeded];
      descriptionHistoryIndexRef.current = 0;
    }
  }, [form.description, showForm]);

  const refreshDescriptionCommandState = () => {
    const editor = descriptionEditorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) {
      setDescriptionCommandState({ bold: false, italic: false, underline: false });
      return;
    }

    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) {
      setDescriptionCommandState({ bold: false, italic: false, underline: false });
      return;
    }

    try {
      setDescriptionCommandState({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
      });
    } catch {
      setDescriptionCommandState({ bold: false, italic: false, underline: false });
    }
  };

  useEffect(() => {
    if (!showForm || typeof document === 'undefined') return;

    const handleSelectionChange = () => {
      const editor = descriptionEditorRef.current;
      const selection = window.getSelection();
      if (!editor || !selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      if (editor.contains(range.commonAncestorContainer)) {
        savedDescriptionRangeRef.current = range.cloneRange();
        refreshDescriptionCommandState();
      } else {
        setDescriptionCommandState({ bold: false, italic: false, underline: false });
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [showForm]);

  const pushDescriptionHistory = (sanitizedHtml: string) => {
    if (applyingDescriptionHistoryRef.current) return;
    const history = descriptionHistoryRef.current;
    const currentIndex = descriptionHistoryIndexRef.current;
    const currentValue = history[currentIndex];
    if (currentValue === sanitizedHtml) return;

    const nextHistory = history.slice(0, currentIndex + 1);
    nextHistory.push(sanitizedHtml);
    if (nextHistory.length > 200) nextHistory.shift();
    descriptionHistoryRef.current = nextHistory;
    descriptionHistoryIndexRef.current = nextHistory.length - 1;
  };

  const syncDescriptionToForm = (recordHistory = true) => {
    const editor = descriptionEditorRef.current;
    if (!editor) return;
    const sanitized = sanitizeDescriptionHtml(editor.innerHTML);
    setForm((prev) => (prev.description === sanitized ? prev : { ...prev, description: sanitized }));
    if (recordHistory) pushDescriptionHistory(sanitized);
    refreshDescriptionCommandState();
  };

  const saveDescriptionSelection = () => {
    if (typeof window === 'undefined') return;
    const editor = descriptionEditorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    savedDescriptionRangeRef.current = range.cloneRange();
  };

  const restoreDescriptionSelection = () => {
    if (typeof window === 'undefined') return null;
    const editor = descriptionEditorRef.current;
    const savedRange = savedDescriptionRangeRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || !savedRange) return null;

    selection.removeAllRanges();
    selection.addRange(savedRange);
    return savedRange;
  };

  const insertDescriptionHtml = (html: string) => {
    const editor = descriptionEditorRef.current;
    if (!editor || typeof window === 'undefined') return;

    editor.focus();
    const restored = restoreDescriptionSelection();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;

    const sanitized = sanitizeDescriptionHtml(html);
    const container = document.createElement('div');
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
      savedDescriptionRangeRef.current = nextRange.cloneRange();
    } else if (restored) {
      savedDescriptionRangeRef.current = restored.cloneRange();
    }

    syncDescriptionToForm();
  };

  const applyInlineDescriptionFormat = (tagName: 'strong' | 'em' | 'u') => {
    const editor = descriptionEditorRef.current;
    if (!editor || typeof window === 'undefined') return;

    editor.focus();
    restoreDescriptionSelection();
    const selection = window.getSelection();
    const range = getSelectedDescriptionRange(editor);
    if (!selection || !range) return;

    const wrapper = document.createElement(tagName);
    if (range.collapsed) {
      wrapper.appendChild(document.createTextNode('\u200B'));
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
    savedDescriptionRangeRef.current = nextRange.cloneRange();
    syncDescriptionToForm();
  };

  const applyInlineDescriptionStyle = (styles: { color?: string; backgroundColor?: string }) => {
    const editor = descriptionEditorRef.current;
    if (!editor || typeof window === 'undefined') return;

    editor.focus();
    restoreDescriptionSelection();
    const selection = window.getSelection();
    const range = getSelectedDescriptionRange(editor);
    if (!selection || !range) return;

    const wrapper = document.createElement('span');
    if (styles.color) wrapper.style.color = styles.color;
    if (styles.backgroundColor) wrapper.style.backgroundColor = styles.backgroundColor;

    if (range.collapsed) {
      wrapper.innerHTML = '&#8203;';
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
    savedDescriptionRangeRef.current = nextRange.cloneRange();
    syncDescriptionToForm();
  };

  const createListFromSelection = (listTag: 'ul' | 'ol') => {
    const editor = descriptionEditorRef.current;
    if (!editor || typeof window === 'undefined') return;

    editor.focus();
    restoreDescriptionSelection();
    const selection = window.getSelection();
    const range = getSelectedDescriptionRange(editor);
    if (!selection || !range) return;
    if (!editor.contains(range.commonAncestorContainer)) return;

    const list = document.createElement(listTag);
    const li = document.createElement('li');

    if (range.collapsed) {
      li.innerHTML = '<br>';
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
    savedDescriptionRangeRef.current = nextRange.cloneRange();
    syncDescriptionToForm();
  };

  const applyDescriptionCommand = (command: 'bold' | 'italic' | 'underline') => {
    const editor = descriptionEditorRef.current;
    if (!editor || typeof document === 'undefined') return;

    editor.focus();
    restoreDescriptionSelection();
    // Use semantic tags (<b>/<i>/<u>) so sanitizer reliably preserves formatting.
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand(command, false);
    saveDescriptionSelection();
    syncDescriptionToForm();
  };

  const handleDescriptionPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();

    const html = event.clipboardData.getData('text/html');
    if (html) {
      insertDescriptionHtml(html);
      return;
    }

    const text = event.clipboardData.getData('text/plain');
    insertDescriptionHtml(plainTextToHtml(text));
  };

  const applyDescriptionTextSize = (size: number) => {
    const editor = descriptionEditorRef.current;
    if (!editor || typeof window === 'undefined') return;
    setDescriptionTextSize(size);
    editor.focus();
    restoreDescriptionSelection();

    const selection = window.getSelection();
    const range = getSelectedDescriptionRange(editor);
    if (!selection || !range) return;

    if (range.collapsed) {
      const span = document.createElement('span');
      span.style.fontSize = `${size}px`;
      span.innerHTML = '&#8203;';
      range.insertNode(span);
      const nextRange = document.createRange();
      nextRange.selectNodeContents(span);
      nextRange.collapse(false);
      selection.removeAllRanges();
      selection.addRange(nextRange);
      savedDescriptionRangeRef.current = nextRange.cloneRange();
      syncDescriptionToForm();
      return;
    }

    const extracted = range.extractContents();
    const span = document.createElement('span');
    span.style.fontSize = `${size}px`;
    span.appendChild(extracted);
    range.insertNode(span);
    const nextRange = document.createRange();
    nextRange.selectNodeContents(span);
    nextRange.collapse(false);
    selection.removeAllRanges();
    selection.addRange(nextRange);
    savedDescriptionRangeRef.current = nextRange.cloneRange();
    syncDescriptionToForm();
  };

  const applyDescriptionTextColor = (color: string) => {
    setDescriptionTextColor(color);
    applyInlineDescriptionStyle({ color });
  };

  const applyDescriptionHighlightColor = (color: string) => {
    setDescriptionHighlightColor(color);
    applyInlineDescriptionStyle({ backgroundColor: color });
  };

  const clearDescriptionFormatting = () => {
    const editor = descriptionEditorRef.current;
    if (!editor || typeof window === 'undefined') return;

    editor.focus();
    restoreDescriptionSelection();
    const selection = window.getSelection();
    const range = getSelectedDescriptionRange(editor);
    if (!selection || !range || range.collapsed) return;

    const fragment = range.cloneContents();
    const container = document.createElement('div');
    container.appendChild(fragment);
    const plain = container.textContent ?? '';

    range.deleteContents();
    const textNode = document.createTextNode(plain);
    range.insertNode(textNode);

    const nextRange = document.createRange();
    nextRange.setStartAfter(textNode);
    nextRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(nextRange);
    savedDescriptionRangeRef.current = nextRange.cloneRange();
    syncDescriptionToForm();
  };

  const applyDescriptionHistory = (action: 'undo' | 'redo') => {
    const editor = descriptionEditorRef.current;
    if (!editor) return;

    const history = descriptionHistoryRef.current;
    if (history.length === 0) return;

    if (action === 'undo') {
      if (descriptionHistoryIndexRef.current <= 0) return;
      descriptionHistoryIndexRef.current -= 1;
    } else {
      if (descriptionHistoryIndexRef.current >= history.length - 1) return;
      descriptionHistoryIndexRef.current += 1;
    }

    const snapshot = history[descriptionHistoryIndexRef.current];
    applyingDescriptionHistoryRef.current = true;
    syncingDescriptionRef.current = true;
    editor.innerHTML = snapshot;
    syncingDescriptionRef.current = false;
    applyingDescriptionHistoryRef.current = false;
    saveDescriptionSelection();
    syncDescriptionToForm(false);
  };

  const handleDescriptionKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const isCtrlOrCmd = event.ctrlKey || event.metaKey;
    if (!isCtrlOrCmd) return;

    // Keep shortcut handling scoped to the editor so admin-level global
    // shortcuts do not fire while typing/formatting description content.
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation?.();

    const key = event.key.toLowerCase();
    if (key === 'b') {
      event.preventDefault();
      applyDescriptionCommand('bold');
      return;
    }

    if (key === 'i') {
      event.preventDefault();
      applyDescriptionCommand('italic');
      return;
    }

    if (key === 'u') {
      event.preventDefault();
      applyDescriptionCommand('underline');
      return;
    }

    if (key === 'z' && !event.shiftKey) {
      event.preventDefault();
      applyDescriptionHistory('undo');
      return;
    }

    if (key === 'y' || (key === 'z' && event.shiftKey)) {
      event.preventDefault();
      applyDescriptionHistory('redo');
    }
  };

  // ── File picking ───────────────────────────────────────────────────────────
  const addPendingFiles = (files: FileList, type: 'image' | 'video') => {
    const newItems: PendingFile[] = Array.from(files).map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      file,
      preview: URL.createObjectURL(file),
      type,
      progress: 'idle' as const,
    }));
    setPendingFiles((prev) => [...prev, ...newItems]);
  };

  const removePending = (id: string) => {
    setPendingFiles((prev) => {
      const item = prev.find((p) => p.id === id);
      if (item) URL.revokeObjectURL(item.preview);
      return prev.filter((p) => p.id !== id);
    });
  };

  const removeExistingMedia = (mediaIndex: number) => {
    setForm((f) => {
      const removed = f.media[mediaIndex];
      const media = f.media.filter((_, i) => i !== mediaIndex);
      const coverImage = removed?.url === f.coverImage ? (media.find((m) => m.type === 'image')?.url ?? '') : f.coverImage;
      return { ...f, media, coverImage };
    });
  };

  const updateMediaCaption = (publicId: string, caption: string) => {
    setForm((f) => ({
      ...f,
      media: f.media.map((m) => m.publicId === publicId ? { ...m, caption } : m),
    }));
  };

  const updatePendingCaption = (id: string, caption: string) => {
    setPendingFiles((prev) => prev.map((p) => p.id === id ? { ...p, caption } : p));
  };

  const setCoverImage = (url: string) => {
    setForm((f) => ({ ...f, coverImage: url }));
  };

  const handleVideoThumbnailPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !thumbnailTarget) return;
    try {
      const r = await uploadImageToR2(file, { folder: 'tourist-places/thumbnails' });
      setForm((f) => ({
        ...f,
        media: f.media.map((m) =>
          m.publicId === thumbnailTarget ? { ...m, thumbnail: r.url } : m
        ),
      }));
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : 'Thumbnail upload failed', 'error');
    } finally {
      setThumbnailTarget(null);
      if (thumbnailInputRef.current) thumbnailInputRef.current.value = '';
    }
  };

  const handlePendingVideoThumbnailPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !pendingThumbTarget) return;
    const preview = URL.createObjectURL(file);
    setPendingFiles((prev) =>
      prev.map((p) => {
        if (p.id !== pendingThumbTarget) return p;
        if (p.thumbnailPreview) URL.revokeObjectURL(p.thumbnailPreview);
        return { ...p, thumbnailFile: file, thumbnailPreview: preview };
      })
    );
    setPendingThumbTarget(null);
    if (pendingThumbInputRef.current) pendingThumbInputRef.current.value = '';
  };

  const addExtraInfo = () => {
    setForm((f) => ({
      ...f,
      extraInfo: [...f.extraInfo, { id: `${Date.now()}-${Math.random()}`, heading: '', description: '' }],
    }));
  };

  const removeExtraInfo = (id: string) => {
    setForm((f) => ({ ...f, extraInfo: f.extraInfo.filter((s) => s.id !== id) }));
  };

  const updateExtraInfo = (id: string, field: 'heading' | 'description', value: string) => {
    setForm((f) => ({
      ...f,
      extraInfo: f.extraInfo.map((s) => (s.id === id ? { ...s, [field]: value } : s)),
    }));
  };

  // ── Upload all pending ──────────────────────────────────────────────────────
  const uploadAllPending = async (): Promise<MediaItem[]> => {
    const doneResults = pendingFiles
      .filter((p) => p.progress === 'done' && p.result)
      .map((p) => p.result as MediaItem);

    const todo = pendingFiles.filter((p) => p.progress === 'idle' || p.progress === 'error');
    if (todo.length === 0) return doneResults;
    setUploadingCount(todo.length);

    const results: MediaItem[] = [];
    const failedFiles: string[] = [];
    for (const item of todo) {
      setPendingFiles((prev) =>
        prev.map((p) => p.id === item.id ? { ...p, progress: 'uploading' as const, errorMsg: undefined } : p)
      );
      try {
        let uploaded: MediaItem;
        if (item.type === 'image') {
          const r = await uploadImageToR2(item.file, { folder: 'tourist-places/images' });
          uploaded = { url: r.url, publicId: r.key, type: 'image' };
        } else {
          uploaded = await uploadVideoToR2(item.file);
          // Upload custom pending thumbnail if provided
          if (item.thumbnailFile) {
            try {
              const tr = await uploadImageToR2(item.thumbnailFile, { folder: 'tourist-places/thumbnails' });
              uploaded = { ...uploaded, thumbnail: tr.url };
            } catch { /* ignore thumbnail failure, keep auto-thumb */ }
          }
        }
        if (item.caption?.trim()) uploaded = { ...uploaded, caption: item.caption.trim() };
        setPendingFiles((prev) =>
          prev.map((p) => p.id === item.id ? { ...p, progress: 'done' as const, result: uploaded } : p)
        );
        results.push(uploaded);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        failedFiles.push(item.file.name);
        setPendingFiles((prev) =>
          prev.map((p) => p.id === item.id ? { ...p, progress: 'error' as const, errorMsg: msg } : p)
        );
      } finally {
        setUploadingCount((c) => c - 1);
      }
    }

    if (failedFiles.length > 0) {
      throw new Error(`Failed to upload ${failedFiles.length} media file${failedFiles.length > 1 ? 's' : ''}. Please retry or remove the failed files.`);
    }

    return [...doneResults, ...results];
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.state.trim()) {
      flash('Name and State are required.', 'error');
      return;
    }
    setSaving(true);
    try {
      const newMedia = await uploadAllPending();
      const allMedia = [...form.media, ...newMedia];
      const coverImage = form.coverImage || (allMedia.find((m) => m.type === 'image')?.url ?? '');
      let createdId: string | null = null;
      const nowIso = new Date().toISOString();

      const writePayload = {
        name: form.name,
        area: form.area,
        city: (form.city || form.area || '').trim().toLowerCase(),
        state: form.state,
        country: form.country,
        description: form.description,
        category: form.category,
        isActive: form.isActive !== false,
        googleMapsUrl: form.googleMapsUrl,
        coverImage,
        media: allMedia,
        extraInfo: form.extraInfo.map(({ heading, description }) => ({ heading, description })),
        ...buildSearchIndexFields({
          name: form.name,
          area: form.area,
          state: form.state,
          country: form.country,
        }),
      };

      const cachePayload = {
        name: form.name,
        area: form.area,
        city: (form.city || form.area || '').trim().toLowerCase(),
        state: form.state,
        country: form.country,
        description: form.description,
        category: form.category,
        isActive: form.isActive !== false,
        googleMapsUrl: form.googleMapsUrl,
        coverImage,
        media: allMedia,
        extraInfo: form.extraInfo.map(({ id, heading, description }) => ({ id, heading, description })),
        ...buildSearchIndexFields({
          name: form.name,
          area: form.area,
          state: form.state,
          country: form.country,
        }),
        updatedAt: nowIso,
      };

      if (editingId) {
        await adminAPI.updateTouristPlace(editingId, writePayload);
        if (editingCategory && editingCategory !== form.category) {
          await updateSummary({
            categoryDelta: {
              [editingCategory]: -1,
              [form.category]: 1,
            },
          });
        }
        flash('Place updated!', 'success');
        resetForm();
      } else {
        const createdResponse = await adminAPI.createTouristPlace(writePayload);
        const createdData = createdResponse.data?.data ?? createdResponse.data ?? {};
        createdId = typeof createdData.id === 'string' ? createdData.id : null;
        await updateSummary({
          total: 1,
          categoryDelta: {
            [form.category]: 1,
          },
        });
        flash('Place added!', 'success');

        // Keep editor open after create and switch to edit mode for the new place.
        setEditingId(createdId);
        setShowForm(true);
        setPendingFiles((prev) => {
          prev.forEach((p) => {
            URL.revokeObjectURL(p.preview);
            if (p.thumbnailPreview) URL.revokeObjectURL(p.thumbnailPreview);
          });
          return [];
        });
        setForm((prev) => ({
          ...prev,
          media: allMedia,
          coverImage,
        }));
      }

      setPlaces((prev) => {
        const nextPlaces = editingId
          ? prev.map((place) => (place.id === editingId ? { ...place, ...cachePayload } : place))
          : [{ id: createdId ?? '', ...cachePayload, createdAt: nowIso }, ...prev];
        return sortTouristPlaces(nextPlaces);
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save.';
      flash(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    const confirmed = await modernConfirm('Delete this tourist place?', {
      title: 'Delete Tourist Place',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      const toDelete = places.find((place) => place.id === id) || null;
      await adminAPI.deleteTouristPlace(id);
      if (toDelete?.category) {
        await updateSummary({
          total: -1,
          categoryDelta: {
            [toDelete.category]: -1,
          },
        });
      }
      flash('Place deleted.', 'success');
      setPlaces((prev) => sortTouristPlaces(prev.filter((place) => place.id !== id)));
    } catch {
      flash('Failed to delete.', 'error');
    }
  };

  const openGallery = (media: MediaItem[], startIndex: number) => {
    setGalleryMedia(media);
    setGalleryStart(startIndex);
    setGalleryOpen(true);
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setImportFile(file);
    setImportError('');
    setImportSummary(null);
    if (csvInputRef.current) csvInputRef.current.value = '';
  };

  const parseImportRows = async (file: File): Promise<Array<{ rowNumber: number; data: Record<string, string> }>> => {
    const fileName = file.name.toLowerCase();
    let rows: string[][] = [];

    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      const xlsx = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = xlsx.read(buf, { type: 'array' });
      const firstSheet = wb.SheetNames[0];
      if (!firstSheet) return [];
      const raw = xlsx.utils.sheet_to_json<(string | number | boolean | null)[]>(wb.Sheets[firstSheet], {
        header: 1,
        raw: false,
        defval: '',
        blankrows: false,
      });
      rows = raw.map((r) => r.map((c) => String(c ?? '').trim())).filter((r) => r.some((c) => c.length > 0));
    } else {
      const text = await file.text();
      const delimiter = detectDelimiter(text);
      rows = parseCsvTable(text, delimiter);
    }

    if (rows.length === 0) {
      throw new Error('File is empty.');
    }

    const headers = rows[0].map(normalizeHeaderToField);
    const dataRows = rows.slice(1);
    if (dataRows.length === 0) {
      throw new Error('File must include at least one data row.');
    }

    return dataRows.map((cells, idx) => {
      const data: Record<string, string> = {};
      headers.forEach((h, i) => {
        data[h] = (cells[i] || '').trim();
      });
      return { rowNumber: idx + 2, data };
    });
  };

  const handleImportTouristPlaces = async () => {
    if (!importFile) {
      setImportError('Please choose a CSV/XLSX file first.');
      return;
    }

    setImportingCsv(true);
    setImportProgress(0);
    setImportError('');
    setImportSummary(null);

    try {
      const rows = await parseImportRows(importFile);
      const errors: string[] = [];
      let importedRows = 0;
      const categoryDelta: Record<string, number> = {};

      for (let i = 0; i < rows.length; i += 1) {
        const { rowNumber, data } = rows[i];

        const name = normalizeImportedText(data.name || '');
        const city = normalizeImportedText(data.city || '');
        const area = normalizeImportedText(data.area || '');
        const state = normalizeImportedText(data.state || '');
        const country = normalizeImportedText(data.country || '');
        const description = normalizeImportedText(data.description || '');
        const category = normalizeImportedText(data.category || 'Other');
        const googleMapsUrl = (data.googleMapsUrl || '').trim();
        const extraInfo = parseExtraInfo(data.extraInfo || '');

        if (!name || !country) {
          errors.push(`Row ${rowNumber}: Name and Country are required.`);
          setImportProgress(Math.round(((i + 1) / rows.length) * 100));
          continue;
        }

        const safeCategory = CATEGORIES.includes(category) ? category : 'Other';
        categoryDelta[safeCategory] = (categoryDelta[safeCategory] || 0) + 1;

        try {
          await adminAPI.createTouristPlace({
            name,
            area,
            city,
            state,
            country,
            description,
            category: safeCategory,
            isActive: true,
            googleMapsUrl,
            coverImage: '',
            media: [],
            extraInfo,
            ...buildSearchIndexFields({
              name,
              area,
              city,
              state,
              country,
            }),
          });

          importedRows += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to create row';
          errors.push(`Row ${rowNumber}: ${message}`);
        }

        setImportProgress(Math.round(((i + 1) / rows.length) * 100));
      }

      if (importedRows > 0) {
        await updateSummary({
          total: importedRows,
          categoryDelta,
        });
      }

      const summary: TouristImportSummary = {
        totalRows: rows.length,
        importedRows,
        failedRows: rows.length - importedRows,
        errors,
      };

      setImportSummary(summary);
      if (summary.failedRows > 0) {
        setImportError('Import completed with some failed rows. Check details below.');
      } else {
        flash(`Imported ${summary.importedRows} tourist places successfully.`, 'success');
      }

      setImportFile(null);
      await fetchPlaces({ reset: true });
      setPlaces((prev) => sortTouristPlaces(prev));
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setImportingCsv(false);
    }
  };

  const handleCopyTemplate = async () => {
    try {
      await navigator.clipboard.writeText(TOURIST_CSV_TEMPLATE_TEXT);
      setCopiedTemplate(true);
      setTimeout(() => setCopiedTemplate(false), 1600);
    } catch {
      setImportError('Could not copy template.');
    }
  };

  const fetchMigrationProgress = useCallback(async (jobId: string) => {
    const response = await adminAPI.getTourPlaceSearchMigrationStatus(jobId);
    const progress = response?.data?.data?.progress as MigrationProgress | undefined;
    if (!progress) {
      throw new Error('Migration progress unavailable');
    }
    setMigrationProgress(progress);
    return progress;
  }, []);

  const handleRunMigration = async () => {
    setMigrationStarting(true);
    try {
      const response = await adminAPI.startTourPlaceSearchMigration();
      const payload = response?.data?.data as {
        jobId?: string;
        progress?: MigrationProgress;
        alreadyRunning?: boolean;
      } | undefined;

      const jobId = payload?.jobId;
      if (!jobId) {
        throw new Error('Migration job ID is missing');
      }

      setMigrationJobId(jobId);
      setMigrationProgress(payload?.progress || null);
      flash(payload?.alreadyRunning ? 'Migration is already running.' : 'Migration started in background.', 'success');
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : 'Failed to start migration.', 'error');
    } finally {
      setMigrationStarting(false);
    }
  };

  useEffect(() => {
    if (!migrationJobId) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const poll = async () => {
      try {
        const progress = await fetchMigrationProgress(migrationJobId);
        if (cancelled) return;
        if (progress.status === 'completed') {
          flash('Migration completed successfully.', 'success');
          await fetchPlaces({ reset: true });
          if (intervalId) clearInterval(intervalId);
        }
        if (progress.status === 'failed') {
          flash(progress.error || 'Migration failed.', 'error');
          if (intervalId) clearInterval(intervalId);
        }
      } catch {
        if (intervalId) clearInterval(intervalId);
      }
    };

    void poll();
    intervalId = setInterval(() => {
      void poll();
    }, 2000);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [fetchMigrationProgress, fetchPlaces, migrationJobId]);

  const formImages = form.media.filter((m) => m.type === 'image');
  const formVideos = form.media.filter((m) => m.type === 'video');
  const pendingImages = pendingFiles.filter((p) => p.type === 'image');
  const pendingVideos = pendingFiles.filter((p) => p.type === 'video');

  const handleApplyFilters = () => {
    const nextFilters: TouristPlacesFilters = {
      search: searchInput.trim(),
      location: cityInput.trim(),
      status: statusInput,
    };
    lastAppliedFilterKeyRef.current = buildFilterCacheKey(nextFilters);
    setAppliedFilters(nextFilters);
    lastDocRef.current = null;
    void fetchPlaces({ reset: true, filters: nextFilters });
  };

  const handleResetFilters = () => {
    setSearchInput('');
    setCityInput('');
    setStatusInput('all');
    const resetFilters: TouristPlacesFilters = {
      search: '',
      location: '',
      status: 'all',
    };
    lastAppliedFilterKeyRef.current = buildFilterCacheKey(resetFilters);
    setAppliedFilters(resetFilters);
    lastDocRef.current = null;
    void fetchPlaces({ reset: true, filters: resetFilters });
  };

  const handleFilterInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    handleApplyFilters();
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-7xl space-y-8">
      {/* ── Hero Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-3xl bg-linear-to-br from-rose-600 via-pink-600 to-rose-800 p-8 shadow-xl"
      >
        {/* Decorative blobs */}
        <div className="pointer-events-none absolute -top-16 -right-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-10 -left-10 h-48 w-48 rounded-full bg-pink-300/20 blur-2xl" />

        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 rounded-2xl bg-white/20 backdrop-blur-sm">
                <Globe className="h-6 w-6 text-white" />
              </div>
              <span className="text-white/70 text-sm font-medium tracking-wide uppercase">Admin Panel</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">Tourist Places</h1>
            <p className="text-white/70 text-sm mt-1.5">
              Manage destinations · photos · videos · map links
            </p>
            <div className="flex items-center gap-2 mt-4">
              <span className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-sm text-white text-xs font-semibold px-3 py-1.5 rounded-full">
                <MapPin className="h-3.5 w-3.5" /> {summary.totalCount || places.length} place{(summary.totalCount || places.length) !== 1 ? 's' : ''}
              </span>
              {summary.updatedAtLabel && (
                <span className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur-sm text-white/85 text-xs font-medium px-3 py-1.5 rounded-full">
                  Updated {summary.updatedAtLabel}
                </span>
              )}
            </div>
          </div>
          <div className="shrink-0 flex flex-wrap gap-2 justify-start sm:justify-end">
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={handleImportFileChange}
              disabled={importingCsv}
              className="hidden"
            />
            <Button
              onClick={() => csvInputRef.current?.click()}
              variant="outline"
              className="bg-white/15 text-white border-white/30 hover:bg-white/25"
              disabled={importingCsv}
            >
              {importFile ? 'Change Import File' : 'Choose CSV/XLSX'}
            </Button>
            <Button
              onClick={handleCopyTemplate}
              variant="outline"
              className="bg-white/15 text-white border-white/30 hover:bg-white/25"
              disabled={importingCsv}
            >
              {copiedTemplate ? 'Template Copied' : 'Copy Template'}
            </Button>
            <Button
              onClick={handleImportTouristPlaces}
              variant="outline"
              className="bg-white/15 text-white border-white/30 hover:bg-white/25"
              disabled={!importFile || importingCsv}
            >
              {importingCsv ? `Importing ${importProgress}%` : 'Import Tourist Places'}
            </Button>
            <Button
              onClick={handleRunMigration}
              variant="outline"
              className="bg-white/15 text-white border-white/30 hover:bg-white/25"
              disabled={migrationStarting || migrationProgress?.status === 'running' || migrationProgress?.status === 'queued'}
            >
              {migrationStarting ? 'Starting Migration...' : 'Run Migration'}
            </Button>
            <Button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="bg-white text-rose-700 hover:bg-white/90 font-bold gap-2 rounded-2xl px-6 py-5 shadow-lg hover:shadow-xl transition-all"
            >
              <Plus className="h-5 w-5" />
              Add Place
            </Button>
          </div>
        </div>
      </motion.div>

      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleFilterInputKeyDown}
            placeholder="Search by name prefix..."
            className="h-10"
          />
          <Input
            value={cityInput}
            onChange={(e) => setCityInput(e.target.value)}
            onKeyDown={handleFilterInputKeyDown}
            placeholder="Location filter (city/area/state/country)"
            className="h-10"
          />
          <select
            value={statusInput}
            onChange={(e) => setStatusInput(e.target.value as TouristPlacesFilters['status'])}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">All</option>
            <option value="photos-added">Photos Added</option>
            <option value="photos-not-added">Photos Not Added</option>
            <option value="recently-updated">Recently Updated</option>
          </select>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={handleApplyFilters}>
              Apply Filters
            </Button>
            <Button type="button" variant="outline" className="flex-1" onClick={handleResetFilters}>
              Reset
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Loaded {places.length} places in current view. Reads are scoped to query filters and page size.
            {scanningFilters && (loading || loadingMore) && ' Scanning additional pages for filtered matches...'}
          </p>
          <Button type="button" variant="outline" onClick={handleUpdateCache} disabled={loading}>
            {loading ? 'Updating Cache...' : 'Update Cache'}
          </Button>
        </div>
      </div>

      {(importFile || importError || importSummary) && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
          {importFile && (
            <p className="text-sm text-muted-foreground">
              Selected file: <span className="font-semibold text-foreground">{importFile.name}</span>
            </p>
          )}
          {importError && <p className="text-sm text-destructive">{importError}</p>}
          {importSummary && (
            <div className="text-sm space-y-1">
              <p className="font-semibold text-foreground">Imported {importSummary.importedRows}/{importSummary.totalRows} rows.</p>
              {importSummary.failedRows > 0 && <p className="text-destructive">Failed rows: {importSummary.failedRows}</p>}
              {importSummary.errors.length > 0 && (
                <div className="max-h-28 overflow-y-auto pr-1">
                  {importSummary.errors.map((text, idx) => (
                    <p key={`${text}-${idx}`} className="text-xs text-muted-foreground">{text}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {migrationProgress && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">
              Migration Job: <span className="font-mono text-xs text-muted-foreground">{migrationProgress.jobId}</span>
            </p>
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-wide text-foreground">
              {migrationProgress.status}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <p className="rounded-lg bg-muted/50 px-2 py-1.5">Total: <span className="font-semibold">{migrationProgress.total}</span></p>
            <p className="rounded-lg bg-muted/50 px-2 py-1.5">Processed: <span className="font-semibold">{migrationProgress.processed}</span></p>
            <p className="rounded-lg bg-muted/50 px-2 py-1.5">Updated: <span className="font-semibold">{migrationProgress.updated}</span></p>
            <p className="rounded-lg bg-muted/50 px-2 py-1.5">Skipped: <span className="font-semibold">{migrationProgress.skipped}</span></p>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-rose-500 transition-all duration-300"
              style={{
                width: `${migrationProgress.total > 0 ? Math.min(100, Math.round((migrationProgress.processed / migrationProgress.total) * 100)) : 0}%`,
              }}
            />
          </div>
          {migrationProgress.error && (
            <p className="text-xs text-destructive">{migrationProgress.error}</p>
          )}
        </div>
      )}

      {/* Feedback banners */}
      <AnimatePresence>
        {error && (
          <motion.div key="err" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 text-sm font-medium">
            <X className="h-4 w-4 shrink-0" /> {error}
          </motion.div>
        )}
        {success && (
          <motion.div key="ok" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-2 rounded-xl bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 px-4 py-3 text-sm font-medium">
            <Check className="h-4 w-4 shrink-0" /> {success}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Form ──────────────────────────────────────────────────────────── */}
      <AnimatePresence>
      {showForm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="fixed inset-0 z-80 overflow-y-auto bg-black/45 p-4 backdrop-blur-sm"
          onClick={resetForm}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            className="mx-auto w-full max-w-6xl rounded-3xl border border-border bg-card shadow-xl overflow-hidden"
          >
            {/* Form header band */}
            <div className="flex items-center justify-between px-6 py-4 bg-linear-to-r from-rose-600/10 via-pink-500/5 to-transparent border-b border-border">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-rose-600/10">
                  <MapPin className="h-5 w-5 text-rose-600" />
                </div>
                <h2 className="text-lg font-bold">
                  {editingId ? 'Edit Tourist Place' : 'New Tourist Place'}
                </h2>
              </div>
              <button onClick={resetForm} className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-8">

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Basic info grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <Label htmlFor="tp-name">Place Name <span className="text-destructive">*</span></Label>
                <Input id="tp-name" placeholder="e.g. Tirumala Venkateswara Temple"
                  value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tp-category">Category</Label>
                <select id="tp-category" value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tp-status">Status</Label>
                <select
                  id="tp-status"
                  value={form.isActive === false ? 'inactive' : 'active'}
                  onChange={(e) => setForm({ ...form, isActive: e.target.value === 'active' })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tp-state">State / Region <span className="text-destructive">*</span></Label>
                <Input id="tp-state" placeholder="e.g. Andhra Pradesh"
                  value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tp-country">Country</Label>
                <Input id="tp-country" placeholder="e.g. India"
                  value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="tp-area">City / Area</Label>
                <Input id="tp-area" placeholder="e.g. Tirumala Hills, Old Town"
                  value={form.area}
                  onChange={(e) => setForm({ ...form, area: e.target.value, city: e.target.value })}
                />
              </div>
              <RichTextEditor
                id="tp-desc"
                label="Description"
                value={form.description}
                onChange={(html) => setForm((prev) => ({ ...prev, description: html }))}
              />
              {/* ── Extra Info Sections ── */}
              <div className="space-y-3 md:col-span-2">
                <AnimatePresence>
                {form.extraInfo.map((section, idx) => (
                  <motion.div
                    key={section.id}
                    initial={{ opacity: 0, y: -10, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.97, height: 0, marginTop: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 26 }}
                    className="rounded-xl border border-rose-200/60 dark:border-rose-800/40 bg-linear-to-br from-rose-50/60 to-pink-50/40 dark:from-rose-950/30 dark:to-pink-950/20 p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-rose-500/10">
                          <FileText className="h-3.5 w-3.5 text-rose-500" />
                        </div>
                        <span className="text-sm font-semibold text-rose-700 dark:text-rose-300">Section {idx + 1}</span>
                      </div>
                      <motion.button
                        whileHover={{ scale: 1.1, rotate: 90 }}
                        whileTap={{ scale: 0.9 }}
                        type="button"
                        onClick={() => removeExtraInfo(section.id)}
                        className="p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </motion.button>
                    </div>
                    <Input
                      placeholder="Heading e.g. Best Time to Visit"
                      value={section.heading}
                      onChange={(e) => updateExtraInfo(section.id, 'heading', e.target.value)}
                    />
                    <textarea rows={2}
                      placeholder="Description for this section…"
                      value={section.description}
                      onChange={(e) => updateExtraInfo(section.id, 'description', e.target.value)}
                      className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400/50 resize-none transition-shadow" />
                  </motion.div>
                ))}
                </AnimatePresence>
                <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                  <Button type="button" variant="outline" onClick={addExtraInfo}
                    className="w-full gap-2 border-dashed border-rose-300 dark:border-rose-700 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:border-rose-400 transition-all font-semibold">
                    <Plus className="h-4 w-4" /> Add Another Information
                  </Button>
                </motion.div>
              </div>
              {/* Google Maps */}
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="tp-maps" className="flex items-center gap-1.5">
                    <MapIcon className="h-4 w-4 text-rose-500" /> Google Maps Link
                </Label>
                <Input id="tp-maps" type="url"
                  placeholder="https://maps.google.com/?q=Tirumala+Temple"
                  value={form.googleMapsUrl}
                  onChange={(e) => setForm({ ...form, googleMapsUrl: e.target.value })} />
                <p className="text-xs text-muted-foreground">Paste the full Google Maps share URL</p>
              </div>
            </div>

            {/* hidden file inputs */}
            <input type="file" accept="image/*" multiple ref={imageInputRef}
              onChange={(e) => e.target.files && addPendingFiles(e.target.files, 'image')}
              className="hidden" />
            <input type="file" accept="video/*" multiple ref={videoInputRef}
              onChange={(e) => e.target.files && addPendingFiles(e.target.files, 'video')}
              className="hidden" />
            <input type="file" accept="image/*" ref={thumbnailInputRef}
              onChange={handleVideoThumbnailPick} className="hidden" />
            <input type="file" accept="image/*" ref={pendingThumbInputRef}
              onChange={handlePendingVideoThumbnailPick} className="hidden" />

            {/* ── Photos Section ── */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-3 pb-3 border-b border-rose-100 dark:border-rose-900/30">
                <div className="p-2 rounded-xl bg-linear-to-br from-rose-500/15 to-pink-500/15 ring-1 ring-rose-500/20">
                  <ImageIcon className="h-4 w-4 text-rose-500" />
                </div>
                <h3 className="font-bold text-base bg-linear-to-r from-rose-600 to-pink-600 bg-clip-text text-transparent">Photos</h3>
                <span className="ml-auto text-xs font-semibold text-rose-600 bg-rose-500/10 px-2.5 py-1 rounded-full ring-1 ring-rose-500/20">
                  {formImages.length + pendingImages.length} added
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Saved images */}
                {formImages.map((img, cardIdx) => {
                  const mediaIdx = form.media.findIndex((m) => m.publicId === img.publicId);
                  const isCover = form.coverImage === img.url;
                  return (
                    <motion.div key={img.publicId}
                      initial={{ opacity: 0, y: 16, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ type: 'spring', stiffness: 280, damping: 24, delay: cardIdx * 0.04 }}
                      className={`group flex flex-col rounded-2xl overflow-hidden bg-card shadow-md transition-all border ${isCover ? 'border-rose-500 shadow-rose-500/20 shadow-lg' : 'border-border hover:border-rose-300 dark:hover:border-rose-700'}`}
                    >
                      {/* Post header */}
                      <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border">
                        <div className="w-7 h-7 rounded-full bg-linear-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-sm">
                          <ImageIcon className="h-3.5 w-3.5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold leading-tight truncate">{img.caption || 'Photo'}</p>
                          <p className="text-[10px] text-muted-foreground">{formatBytes((img as MediaItem & { size?: number }).size ?? 0) || 'Uploaded'}</p>
                        </div>
                        {isCover && (
                          <span className="text-[9px] font-bold bg-rose-600 text-white px-2 py-0.5 rounded-full shrink-0">Cover</span>
                        )}
                      </div>

                      {/* Image */}
                      <div className="relative aspect-4/3 overflow-hidden bg-muted">
                        <img src={img.url} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                        {/* hover overlay */}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/35 transition-all duration-300 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                          <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                            onClick={() => openGallery(form.media, mediaIdx)}
                            className="p-2 rounded-full bg-white/90 text-gray-700 hover:bg-white shadow-md">
                            <Eye className="h-4 w-4" />
                          </motion.button>
                          <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                            onClick={() => removeExistingMedia(mediaIdx)}
                            className="p-2 rounded-full bg-white/90 text-destructive hover:bg-white shadow-md">
                            <Trash2 className="h-4 w-4" />
                          </motion.button>
                        </div>
                      </div>

                      {/* Action bar */}
                      <div className="flex items-center gap-1 px-3 py-2 border-t border-border">
                        <motion.button type="button" whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.85 }}
                          onClick={() => setCoverImage(img.url)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all ${
                            isCover
                              ? 'bg-rose-600 text-white shadow-md shadow-rose-500/30'
                              : 'bg-muted text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600'
                          }`}>
                          <Star className={`h-3 w-3 ${isCover ? 'fill-white' : ''}`} />
                          {isCover ? 'Cover / Thumb' : 'Set as Thumb'}
                        </motion.button>
                      </div>

                      {/* Caption */}
                      <div className="px-3 pb-3">
                        <input
                          type="text"
                          value={img.caption ?? ''}
                          onChange={(e) => updateMediaCaption(img.publicId, e.target.value)}
                          placeholder="Write a caption…"
                          className="w-full text-xs px-3 py-2 rounded-xl bg-muted border border-border text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-rose-400/50 transition-shadow"
                        />
                      </div>
                    </motion.div>
                  );
                })}

                {/* Pending images */}
                <AnimatePresence>
                {pendingImages.map((p) => (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, y: 16, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 24 }}
                    className="flex flex-col rounded-2xl overflow-hidden bg-card border border-dashed border-rose-300 dark:border-rose-800 shadow-sm"
                  >
                    {/* Post header */}
                    <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border">
                      <div className="w-7 h-7 rounded-full bg-linear-to-br from-rose-400 to-pink-500 flex items-center justify-center opacity-60">
                        <ImageIcon className="h-3.5 w-3.5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold leading-tight truncate">{p.caption || p.file.name}</p>
                        <p className="text-[10px] text-muted-foreground">{formatBytes(p.file.size)}</p>
                      </div>
                      {p.progress === 'idle' && (
                        <motion.button type="button" whileHover={{ rotate: 90 }} onClick={() => removePending(p.id)}
                          className="p-1 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                          <X className="h-3.5 w-3.5" />
                        </motion.button>
                      )}
                    </div>

                    {/* Image preview */}
                    <div className="relative aspect-4/3 overflow-hidden bg-muted">
                      <img src={p.preview} alt="" className="w-full h-full object-cover" />
                      {p.progress === 'uploading' && (
                        <div className="absolute inset-0 bg-black/55 flex flex-col items-center justify-center gap-1.5">
                          <Loader2 className="h-6 w-6 text-white animate-spin" />
                          <span className="text-white text-[10px] font-medium">Uploading…</span>
                        </div>
                      )}
                      {p.progress === 'done' && (
                        <div className="absolute inset-0 bg-green-500/50 flex items-center justify-center">
                          <Check className="h-7 w-7 text-white" />
                        </div>
                      )}
                      {p.progress === 'error' && (
                        <div className="absolute inset-0 bg-destructive/60 flex items-center justify-center">
                          <X className="h-7 w-7 text-white" />
                        </div>
                      )}
                    </div>

                    {/* Caption */}
                    {p.progress === 'idle' && (
                      <div className="px-3 py-2.5">
                        <input
                          type="text"
                          value={p.caption ?? ''}
                          onChange={(e) => updatePendingCaption(p.id, e.target.value)}
                          placeholder="Write a caption…"
                          className="w-full text-xs px-3 py-2 rounded-xl bg-muted border border-border text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-rose-400/50 transition-shadow"
                        />
                      </div>
                    )}
                  </motion.div>
                ))}
                </AnimatePresence>

                {/* Add Photo post */}
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => imageInputRef.current?.click()}
                  className="flex flex-col rounded-2xl overflow-hidden border-2 border-dashed border-border hover:border-rose-400 bg-card hover:bg-rose-500/5 transition-all shadow-sm group"
                >
                  <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border">
                    <div className="w-7 h-7 rounded-full bg-muted group-hover:bg-rose-500/15 flex items-center justify-center transition-colors">
                      <ImageIcon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-rose-500 transition-colors" />
                    </div>
                    <span className="text-xs font-semibold text-muted-foreground group-hover:text-rose-500 transition-colors">New Photo Post</span>
                  </div>
                  <div className="aspect-4/3 flex flex-col items-center justify-center gap-2 text-muted-foreground group-hover:text-rose-500 transition-colors">
                    <motion.div
                      animate={{ rotate: [0, 90, 0] }}
                      transition={{ duration: 3, repeat: Infinity, repeatDelay: 2 }}
                    >
                      <Plus className="h-8 w-8" />
                    </motion.div>
                    <span className="text-xs font-semibold tracking-wide">Add Photo</span>
                  </div>
                </motion.button>
              </div>
            </motion.div>

            {/* ── Videos Section ── */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-3 pb-3 border-b border-rose-100 dark:border-rose-900/30">
                <div className="p-2 rounded-xl bg-linear-to-br from-rose-500/15 to-pink-500/15 ring-1 ring-rose-500/20">
                  <Video className="h-4 w-4 text-rose-500" />
                </div>
                <h3 className="font-bold text-base bg-linear-to-r from-rose-600 to-pink-600 bg-clip-text text-transparent">Videos</h3>
                <span className="ml-auto text-xs font-semibold text-rose-600 bg-rose-500/10 px-2.5 py-1 rounded-full ring-1 ring-rose-500/20">
                  {formVideos.length + pendingVideos.length} added
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Saved videos */}
                {formVideos.map((vid, cardIdx) => {
                  const mediaIdx = form.media.findIndex((m) => m.publicId === vid.publicId);
                  return (
                    <motion.div key={vid.publicId}
                      initial={{ opacity: 0, y: 16, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ type: 'spring', stiffness: 280, damping: 24, delay: cardIdx * 0.05 }}
                      className="group flex flex-col rounded-2xl overflow-hidden bg-zinc-950 border border-zinc-800 shadow-lg hover:border-zinc-700 transition-all"
                    >
                      {/* Post header */}
                      <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-zinc-800">
                        <div className="w-7 h-7 rounded-full bg-linear-to-br from-rose-600 to-pink-700 flex items-center justify-center shadow-sm">
                          <Video className="h-3.5 w-3.5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-white leading-tight truncate">{vid.caption || 'Video'}</p>
                          <p className="text-[10px] text-zinc-500">{vid.thumbnail ? 'Thumbnail set' : 'No thumbnail'}</p>
                        </div>
                      </div>

                      {/* Video preview */}
                      <div className="relative aspect-video overflow-hidden bg-zinc-900">
                        {vid.thumbnail ? (
                          <img src={vid.thumbnail} alt="" className="w-full h-full object-cover opacity-85 transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Video className="h-10 w-10 text-zinc-700" />
                          </div>
                        )}
                        {/* Play badge */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-12 h-12 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-xl">
                            <Play className="h-5 w-5 text-white ml-0.5" />
                          </div>
                        </div>
                        {/* Hover overlay */}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all duration-300 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                          <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                            onClick={() => openGallery(form.media, mediaIdx)}
                            className="p-2 rounded-full bg-white/90 text-gray-700 hover:bg-white shadow-md">
                            <Eye className="h-4 w-4" />
                          </motion.button>
                          <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                            onClick={() => removeExistingMedia(mediaIdx)}
                            className="p-2 rounded-full bg-white/90 text-destructive hover:bg-white shadow-md">
                            <Trash2 className="h-4 w-4" />
                          </motion.button>
                        </div>
                      </div>

                      {/* Action bar */}
                      <div className="flex items-center gap-2 px-3 py-2 border-t border-zinc-800">
                        <motion.button type="button" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                          onClick={() => { setThumbnailTarget(vid.publicId); thumbnailInputRef.current?.click(); }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all ${
                            vid.thumbnail
                              ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                              : 'bg-zinc-800 text-zinc-400 hover:bg-rose-600/20 hover:text-rose-400'
                          }`}>
                          <ImageIcon className="h-3 w-3" />
                          {vid.thumbnail ? 'Change Thumbnail' : 'Set Thumbnail'}
                        </motion.button>
                      </div>

                      {/* Caption */}
                      <div className="px-3 pb-3">
                        <input
                          type="text"
                          value={vid.caption ?? ''}
                          onChange={(e) => updateMediaCaption(vid.publicId, e.target.value)}
                          placeholder="Write a caption…"
                          className="w-full text-xs px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder:text-zinc-600 outline-none focus:ring-2 focus:ring-rose-500/40 transition-shadow"
                        />
                      </div>
                    </motion.div>
                  );
                })}

                {/* Pending videos */}
                <AnimatePresence>
                {pendingVideos.map((p) => (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, y: 16, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 24 }}
                    className="flex flex-col rounded-2xl overflow-hidden bg-zinc-950 border border-dashed border-rose-800/60 shadow-md"
                  >
                    {/* Post header */}
                    <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-zinc-800">
                      <div className="w-7 h-7 rounded-full bg-linear-to-br from-rose-500/60 to-pink-600/60 flex items-center justify-center">
                        <Video className="h-3.5 w-3.5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-white leading-tight truncate">{p.caption || p.file.name}</p>
                        <p className="text-[10px] text-zinc-500">{formatBytes(p.file.size)}</p>
                      </div>
                      {p.progress === 'idle' && (
                        <motion.button type="button" whileHover={{ rotate: 90 }} onClick={() => removePending(p.id)}
                          className="p-1 rounded-full text-zinc-500 hover:text-destructive hover:bg-destructive/10 transition-colors">
                          <X className="h-3.5 w-3.5" />
                        </motion.button>
                      )}
                    </div>

                    {/* Preview */}
                    <div className="relative aspect-video overflow-hidden bg-zinc-900">
                      {p.thumbnailPreview ? (
                        <img src={p.thumbnailPreview} alt="" className="w-full h-full object-cover opacity-90" />
                      ) : (
                        <video src={p.preview} className="w-full h-full object-cover opacity-50" />
                      )}
                      {/* state overlay */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 pointer-events-none">
                        {p.progress === 'uploading' ? (
                          <><Loader2 className="h-6 w-6 text-white animate-spin" /><span className="text-white text-[10px]">Uploading…</span></>
                        ) : p.progress === 'done' ? (
                          <Check className="h-7 w-7 text-green-400" />
                        ) : p.progress === 'error' ? (
                          <X className="h-7 w-7 text-destructive" />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center">
                            <Play className="h-5 w-5 text-white ml-0.5" />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Thumbnail + caption */}
                    {p.progress === 'idle' && (
                      <>
                        <div className="flex items-center gap-2 px-3 py-2 border-t border-zinc-800">
                          <motion.button type="button" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                            onClick={() => { setPendingThumbTarget(p.id); pendingThumbInputRef.current?.click(); }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all ${
                              p.thumbnailPreview
                                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                                : 'bg-zinc-800 text-zinc-400 hover:bg-rose-600/20 hover:text-rose-400'
                            }`}>
                            <ImageIcon className="h-3 w-3" />
                            {p.thumbnailPreview ? 'Change Thumbnail' : 'Set Thumbnail'}
                          </motion.button>
                        </div>
                        <div className="px-3 pb-3">
                          <input
                            type="text"
                            value={p.caption ?? ''}
                            onChange={(e) => updatePendingCaption(p.id, e.target.value)}
                            placeholder="Write a caption…"
                            className="w-full text-xs px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder:text-zinc-600 outline-none focus:ring-2 focus:ring-rose-500/40 transition-shadow"
                          />
                        </div>
                      </>
                    )}
                  </motion.div>
                ))}
                </AnimatePresence>

                {/* Add Video post */}
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => videoInputRef.current?.click()}
                  className="flex flex-col rounded-2xl overflow-hidden border-2 border-dashed border-zinc-800 hover:border-rose-700 bg-zinc-950/60 hover:bg-rose-500/5 transition-all shadow-sm group"
                >
                  <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-zinc-800 group-hover:border-rose-900/50 transition-colors">
                    <div className="w-7 h-7 rounded-full bg-zinc-900 group-hover:bg-rose-500/15 flex items-center justify-center transition-colors">
                      <Video className="h-3.5 w-3.5 text-zinc-600 group-hover:text-rose-500 transition-colors" />
                    </div>
                    <span className="text-xs font-semibold text-zinc-600 group-hover:text-rose-500 transition-colors">New Video Post</span>
                  </div>
                  <div className="aspect-video flex flex-col items-center justify-center gap-2 text-zinc-700 group-hover:text-rose-500 transition-colors">
                    <motion.div
                      animate={{ scale: [1, 1.15, 1] }}
                      transition={{ duration: 2, repeat: Infinity, repeatDelay: 1.5 }}
                    >
                      <Plus className="h-8 w-8" />
                    </motion.div>
                    <span className="text-xs font-semibold tracking-wide">Add Video</span>
                  </div>
                </motion.button>
              </div>
            </motion.div>

            {/* Actions */}
            <div className="flex gap-3 justify-end pt-2 border-t border-border">
              <Button type="button" variant="outline" onClick={resetForm} className="rounded-xl">Cancel</Button>
              <Button type="submit" disabled={saving || uploadingCount > 0}
                className="bg-linear-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white gap-2 min-w-36 rounded-xl shadow-lg shadow-rose-500/20">
                {(saving || uploadingCount > 0) && <Loader2 className="h-4 w-4 animate-spin" />}
                {uploadingCount > 0
                  ? `Uploading ${uploadingCount}…`
                  : saving ? 'Saving…'
                  : editingId ? 'Update Place' : 'Add Place'}
              </Button>
            </div>
            </form>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* ── Place Cards ──────────────────────────────────────────────────────── */}
      {loading ? (
        /* Skeleton */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {[...Array(8)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="rounded-2xl border border-border bg-card overflow-hidden"
            >
              <div className="relative h-44 overflow-hidden">
                <div className="absolute inset-0 bg-linear-to-br from-muted to-muted/70" />
                <motion.div
                  className="absolute inset-0 bg-linear-to-r from-transparent via-white/8 to-transparent"
                  animate={{ x: ['-100%', '200%'] }}
                  transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 0.4, ease: 'linear', delay: i * 0.1 }}
                />
              </div>
              <div className="p-4 space-y-3">
                <div className="relative h-4 rounded-full bg-muted w-3/4 overflow-hidden">
                  <motion.div className="absolute inset-0 bg-linear-to-r from-transparent via-white/8 to-transparent" animate={{ x: ['-100%', '200%'] }} transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 0.4, ease: 'linear', delay: i * 0.1 + 0.1 }} />
                </div>
                <div className="relative h-3 rounded-full bg-muted w-1/2 overflow-hidden">
                  <motion.div className="absolute inset-0 bg-linear-to-r from-transparent via-white/8 to-transparent" animate={{ x: ['-100%', '200%'] }} transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 0.4, ease: 'linear', delay: i * 0.1 + 0.2 }} />
                </div>
                <div className="relative h-3 rounded-full bg-muted w-full overflow-hidden">
                  <motion.div className="absolute inset-0 bg-linear-to-r from-transparent via-white/8 to-transparent" animate={{ x: ['-100%', '200%'] }} transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 0.4, ease: 'linear', delay: i * 0.1 + 0.3 }} />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : places.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center justify-center py-28 text-center gap-6"
        >
          <motion.div
            animate={{ y: [0, -12, 0] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
            className="relative"
          >
            <div className="w-28 h-28 rounded-3xl bg-linear-to-br from-rose-100 to-pink-200 dark:from-rose-900/40 dark:to-pink-900/40 flex items-center justify-center shadow-2xl shadow-rose-300/40 dark:shadow-rose-900/30 ring-1 ring-rose-200 dark:ring-rose-800">
              <MapPin className="h-12 w-12 text-rose-500" />
            </div>
            <motion.div
              animate={{ scale: [1, 1.15, 1], rotate: [0, 8, 0] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
              className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-linear-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-lg"
            >
              <Plus className="h-4 w-4 text-white" />
            </motion.div>
            {/* Glow ring */}
            <div className="absolute inset-0 rounded-3xl bg-rose-400/20 blur-xl -z-10 scale-110" />
          </motion.div>
          <div className="space-y-2">
            <p className="text-2xl font-extrabold text-foreground">No matching tourist places</p>
            <p className="text-sm text-muted-foreground">
              {hasMore
                ? 'No matches in loaded pages yet. Click "Load More" to scan more places.'
                : <>Try another search or click <span className="font-semibold text-rose-500">"Add Place"</span> to create one</>}
            </p>
          </div>
        </motion.div>
      ) : (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.07 } } }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
        >
          {places.map((place) => {
            const placeImages = (place.media ?? []).filter((m) => m.type === 'image');
            const placeVideos = (place.media ?? []).filter((m) => m.type === 'video');
            const allMedia = place.media ?? [];
            return (
              <motion.div key={place.id}
                variants={{ hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0 } }}
                whileHover={{ y: -6, scale: 1.02 }}
                transition={{ duration: 0.25 }}
                className="group relative rounded-2xl border border-border bg-card overflow-hidden shadow-sm hover:shadow-2xl hover:shadow-rose-500/15 hover:border-rose-200 dark:hover:border-rose-800/50 transition-all duration-300 flex flex-col">
                {/* Shimmer on hover */}
                <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                  <motion.div
                    className="absolute inset-0 bg-linear-to-r from-transparent via-white/8 to-transparent skew-x-12"
                    animate={{ x: ['-150%', '250%'] }}
                    transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 0.8, ease: 'linear' }}
                  />
                </div>
                {/* Cover */}
                <div className="relative h-48 bg-muted shrink-0 overflow-hidden">
                  {place.coverImage ? (
                    <img src={place.coverImage} alt={place.name}
                      loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full bg-linear-to-br from-rose-100 to-pink-100 dark:from-rose-900/20 dark:to-pink-900/20 flex items-center justify-center">
                      <ImageIcon className="h-10 w-10 text-rose-300" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent" />
                  {/* Category badge */}
                  <span className="absolute top-3 left-3 bg-linear-to-r from-rose-600 to-pink-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-lg">
                    {place.category}
                  </span>
                  {/* Actions - always show on mobile, hover on desktop */}
                  <div className="absolute top-3 right-3 flex gap-1.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                      onClick={() => place.id && void handleEdit(place.id)}
                      className="p-1.5 rounded-lg bg-white/90 hover:bg-white shadow-md text-gray-700 hover:text-rose-600 transition-colors">
                      <Pencil className="h-3.5 w-3.5" />
                    </motion.button>
                    <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                      onClick={() => handleDelete(place.id!)}
                      className="p-1.5 rounded-lg bg-white/90 hover:bg-white shadow-md text-gray-700 hover:text-destructive transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </motion.button>
                  </div>
                  {/* Media count badges */}
                  <div className="absolute bottom-3 right-3 flex gap-1">
                    {placeImages.length > 0 && (
                      <span className="flex items-center gap-1 bg-black/70 text-white text-[10px] font-medium px-2 py-0.5 rounded-full backdrop-blur-sm">
                        <ImageIcon className="h-2.5 w-2.5" /> {placeImages.length}
                      </span>
                    )}
                    {placeVideos.length > 0 && (
                      <span className="flex items-center gap-1 bg-black/70 text-white text-[10px] font-medium px-2 py-0.5 rounded-full backdrop-blur-sm">
                        <Video className="h-2.5 w-2.5" /> {placeVideos.length}
                      </span>
                    )}
                  </div>
                </div>

                {/* Info */}
                <div className="p-4 space-y-2 flex-1 flex flex-col">
                  <h3 className="font-bold text-sm leading-tight line-clamp-2 group-hover:text-rose-600 transition-colors">{place.name}</h3>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0 text-rose-400" />
                    <span className="truncate">{[place.area, place.state, place.country].filter(Boolean).join(', ')}</span>
                  </div>
                  {place.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{stripRichTextTags(place.description)}</p>
                  )}

                  {/* Photo thumbnails row */}
                  {placeImages.length > 1 && (
                    <div className="flex gap-1 pt-1 flex-wrap">
                      {placeImages.slice(0, 5).map((img) => {
                        const idx = allMedia.findIndex((m) => m.publicId === img.publicId);
                        return (
                          <button key={img.publicId} type="button"
                            onClick={() => openGallery(allMedia, idx)}
                            className="w-9 h-9 rounded-lg overflow-hidden border border-border hover:ring-2 hover:ring-rose-500 transition-all">
                            <img src={img.url} alt="" loading="lazy" className="w-full h-full object-cover" />
                          </button>
                        );
                      })}
                      {placeImages.length > 5 && (
                        <button type="button" onClick={() => openGallery(allMedia, 0)}
                          className="w-9 h-9 rounded-lg bg-muted border border-border text-[10px] font-medium text-muted-foreground hover:ring-2 hover:ring-rose-500 transition-all">
                          +{placeImages.length - 5}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Video thumbnails row */}
                  {placeVideos.length > 0 && (
                    <div className="flex gap-1 pt-1 flex-wrap">
                      {placeVideos.slice(0, 3).map((vid) => {
                        const idx = allMedia.findIndex((m) => m.publicId === vid.publicId);
                        return (
                          <button key={vid.publicId} type="button"
                            onClick={() => openGallery(allMedia, idx)}
                            className="relative w-14 h-9 rounded-lg overflow-hidden border border-border hover:ring-2 hover:ring-rose-500 transition-all bg-black">
                            {vid.thumbnail ? (
                              <img src={vid.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover opacity-80" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Video className="h-3.5 w-3.5 text-white/50" />
                              </div>
                            )}
                            <div className="absolute inset-0 flex items-center justify-center">
                              <Play className="h-3 w-3 text-white ml-0.5" />
                            </div>
                          </button>
                        );
                      })}
                      {placeVideos.length > 3 && (
                        <button type="button" onClick={() => openGallery(allMedia, 0)}
                          className="w-14 h-9 rounded-lg bg-muted border border-border text-[10px] font-medium text-muted-foreground hover:ring-2 hover:ring-rose-500 transition-all">
                          +{placeVideos.length - 3}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Map link */}
                  {place.googleMapsUrl && (
                    <a href={place.googleMapsUrl} target="_blank" rel="noopener noreferrer"
                      className="mt-auto inline-flex items-center gap-1.5 text-xs font-semibold text-rose-500 hover:text-rose-600 bg-rose-500/10 hover:bg-rose-500/20 px-3 py-1.5 rounded-full transition-colors">
                      <MapIcon className="h-3.5 w-3.5" /> View on Google Maps
                    </a>
                  )}
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {!loading && (places.length > 0 || hasMore || loadingMore) && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => void fetchPlaces({ reset: false })}
            disabled={!hasMore || loadingMore}
          >
            {loadingMore ? 'Loading More...' : hasMore ? 'Load More' : 'No More Results'}
          </Button>
        </div>
      )}

      {/* Gallery Modal */}
      <AnimatePresence>
        {galleryOpen && (
          <GalleryModal
            media={galleryMedia}
            startIndex={galleryStart}
            onClose={() => setGalleryOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
