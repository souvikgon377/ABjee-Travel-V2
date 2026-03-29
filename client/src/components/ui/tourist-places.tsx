import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp,
  orderBy,
  query,
} from 'firebase/firestore';
import { firestoreDb } from '@/lib/firebaseFirestore';
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
  Map,
  Play,
  ChevronLeft,
  ChevronRight,
  Eye,
  Star,
  FileText,
  Sparkles,
  Globe,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
  state: string;
  country: string;
  description: string;
  category: string;
  googleMapsUrl: string;
  coverImage: string;
  media: MediaItem[];
  extraInfo: InfoSection[];
  createdAt?: unknown;
  updatedAt?: unknown;
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
  state: '',
  country: 'India',
  description: '',
  category: 'Other',
  googleMapsUrl: '',
  coverImage: '',
  media: [],
  extraInfo: [],
};

// ─── Video upload (raw fetch, no extra SDK) ──────────────────────────────────
// ─── Video upload (R2 S3-compatible API) ───────────────────────────────────
async function uploadVideoToR2(file: File): Promise<MediaItem> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('folder', 'tourist-places/videos');

  const res = await fetch('/api/upload', {
    method: 'POST',
    body: fd
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err?.error ?? 'Video upload failed');
  }
  const data = await res.json() as { url: string; key: string };
  return { url: data.url, publicId: data.key, type: 'video' };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatBytes(b: number) {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);

  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryMedia, setGalleryMedia] = useState<MediaItem[]>([]);
  const [galleryStart, setGalleryStart] = useState(0);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);      // for saved video thumbnails
  const pendingThumbInputRef = useRef<HTMLInputElement>(null);   // for pending video thumbnails
  const [thumbnailTarget, setThumbnailTarget] = useState<string | null>(null);
  const [pendingThumbTarget, setPendingThumbTarget] = useState<string | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchPlaces = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(firestoreDb, 'touristPlaces'), orderBy('createdAt', 'desc'))
      );
      setPlaces(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TouristPlace, 'id'>) }))
      );
    } catch {
      flash('Failed to load tourist places.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPlaces(); }, [fetchPlaces]);

  const flash = (msg: string, type: 'success' | 'error') => {
    if (type === 'success') { setSuccess(msg); setTimeout(() => setSuccess(''), 3500); }
    else { setError(msg); setTimeout(() => setError(''), 6000); }
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
    setShowForm(false);
    setError('');
  };

  const handleEdit = (place: TouristPlace) => {
    setForm({
      name: place.name,
      area: place.area || '',
      state: place.state,
      country: place.country,
      description: place.description,
      category: place.category,
      googleMapsUrl: place.googleMapsUrl || '',
      coverImage: place.coverImage || '',
      media: place.media || [],
      extraInfo: (place.extraInfo || []).map((s) => ({
        ...s,
        id: s.id || `${Date.now()}-${Math.random()}`,
      })),
    });
    setPendingFiles([]);
    setEditingId(place.id!);
    setShowForm(true);
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
    const todo = pendingFiles.filter((p) => p.progress === 'idle');
    if (todo.length === 0) return [];
    setUploadingCount(todo.length);

    const results: MediaItem[] = [];
    for (const item of todo) {
      setPendingFiles((prev) =>
        prev.map((p) => p.id === item.id ? { ...p, progress: 'uploading' as const } : p)
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
        setPendingFiles((prev) =>
          prev.map((p) => p.id === item.id ? { ...p, progress: 'error' as const, errorMsg: msg } : p)
        );
      } finally {
        setUploadingCount((c) => c - 1);
      }
    }
    return results;
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

      const payload = {
        name: form.name,
        area: form.area,
        state: form.state,
        country: form.country,
        description: form.description,
        category: form.category,
        googleMapsUrl: form.googleMapsUrl,
        coverImage,
        media: allMedia,
        extraInfo: form.extraInfo.map(({ heading, description }) => ({ heading, description })),
        updatedAt: serverTimestamp(),
      };

      if (editingId) {
        await updateDoc(doc(firestoreDb, 'touristPlaces', editingId), payload);
        flash('Place updated!', 'success');
      } else {
        await addDoc(collection(firestoreDb, 'touristPlaces'), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        flash('Place added!', 'success');
      }
      resetForm();
      fetchPlaces();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save.';
      flash(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this tourist place?')) return;
    try {
      await deleteDoc(doc(firestoreDb, 'touristPlaces', id));
      flash('Place deleted.', 'success');
      fetchPlaces();
    } catch {
      flash('Failed to delete.', 'error');
    }
  };

  const openGallery = (media: MediaItem[], startIndex: number) => {
    setGalleryMedia(media);
    setGalleryStart(startIndex);
    setGalleryOpen(true);
  };

  const formImages = form.media.filter((m) => m.type === 'image');
  const formVideos = form.media.filter((m) => m.type === 'video');
  const pendingImages = pendingFiles.filter((p) => p.type === 'image');
  const pendingVideos = pendingFiles.filter((p) => p.type === 'video');

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
                <MapPin className="h-3.5 w-3.5" /> {places.length} place{places.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <Button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="shrink-0 bg-white text-rose-700 hover:bg-white/90 font-bold gap-2 rounded-2xl px-6 py-5 shadow-lg hover:shadow-xl transition-all"
          >
            <Plus className="h-5 w-5" />
            Add Place
          </Button>
        </div>
      </motion.div>

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
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="rounded-3xl border border-border bg-card shadow-xl overflow-hidden"
        >
          {/* Form header band */}
          <div className="flex items-center justify-between px-6 py-4 bg-linear-to-r from-rose-600/10 via-pink-500/5 to-transparent border-b border-border">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-rose-600/10">
                <Sparkles className="h-5 w-5 text-rose-600" />
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
                <Label htmlFor="tp-area">Area / Locality</Label>
                <Input id="tp-area" placeholder="e.g. Tirumala Hills, Old Town"
                  value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="tp-desc">Description</Label>
                <textarea id="tp-desc" rows={3} placeholder="Brief description of the place…"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
              </div>
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
                  <Map className="h-4 w-4 text-rose-500" /> Google Maps Link
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
            <p className="text-2xl font-extrabold text-foreground">No tourist places yet</p>
            <p className="text-sm text-muted-foreground">Click <span className="font-semibold text-rose-500">"Add Place"</span> above to get started</p>
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
                      onClick={() => handleEdit(place)}
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
                    <p className="text-xs text-muted-foreground line-clamp-2">{place.description}</p>
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
                      <Map className="h-3.5 w-3.5" /> View on Google Maps
                    </a>
                  )}
                </div>
              </motion.div>
            );
          })}
        </motion.div>
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


