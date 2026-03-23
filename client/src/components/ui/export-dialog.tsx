import { memo, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FileText,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  Circle,
  Users,
  DollarSign,
  Activity,
  Eye,
  MessageSquare,
  BarChart3,
  Loader2,
  X,
  ChevronDown,
  UserCircle2,
  MapPin,
} from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { ref, get } from 'firebase/database';
import { firestoreDb } from '@/lib/firebaseFirestore';
import { database } from '@/lib/firebase';
import { loadAboutPageContent } from '@/lib/aboutContent';
import { resolveAvatarUrl } from '@/lib/avatar';

// ── Types ───────────────────────────────────────────────────────────────────
interface ExportSection {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}

interface UserRecord {
  id: string;
  displayName: string;
  email: string;
  role: string;
  avatar: string;
  isActive: boolean;
  city: string;
  phoneNumber: string;
  createdAt: string;
  username: string;
}

interface RoomRecord {
  id: string;
  name: string;
  isPrivate: boolean;
  memberCount: number;
  createdAt: string;
  description: string;
  createdBy: string;
}

interface TripStoryRecord {
  id: string;
  title: string;
  destination: string;
  authorId: string;
  authorName: string;
  authorEmail: string;
  travelType: string;
  duration: string;
  budget: string;
  area: string;
  state: string;
  country: string;
  likesCount: number;
  commentCount: number;
  mediaCount: number;
  createdAt: string;
}

interface TouristPlaceRecord {
  id: string;
  name: string;
  area: string;
  state: string;
  country: string;
  description: string;
  category: string;
  googleMapsUrl: string;
  coverImage: string;
  mediaCount: number;
  createdAt: string;
  updatedAt: string;
}

interface TravelItineraryRecord {
  id: string;
  place: string;
  country: string;
  itinerary: string;
  placesCount: number;
  restaurantsCount: number;
  hotelsCount: number;
  imageCount: number;
  videoCount: number;
  budget: string;
  createdAt: string;
  updatedAt: string;
}

interface FeedbackRecord {
  id: string;
  type: 'review' | 'comment';
  placeId: string;
  placeName: string;
  userId: string;
  author: string;
  text: string;
  rating: number | null;
  mediaCount: number;
  createdAt: string;
}

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stats: { title: string; value: string; change: string }[];
}

// ── Available export sections ───────────────────────────────────────────────
const SECTIONS: ExportSection[] = [
  { id: 'stats',         label: 'Dashboard Stats',  description: 'Users, revenue, sessions, page views',       icon: BarChart3,     color: 'text-blue-500',   bgColor: 'bg-blue-500/10'   },
  { id: 'users',         label: 'Users',            description: 'All users — or pick one for a detailed PDF', icon: Users,         color: 'text-purple-500', bgColor: 'bg-purple-500/10' },
  { id: 'activity',      label: 'Activity',         description: 'All website activity for all users or one user', icon: Activity,   color: 'text-red-500',    bgColor: 'bg-red-500/10'    },
  { id: 'trip-stories',  label: 'Trip Stories',     description: 'All stories with filters: user, area, state, country', icon: MessageSquare, color: 'text-fuchsia-500', bgColor: 'bg-fuchsia-500/10' },
  { id: 'tourist-places',label: 'Tourist Places',   description: 'All places with filters: area, state, country', icon: MapPin, color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' },
  { id: 'travel-itineraries', label: 'Travel Itineraries', description: 'All itineraries with filters: place, country', icon: MapPin, color: 'text-sky-500', bgColor: 'bg-sky-500/10' },
  { id: 'reviews-comments', label: 'Reviews & Comments', description: 'All place feedback with filters: user, type, post', icon: MessageSquare, color: 'text-amber-500', bgColor: 'bg-amber-500/10' },
  { id: 'about-page',    label: 'About Page',       description: 'All About page CMS content and metadata',     icon: FileText,      color: 'text-indigo-500', bgColor: 'bg-indigo-500/10' },
  { id: 'subscriptions', label: 'Subscriptions',    description: 'Subscription & revenue records',             icon: DollarSign,    color: 'text-green-500',  bgColor: 'bg-green-500/10'  },
  { id: 'chatrooms',     label: 'Chat Rooms',       description: 'Room list & member counts',                  icon: MessageSquare, color: 'text-orange-500', bgColor: 'bg-orange-500/10' },
  { id: 'pageviews',     label: 'Page Views',       description: 'Analytics page view counter',                icon: Eye,           color: 'text-cyan-500',   bgColor: 'bg-cyan-500/10'   },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(v: unknown) { return v == null || v === '' ? '\u2014' : String(v); }

// ── CSV helpers ─────────────────────────────────────────────────────────────
function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v).replace(/"/g, '""');
    return /[",\n\r]/.test(s) ? `"${s}"` : s;
  };
  return [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n');
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function dateStr() {
  return new Date().toISOString().split('T')[0];
}

function relativeTime(ms: number): string {
  if (!ms) return '—';
  const diff = Date.now() - ms;
  if (diff < 60_000)        return 'just now';
  if (diff < 3_600_000)     return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)    return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000)   return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(ms).toLocaleDateString();
}

function normalizeText(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function deriveStoryGeo(rawStory: any): { area: string; state: string; country: string } {
  const destination = String(rawStory?.destination || '').trim();
  const tokens = destination
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);

  const area =
    String(rawStory?.area || rawStory?.region || rawStory?.city || '').trim() ||
    (tokens.length >= 3 ? tokens[0] : destination);

  const state =
    String(rawStory?.state || rawStory?.province || '').trim() ||
    (tokens.length >= 2 ? tokens[tokens.length - 2] : '');

  const country =
    String(rawStory?.country || '').trim() ||
    (tokens.length >= 1 ? tokens[tokens.length - 1] : '');

  return {
    area,
    state,
    country,
  };
}

function flattenAboutRows(content: any): Record<string, unknown>[] {
  const exportedAt = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];

  const push = (section: string, field: string, value: unknown, order = '') => {
    rows.push({
      section,
      field,
      value: Array.isArray(value) ? value.join(', ') : value ?? '',
      order,
      exportedAt,
    });
  };

  Object.entries(content?.hero ?? {}).forEach(([field, value]) => {
    push('hero', field, value);
  });

  Object.entries(content?.founder ?? {}).forEach(([field, value]) => {
    if (field === 'paragraphs' && Array.isArray(value)) {
      value.forEach((paragraph: unknown, index: number) => {
        push('founder', `paragraph_${index + 1}`, paragraph, String(index + 1));
      });
      return;
    }

    if (field === 'stats' && Array.isArray(value)) {
      value.forEach((stat: any, index: number) => {
        push('founder_stats', 'label', stat?.label ?? '', `${index + 1}`);
        push('founder_stats', 'value', stat?.value ?? '', `${index + 1}`);
      });
      return;
    }

    push('founder', field, value);
  });

  (content?.socialLinks ?? []).forEach((item: any, index: number) => {
    Object.entries(item ?? {}).forEach(([field, value]) => {
      push('social_links', field, value, String(index + 1));
    });
  });

  (content?.youtubeVideos ?? []).forEach((item: any, index: number) => {
    push('youtube_videos', 'id', item?.id ?? '', String(index + 1));
  });

  (content?.developers ?? []).forEach((dev: any, index: number) => {
    Object.entries(dev ?? {}).forEach(([field, value]) => {
      push('developers', field, value, String(index + 1));
    });
  });

  Object.entries(content?.contact ?? {}).forEach(([field, value]) => {
    push('contact', field, value);
  });

  return rows;
}

// ── Single-room deep fetcher ──────────────────────────────────────────────────
async function fetchRoomDetail(roomId: string) {
  const roomSnap = await get(ref(database, `chatrooms/${roomId}`));
  const room     = roomSnap.val() ?? {};

  // Flatten messages, sorted oldest → newest
  const rawMsgs: any[] = Object.entries(room.messages ?? {}).map(([id, m]: [string, any]) => ({ _id: id, ...m }));
  rawMsgs.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

  const messages = rawMsgs.map((m, idx) => ({
    '#':     idx + 1,
    sender:  m.username ?? m.displayName ?? m.userId ?? '—',
    message: m.text ?? m.content ?? '(media/attachment)',
    type:    m.type ?? 'text',
    sentAt:  m.timestamp ? new Date(m.timestamp).toLocaleString() : '—',
    edited:  m.edited  ? 'yes' : 'no',
    deleted: m.deleted ? 'yes' : 'no',
  }));

  // participants is stored as a plain string[] of UIDs in RTDB
  const rawParticipants = room.participants ?? [];
  const participantUids: string[] = Array.isArray(rawParticipants)
    ? rawParticipants.filter(Boolean)
    : Object.values(rawParticipants).filter((v): v is string => typeof v === 'string');

  // Collect ALL uids to look up (participants + creator)
  const creatorUid: string = room.createdBy ?? '';
  const allUids = [...new Set([...participantUids, creatorUid].filter(Boolean))];

  // Fetch Firestore profiles in parallel (chunked to avoid >10-item 'in' limit)
  const userMap: Record<string, any> = {};
  const chunks: string[][] = [];
  for (let i = 0; i < allUids.length; i += 10) chunks.push(allUids.slice(i, i + 10));
  await Promise.allSettled(
    chunks.map(chunk =>
      getDocs(query(collection(firestoreDb, 'users'), where('__name__', 'in', chunk)))
        .then(snap => snap.forEach(d => { userMap[d.id] = d.data(); }))
    )
  );

  // Build enriched participants — UID array has no joinedAt/role, use Firestore role
  const participants = participantUids.map(uid => {
    const u = userMap[uid] ?? {};
    return {
      uid,
      displayName: u.displayName ?? u.username ?? '—',
      email:       u.email ?? '—',
      role:        u.role  ?? 'member',
      joinedAt:    '—',   // RTDB array format doesn't store per-participant joinedAt
    };
  });

  // Creator full profile
  const creatorData = creatorUid ? (userMap[creatorUid] ?? {}) : {};
  const creator = {
    uid:         creatorUid || '—',
    displayName: creatorData.displayName ?? creatorData.username ?? '—',
    email:       creatorData.email       ?? '—',
    role:        creatorData.role        ?? '—',
    city:        creatorData.city        ?? '—',
    phone:       creatorData.phoneNumber ?? '—',
    avatar:      resolveAvatarUrl(creatorData),
    createdAt:   creatorData.createdAt?.toDate?.()?.toLocaleDateString()
                  ?? (creatorData.createdAt ? new Date(creatorData.createdAt).toLocaleDateString() : '—'),
  };

  const info = {
    id:            roomId,
    name:          room.name        ?? '—',
    description:   room.description ?? '—',
    isPrivate:     room.isPrivate   ? 'Private' : 'Public',
    memberCount:   room.memberCount ?? participants.length,
    createdBy:     creator.displayName !== '—' ? creator.displayName : (creatorUid || '—'),
    createdAt:     room.createdAt   ? new Date(room.createdAt).toLocaleString() : '—',
    totalMessages: messages.length,
  };

  return { info, participants, creator, messages };
}

// ── Single-room PDF ────────────────────────────────────────────────────────────
function printRoomPdf(data: Awaited<ReturnType<typeof fetchRoomDetail>>) {
  const { info, participants, creator, messages } = data;
  const logoUrl = `${window.location.origin}/logo.jpg`;
  const genDate = new Date().toLocaleString();

  const participantRows = participants.map((p, idx) => `
    <tr>
      <td style="text-align:center;color:#9ca3af;font-size:10px">${idx + 1}</td>
      <td style="font-weight:600;color:#111827">${p.displayName}</td>
      <td style="color:#2563eb">${p.email}</td>
      <td style="font-size:10px;word-break:break-all;color:#6b7280">${p.uid}</td>
      <td><span style="background:${p.role === 'admin' || p.role === 'moderator' ? '#fef3c7' : '#f0fdf4'};color:${p.role === 'admin' || p.role === 'moderator' ? '#92400e' : '#166534'};padding:2px 8px;border-radius:99px;font-size:9px;font-weight:700;text-transform:uppercase">${p.role}</span></td>
      <td style="white-space:nowrap;font-size:10px;color:#6b7280">${p.joinedAt}</td>
    </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:#9ca3af">No participants recorded</td></tr>';

  const creatorSection = `
    <div class="section">
      <div class="section-title">Room Creator</div>
      <div class="creator-card">
        <div class="creator-avatar">
          ${creator.avatar
            ? `<img src="${creator.avatar}" alt="" onerror="this.style.display='none';this.nextSibling.style.display='flex'" style="width:60px;height:60px;border-radius:50%;object-fit:cover;border:2px solid #fed7aa" /><div style="display:none;width:60px;height:60px;border-radius:50%;background:#fff7ed;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#ea580c">${creator.displayName.charAt(0).toUpperCase()}</div>`
            : `<div style="width:60px;height:60px;border-radius:50%;background:#fff7ed;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#ea580c">${creator.displayName !== '—' ? creator.displayName.charAt(0).toUpperCase() : '?'}</div>`
          }
        </div>
        <div class="creator-info">
          <div class="creator-name">${creator.displayName}</div>
          <div class="creator-meta">${creator.email}</div>
          <div class="creator-meta" style="margin-top:2px;font-size:9px;opacity:.75">UID: ${creator.uid}</div>
        </div>
        <div class="creator-details">
          <div class="detail-row"><span class="detail-label">Role</span><span class="detail-val">${creator.role}</span></div>
          <div class="detail-row"><span class="detail-label">City</span><span class="detail-val">${creator.city}</span></div>
          <div class="detail-row"><span class="detail-label">Phone</span><span class="detail-val">${creator.phone}</span></div>
          <div class="detail-row"><span class="detail-label">Account Since</span><span class="detail-val">${creator.createdAt}</span></div>
        </div>
      </div>
    </div>`;

  const messageRows = messages.map(m => `
    <tr>
      <td style="text-align:center;color:#9ca3af;font-size:10px">${m['#']}</td>
      <td style="white-space:nowrap;font-weight:600;color:#1d4ed8">${m.sender}</td>
      <td style="max-width:380px;word-break:break-word">${m.message}</td>
      <td style="white-space:nowrap;font-size:10px;color:#6b7280">${m.sentAt}</td>
      <td style="text-align:center;font-size:10px">${m.edited === 'yes' ? '✏️' : ''}</td>
    </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:#9ca3af">No messages in this room</td></tr>';

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Chat Room \u2014 ${info.name}</title>
<style>
  * { box-sizing:border-box;margin:0;padding:0; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:11px;color:#111827;padding:28px 32px 32px;background:#fff;position:relative; }
  body::before { content:'ABjee Travel';position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-38deg);
    font-size:90px;font-weight:900;color:rgba(234,88,12,.04);letter-spacing:-.02em;white-space:nowrap;pointer-events:none;z-index:0; }

  .brand-header { display:flex;align-items:center;justify-content:space-between;
    background:linear-gradient(135deg,#0f172a 0%,#1e3a8a 55%,#4c1d95 100%);
    color:#fff;padding:18px 24px;border-radius:12px 12px 0 0;position:relative;overflow:hidden; }
  .brand-header::before { content:'';position:absolute;left:-30px;top:-30px;width:160px;height:160px;
    background:radial-gradient(circle,rgba(255,255,255,.09) 0%,transparent 65%);pointer-events:none;z-index:0; }
  .brand-header::after { content:'';position:absolute;right:-40px;top:-40px;width:210px;height:210px;
    background:radial-gradient(circle,rgba(255,255,255,.11) 0%,transparent 70%);pointer-events:none; }
  .brand-left { display:flex;align-items:center;gap:18px; }
  .brand-logo { height:72px;width:72px;border-radius:14px;object-fit:cover;
    border:3px solid rgba(255,255,255,.5);flex-shrink:0;
    box-shadow:0 0 0 1px rgba(255,255,255,.15),0 6px 24px rgba(0,0,0,.5); }
  .brand-name { font-size:30px;font-weight:900;letter-spacing:-.01em;
    background:linear-gradient(90deg,#ffffff 15%,#fed7aa 60%,#fdba74 100%);
    -webkit-background-clip:text;-webkit-text-fill-color:transparent;line-height:1.1; }
  .brand-tagline { display:block;font-size:10.5px;opacity:.78;margin-top:4px;letter-spacing:.07em;font-style:italic; }
  .brand-right { text-align:right;flex-shrink:0; }
  .report-label { display:block;font-size:9px;text-transform:uppercase;letter-spacing:.12em;opacity:.6;margin-bottom:3px; }
  .report-title { display:block;font-size:13px;font-weight:700;opacity:.95; }
  .report-date  { display:block;font-size:9px;opacity:.55;margin-top:2px; }
  .brand-divider { height:6px;background:linear-gradient(90deg,#f97316,#ec4899,#8b5cf6,#3b82f6,#10b981);
    border-radius:0 0 4px 4px;margin-bottom:24px; }

  .room-card { display:flex;align-items:center;gap:18px;
    background:linear-gradient(135deg,#ea580c 0%,#dc2626 50%,#9333ea 100%);
    color:#fff;padding:16px 22px;border-radius:10px;margin-bottom:22px;position:relative;overflow:hidden; }
  .room-card::before { content:'';position:absolute;right:-20px;bottom:-20px;width:120px;height:120px;
    background:radial-gradient(circle,rgba(255,255,255,.1) 0%,transparent 70%);pointer-events:none; }
  .room-icon { width:56px;height:56px;border-radius:12px;background:rgba(255,255,255,.15);
    display:flex;align-items:center;justify-content:center;font-size:26px;flex-shrink:0;
    border:2px solid rgba(255,255,255,.3); }
  .room-info h1 { font-size:20px;font-weight:700;margin-bottom:3px; }
  .room-info p  { font-size:11px;opacity:.82; }
  .room-badge { display:inline-block;margin-top:5px;background:rgba(255,255,255,.18);padding:2px 10px;
    border-radius:99px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;
    border:1px solid rgba(255,255,255,.25); }

  .stats-bar { display:grid;grid-template-columns:repeat(4,1fr);gap:0;
    border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:22px; }
  .stat-item { padding:10px 14px;text-align:center;border-right:1px solid #f3f4f6; }
  .stat-item:last-child { border-right:none; }
  .stat-value { font-size:20px;font-weight:800;color:#1e3a8a;line-height:1; }
  .stat-label { font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:#9ca3af;margin-top:3px; }

  .section { margin-bottom:22px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;page-break-inside:avoid;position:relative;z-index:1; }
  .section-title { background:linear-gradient(90deg,#fff7ed,#fef3c7);padding:9px 16px;font-size:11px;font-weight:700;
    text-transform:uppercase;letter-spacing:.08em;color:#92400e;border-bottom:1px solid #fde68a;
    display:flex;align-items:center;gap:8px; }
  .section-title::before { content:'';display:inline-block;width:3px;height:14px;
    background:linear-gradient(180deg,#f97316,#dc2626);border-radius:2px; }
  .info-grid { display:grid;grid-template-columns:1fr 1fr;gap:0; }
  .info-item { padding:9px 16px;border-bottom:1px solid #f3f4f6; }
  .info-item:nth-child(odd) { border-right:1px solid #f3f4f6; }
  .info-label { font-size:8.5px;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:2px; }
  .info-value { font-size:12px;font-weight:500;color:#111827;word-break:break-all; }

  /* Creator card */
  .creator-card { display:flex;align-items:flex-start;gap:16px;padding:14px 16px; }
  .creator-avatar { flex-shrink:0; }
  .creator-info { flex:1;min-width:0; }
  .creator-name { font-size:15px;font-weight:700;color:#111827; }
  .creator-meta { font-size:11px;color:#6b7280;margin-top:2px; }
  .creator-details { display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;flex-shrink:0;min-width:200px; }
  .detail-row { display:flex;flex-direction:column; }
  .detail-label { font-size:8.5px;text-transform:uppercase;letter-spacing:.07em;color:#9ca3af; }
  .detail-val { font-size:11px;font-weight:500;color:#111827; }

  table { width:100%;border-collapse:collapse; }
  th { background:linear-gradient(90deg,#fff7ed,#fef9f0);text-align:left;padding:7px 12px;font-size:9.5px;
    font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#92400e;border-bottom:1px solid #fde68a; }
  td { padding:6px 12px;border-bottom:1px solid #f9f5f0;font-size:11px;color:#374151;vertical-align:top; }
  tr:last-child td { border-bottom:none; }
  tr:nth-child(even) td { background:#fffbf5; }

  .brand-footer { display:flex;align-items:center;justify-content:space-between;
    margin-top:30px;padding:14px 22px;border-radius:12px;
    background:linear-gradient(135deg,#fff7ed,#fffbeb);border:1px solid #fed7aa;
    box-shadow:0 1px 6px rgba(234,88,12,.1); }
  .footer-left  { display:flex;align-items:center;gap:13px; }
  .footer-logo  { height:40px;width:40px;border-radius:9px;object-fit:cover;border:2px solid rgba(234,88,12,.3); }
  .footer-brand { font-size:15px;font-weight:900;color:#9a3412;letter-spacing:-.01em; }
  .footer-sub   { font-size:9px;color:#6b7280;margin-top:2px; }
  .footer-right { text-align:right;color:#9ca3af;font-size:8.5px;line-height:1.6; }

  @media print {
    body { padding:16px; }
    .brand-header,.brand-divider,.room-card,.stats-bar,.section-title,th,.brand-footer
      { -webkit-print-color-adjust:exact;print-color-adjust:exact; }
  }
</style>
</head>
<body>

  <div class="brand-header">
    <div class="brand-left">
      <img src="${logoUrl}" alt="ABjee" class="brand-logo" onerror="this.style.display='none'" />
      <div>
        <div class="brand-name">ABjee Travel</div>
        <span class="brand-tagline">Connecting Travelers &middot; Exploring the World</span>
      </div>
    </div>
    <div class="brand-right">
      <span class="report-label">Admin Report</span>
      <span class="report-title">Chat Room Transcript</span>
      <span class="report-date">${genDate}</span>
    </div>
  </div>
  <div class="brand-divider"></div>

  <div class="room-card">
    <div class="room-icon">&#128172;</div>
    <div class="room-info">
      <h1>${info.name}</h1>
      <p>${info.description !== '\u2014' ? info.description : 'No description provided'}</p>
      <p style="margin-top:3px;font-size:10px;opacity:.75">Created by: ${info.createdBy} &nbsp;&middot;&nbsp; ${info.createdAt}</p>
      <span class="room-badge">${info.isPrivate}</span>
    </div>
  </div>

  <div class="stats-bar">
    <div class="stat-item"><div class="stat-value">${info.totalMessages}</div><div class="stat-label">Messages</div></div>
    <div class="stat-item"><div class="stat-value">${info.memberCount}</div><div class="stat-label">Members</div></div>
    <div class="stat-item"><div class="stat-value">${participants.length}</div><div class="stat-label">Participants</div></div>
    <div class="stat-item"><div class="stat-value">${info.isPrivate === 'Private' ? '&#128274;' : '&#127758;'}</div><div class="stat-label">Visibility</div></div>
  </div>

  <div class="section">
    <div class="section-title">Room Details</div>
    <div class="info-grid">
      <div class="info-item"><div class="info-label">Room ID</div><div class="info-value">${info.id}</div></div>
      <div class="info-item"><div class="info-label">Room Name</div><div class="info-value">${info.name}</div></div>
      <div class="info-item"><div class="info-label">Type</div><div class="info-value">${info.isPrivate}</div></div>
      <div class="info-item"><div class="info-label">Member Count</div><div class="info-value">${info.memberCount}</div></div>
      <div class="info-item"><div class="info-label">Created By</div><div class="info-value">${info.createdBy}</div></div>
      <div class="info-item"><div class="info-label">Created At</div><div class="info-value">${info.createdAt}</div></div>
      <div class="info-item"><div class="info-label">Total Messages</div><div class="info-value">${info.totalMessages}</div></div>
      <div class="info-item"><div class="info-label">Description</div><div class="info-value">${info.description}</div></div>
    </div>
  </div>

  ${creatorSection}

  <div class="section">
    <div class="section-title">Participants (${participants.length})</div>
    <table><thead><tr><th style="width:28px">#</th><th>Name</th><th>Email</th><th>UID</th><th style="width:90px">Role</th><th style="width:130px">Joined At</th></tr></thead>
    <tbody>${participantRows}</tbody></table>
  </div>

  <div class="section">
    <div class="section-title">Full Message Transcript (${messages.length} messages)</div>
    <table><thead><tr><th style="width:36px">#</th><th style="width:130px">Sender</th><th>Message</th><th style="width:130px">Sent At</th><th style="width:30px">✏️</th></tr></thead>
    <tbody>${messageRows}</tbody></table>
  </div>

  <div class="brand-footer">
    <div class="footer-left">
      <img src="${logoUrl}" alt="ABjee" class="footer-logo" onerror="this.style.display='none'" />
      <div>
        <div class="footer-brand">ABjee Travel</div>
        <div class="footer-sub">Connecting Travelers &middot; Exploring the World</div>
      </div>
    </div>
    <div class="footer-right">
      <div>Admin Report &mdash; Chat Room Transcript</div>
      <div>Room: ${info.name} (${info.id})</div>
      <div>Generated: ${genDate}</div>
    </div>
  </div>

</body></html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('Please allow popups to export PDF.'); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 600);
}

// ── Single-user deep profile fetcher ────────────────────────────────────────
async function fetchUserProfile(userId: string) {
  const [userSnap, subsSnap, statusSnap, roomsSnap] = await Promise.allSettled([
    getDocs(query(collection(firestoreDb, 'users'), where('__name__', '==', userId))),
    getDocs(query(collection(firestoreDb, 'subscriptions'), where('userId', '==', userId))),
    get(ref(database, `status/${userId}`)),
    get(ref(database, 'chatrooms')),
  ]);

  let profile: any = {};
  if (userSnap.status === 'fulfilled') {
    const doc = userSnap.value.docs[0];
    if (doc) profile = { id: doc.id, ...doc.data() };
  }

  const subscriptions: any[] = [];
  if (subsSnap.status === 'fulfilled') {
    subsSnap.value.forEach(d => subscriptions.push({ id: d.id, ...d.data() }));
  }

  let status: any = null;
  if (statusSnap.status === 'fulfilled') status = statusSnap.value.val();

  const messages: { room: string; text: string; timestamp: string }[] = [];
  if (roomsSnap.status === 'fulfilled') {
    const rooms = roomsSnap.value.val() ?? {};
    Object.entries(rooms).forEach(([, room]: [string, any]) => {
      // Skip rooms the user is not a member of — avoids scanning all messages
      if (!isInRoom(room, userId)) return;
      const msgs = room?.messages ?? {};
      Object.values(msgs).forEach((m: any) => {
        const matchId   = m?.userId === userId || m?.uid === userId;
        const matchName = profile.username && m?.username === profile.username;
        if (matchId || matchName) {
          messages.push({
            room: room.name ?? 'Unknown Room',
            text: m.text ?? m.content ?? '(media/attachment)',
            timestamp: m.timestamp ? new Date(m.timestamp).toLocaleString() : '—',
          });
        }
      });
    });
  }

  messages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return { profile, subscriptions, status, messages };
}

/** Check whether a uid appears in the RTDB participants field (array or map). */
function isInRoom(room: any, uid: string): boolean {
  const p = room?.participants;
  if (!p) return false;
  if (Array.isArray(p)) return p.includes(uid);
  return uid in p;
}

// ── Single-user rich PDF ──────────────────────────────────────────────────────
function printUserProfilePdf(data: Awaited<ReturnType<typeof fetchUserProfile>>) {
  const { profile, subscriptions, status, messages } = data;
  const name   = profile.displayName || profile.email || 'Unknown User';
  const avatar = resolveAvatarUrl(profile);

  const subRows = subscriptions.map(s => `
    <tr>
      <td>${fmt(s.plan?.type ?? s.type)}</td>
      <td>${fmt(s.status)}</td>
      <td>${s.plan?.price?.amount != null ? `$${s.plan.price.amount} ${s.plan.price.currency ?? 'USD'}` : '\u2014'}</td>
      <td>${s.startDate?.toDate?.()?.toLocaleDateString() ?? fmt(s.startDate)}</td>
      <td>${s.endDate?.toDate?.()?.toLocaleDateString()   ?? fmt(s.endDate)}</td>
    </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:#9ca3af">No subscriptions found</td></tr>';

  const msgRows = messages.map(m => `
    <tr>
      <td>${m.room}</td>
      <td style="max-width:340px;word-break:break-word">${m.text}</td>
      <td style="white-space:nowrap">${m.timestamp}</td>
    </tr>`).join('') || '<tr><td colspan="3" style="text-align:center;color:#9ca3af">No messages found</td></tr>';

  const onlineStatus = status?.isOnline
    ? '<span style="color:#16a34a;font-weight:600">&#9679; Online</span>'
    : `<span style="color:#6b7280">Last seen: ${status?.lastSeen ? new Date(status.lastSeen).toLocaleString() : 'unknown'}</span>`;

  const createdAt = profile.createdAt?.toDate?.()?.toLocaleDateString()
    ?? (profile.createdAt ? new Date(profile.createdAt).toLocaleDateString() : '\u2014');

  const logoUrl = `${window.location.origin}/logo.jpg`;
  const genDate  = new Date().toLocaleString();

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>User Profile \u2014 ${name}</title>
<style>
  * { box-sizing:border-box;margin:0;padding:0; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:11px;color:#111827;padding:28px 32px 32px;background:#fff;position:relative; }

  /* ─── Watermark ─────────────────── */
  body::before { content:'ABjee Travel';position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-38deg);
    font-size:90px;font-weight:900;color:rgba(37,99,235,.045);letter-spacing:-.02em;white-space:nowrap;pointer-events:none;z-index:0; }

  /* ─── Brand header ───────────────── */
  .brand-header { display:flex;align-items:center;justify-content:space-between;
    background:linear-gradient(135deg,#0f172a 0%,#1e3a8a 55%,#4c1d95 100%);
    color:#fff;padding:18px 24px;border-radius:12px 12px 0 0;position:relative;overflow:hidden; }
  .brand-header::before { content:'';position:absolute;left:-30px;top:-30px;width:160px;height:160px;
    background:radial-gradient(circle,rgba(255,255,255,.09) 0%,transparent 65%);pointer-events:none;z-index:0; }
  .brand-header::after { content:'';position:absolute;right:-40px;top:-40px;width:210px;height:210px;
    background:radial-gradient(circle,rgba(255,255,255,.11) 0%,transparent 70%);pointer-events:none; }
  .brand-left  { display:flex;align-items:center;gap:18px; }
  .brand-logo  { height:72px;width:72px;border-radius:14px;object-fit:cover;
    border:3px solid rgba(255,255,255,.5);flex-shrink:0;
    box-shadow:0 0 0 1px rgba(255,255,255,.15),0 6px 24px rgba(0,0,0,.5); }
  .brand-name  { font-size:30px;font-weight:900;letter-spacing:-.01em;
    background:linear-gradient(90deg,#ffffff 15%,#bfdbfe 60%,#7dd3fc 100%);
    -webkit-background-clip:text;-webkit-text-fill-color:transparent;line-height:1.1; }
  .brand-tagline { display:block;font-size:10.5px;opacity:.78;margin-top:4px;letter-spacing:.07em;font-style:italic; }
  .brand-right { text-align:right;flex-shrink:0; }
  .report-label { display:block;font-size:9px;text-transform:uppercase;letter-spacing:.12em;opacity:.6;margin-bottom:3px; }
  .report-title { display:block;font-size:13px;font-weight:700;opacity:.95; }
  .report-date  { display:block;font-size:9px;opacity:.55;margin-top:2px; }

  /* ─── Rainbow divider ────────────── */
  .brand-divider { height:6px;background:linear-gradient(90deg,#3b82f6,#8b5cf6,#ec4899,#f59e0b,#10b981);
    border-radius:0 0 4px 4px;margin-bottom:24px; }

  /* ─── User card ─────────────────── */
  .user-card { display:flex;align-items:center;gap:20px;background:linear-gradient(135deg,#1d4ed8 0%,#7c3aed 100%);
    color:#fff;padding:18px 22px;border-radius:10px;margin-bottom:22px;position:relative;overflow:hidden; }
  .user-card::before { content:'';position:absolute;right:-20px;bottom:-20px;width:120px;height:120px;
    background:radial-gradient(circle,rgba(255,255,255,.1) 0%,transparent 70%);pointer-events:none; }
  .avatar { width:68px;height:68px;border-radius:50%;object-fit:cover;border:3px solid rgba(255,255,255,.4);background:#e5e7eb;flex-shrink:0; }
  .avatar-initials { width:68px;height:68px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:700;color:#fff;flex-shrink:0; }
  .user-info h1 { font-size:20px;font-weight:700;margin-bottom:3px; }
  .user-info p  { font-size:11.5px;opacity:.82; }
  .role-badge { display:inline-block;margin-top:6px;background:rgba(255,255,255,.18);padding:2px 10px;border-radius:99px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;border:1px solid rgba(255,255,255,.25); }

  /* ─── Sections ───────────────────── */
  .section { margin-bottom:20px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;page-break-inside:avoid;position:relative;z-index:1; }
  .section-title { background:linear-gradient(90deg,#f1f5f9,#f8fafc);padding:9px 16px;font-size:11px;font-weight:700;
    text-transform:uppercase;letter-spacing:.08em;color:#374151;border-bottom:1px solid #e5e7eb;
    display:flex;align-items:center;gap:8px; }
  .section-title::before { content:'';display:inline-block;width:3px;height:14px;background:linear-gradient(180deg,#3b82f6,#8b5cf6);border-radius:2px; }
  .info-grid { display:grid;grid-template-columns:1fr 1fr;gap:0; }
  .info-item { padding:9px 16px;border-bottom:1px solid #f3f4f6; }
  .info-item:nth-child(odd) { border-right:1px solid #f3f4f6; }
  .info-label { font-size:8.5px;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:2px; }
  .info-value { font-size:12px;font-weight:500;color:#111827;word-break:break-all; }
  table { width:100%;border-collapse:collapse; }
  th { background:linear-gradient(90deg,#f1f5f9,#f8fafc);text-align:left;padding:7px 12px;font-size:9.5px;
    font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#4b5563;border-bottom:1px solid #dde1e7; }
  td { padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:11px;color:#374151;vertical-align:top; }
  tr:last-child td { border-bottom:none; }
  tr:hover td { background:#f8faff; }

  /* ─── Branded footer ─────────────── */
  .brand-footer { display:flex;align-items:center;justify-content:space-between;
    margin-top:30px;padding:14px 22px;border-radius:12px;
    background:linear-gradient(135deg,#f1f5f9,#eff6ff);border:1px solid #dbeafe;
    box-shadow:0 1px 6px rgba(37,99,235,.08); }
  .footer-left  { display:flex;align-items:center;gap:13px; }
  .footer-logo  { height:40px;width:40px;border-radius:9px;object-fit:cover;border:2px solid rgba(37,99,235,.25); }
  .footer-brand { font-size:15px;font-weight:900;color:#1e3a8a;letter-spacing:-.01em; }
  .footer-sub   { font-size:9px;color:#6b7280;margin-top:2px; }
  .footer-right { text-align:right;color:#9ca3af;font-size:8.5px;line-height:1.6; }

  @media print {
    body { padding:16px; }
    .brand-header,.brand-divider,.user-card,.section-title,th,.brand-footer
      { -webkit-print-color-adjust:exact;print-color-adjust:exact; }
  }
</style>
</head>
<body>

  <!-- ── Brand header ── -->
  <div class="brand-header">
    <div class="brand-left">
      <img src="${logoUrl}" alt="ABjee" class="brand-logo" onerror="this.style.display='none'" />
      <div>
        <div class="brand-name">ABjee Travel</div>
        <span class="brand-tagline">Connecting Travelers &middot; Exploring the World</span>
      </div>
    </div>
    <div class="brand-right">
      <span class="report-label">Admin Report</span>
      <span class="report-title">User Profile</span>
      <span class="report-date">${genDate}</span>
    </div>
  </div>
  <div class="brand-divider"></div>

  <!-- ── User identity card ── -->
  <div class="user-card">
    ${avatar
      ? `<img src="${avatar}" alt="avatar" class="avatar" onerror="this.style.display='none';this.nextSibling.style.display='flex'"/><div class="avatar-initials" style="display:none">${name.charAt(0).toUpperCase()}</div>`
      : `<div class="avatar-initials">${name.charAt(0).toUpperCase()}</div>`}
    <div class="user-info">
      <h1>${name}</h1>
      <p>${profile.email ?? '\u2014'}</p>
      <p style="margin-top:3px">${onlineStatus}</p>
      <span class="role-badge">${profile.role ?? 'user'}</span>
    </div>
  </div>

  <!-- ── Profile details ── -->
  <div class="section">
    <div class="section-title">Profile Details</div>
    <div class="info-grid">
      <div class="info-item"><div class="info-label">User ID</div><div class="info-value">${fmt(profile.id)}</div></div>
      <div class="info-item"><div class="info-label">Username</div><div class="info-value">${fmt(profile.username)}</div></div>
      <div class="info-item"><div class="info-label">Display Name</div><div class="info-value">${fmt(profile.displayName)}</div></div>
      <div class="info-item"><div class="info-label">Email</div><div class="info-value">${fmt(profile.email)}</div></div>
      <div class="info-item"><div class="info-label">Phone</div><div class="info-value">${fmt(profile.phoneNumber)}</div></div>
      <div class="info-item"><div class="info-label">City</div><div class="info-value">${fmt(profile.city)}</div></div>
      <div class="info-item"><div class="info-label">Role</div><div class="info-value">${fmt(profile.role)}</div></div>
      <div class="info-item"><div class="info-label">Account Status</div><div class="info-value">${profile.isActive !== false ? '\u2705 Active' : '\u274c Inactive'}</div></div>
      <div class="info-item"><div class="info-label">Joined</div><div class="info-value">${createdAt}</div></div>
      <div class="info-item"><div class="info-label">Bio</div><div class="info-value">${fmt(profile.bio)}</div></div>
    </div>
  </div>

  <!-- ── Subscriptions ── -->
  <div class="section">
    <div class="section-title">Subscription History (${subscriptions.length})</div>
    <table><thead><tr><th>Plan</th><th>Status</th><th>Amount</th><th>Start</th><th>End</th></tr></thead>
    <tbody>${subRows}</tbody></table>
  </div>

  <!-- ── Messages ── -->
  <div class="section">
    <div class="section-title">Message Activity (${messages.length} messages)</div>
    <table><thead><tr><th>Room</th><th>Message</th><th>Sent At</th></tr></thead>
    <tbody>${msgRows}</tbody></table>
  </div>

  <!-- ── Brand footer ── -->
  <div class="brand-footer">
    <div class="footer-left">
      <img src="${logoUrl}" alt="ABjee" class="footer-logo" onerror="this.style.display='none'" />
      <div>
        <div class="footer-brand">ABjee Travel</div>
        <div class="footer-sub">Connecting Travelers &middot; Exploring the World</div>
      </div>
    </div>
    <div class="footer-right">
      <div>Admin Report &mdash; User Profile</div>
      <div>Generated: ${genDate}</div>
      <div>User ID: ${profile.id ?? '\u2014'}</div>
    </div>
  </div>

</body></html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('Please allow popups to export PDF.'); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 600);
}

// ── Bulk section fetchers ────────────────────────────────────────────────────
async function fetchSectionData(
  id: string,
  stats: ExportDialogProps['stats'],
  cachedUsers?: UserRecord[],
  options?: {
    activityUserId?: string;
    tripStories?: {
      userId?: string;
      area?: string;
      state?: string;
      country?: string;
    };
    touristPlaces?: {
      area?: string;
      state?: string;
      country?: string;
    };
    travelItineraries?: {
      place?: string;
      country?: string;
    };
    feedback?: {
      userId?: string;
      type?: 'all' | 'review' | 'comment';
      placeId?: string;
      itemId?: string;
    };
  },
): Promise<Record<string, unknown>[]> {
  switch (id) {
    case 'stats':
      return stats.map(s => ({ section: s.title, value: s.value, change: s.change, exportedAt: new Date().toISOString() }));

    case 'users': {
      // Reuse already-loaded dropdown list when available — avoids a duplicate Firestore read
      if (cachedUsers && cachedUsers.length > 0) {
        return cachedUsers.map(u => ({
          id: u.id,
          displayName: u.displayName,
          email: u.email,
          role: u.role,
          isActive: u.isActive ? 'active' : 'inactive',
          city: u.city,
          phoneNumber: u.phoneNumber,
          createdAt: u.createdAt,
        }));
      }
      const snap = await getDocs(collection(firestoreDb, 'users'));
      return snap.docs.map(d => {
        const u = d.data();
        return {
          id: d.id,
          displayName: u.displayName ?? '',
          email: u.email ?? '',
          role: u.role ?? 'user',
          isActive: u.isActive !== false ? 'active' : 'inactive',
          city: u.city ?? '',
          phoneNumber: u.phoneNumber ?? '',
          createdAt: u.createdAt?.toDate?.()?.toISOString() ?? u.createdAt ?? '',
        };
      });
    }

    case 'about-page': {
      const content = await loadAboutPageContent();
      return flattenAboutRows(content);
    }

    case 'trip-stories': {
      const userFilter = options?.tripStories?.userId || 'all';
      const areaFilter = normalizeText(options?.tripStories?.area || 'all');
      const stateFilter = normalizeText(options?.tripStories?.state || 'all');
      const countryFilter = normalizeText(options?.tripStories?.country || 'all');

      const usersById = new Map<string, UserRecord>();
      const usersByEmail = new Map<string, UserRecord>();
      const usersByName = new Map<string, UserRecord>();
      (cachedUsers || []).forEach((u) => {
        usersById.set(u.id, u);
        if (u.email) usersByEmail.set(normalizeText(u.email), u);
        if (u.displayName) usersByName.set(normalizeText(u.displayName), u);
      });

      const storiesSnap = await getDocs(collection(firestoreDb, 'stories'));
      const rows: Record<string, unknown>[] = [];

      storiesSnap.forEach((doc) => {
        const s: any = doc.data();
        const { area, state, country } = deriveStoryGeo(s);
        const authorId = String(s.authorId || '').trim();
        const authorEmail = String(s.authorEmail || '').trim();
        const authorName = String(s.authorName || '').trim();

        const resolvedUser =
          (authorId && usersById.get(authorId)) ||
          (authorEmail && usersByEmail.get(normalizeText(authorEmail))) ||
          (authorName && usersByName.get(normalizeText(authorName))) ||
          null;

        const resolvedUserId = resolvedUser?.id || authorId || '';

        if (userFilter !== 'all' && resolvedUserId !== userFilter) return;
        if (areaFilter !== 'all' && normalizeText(area) !== areaFilter) return;
        if (stateFilter !== 'all' && normalizeText(state) !== stateFilter) return;
        if (countryFilter !== 'all' && normalizeText(country) !== countryFilter) return;

        const createdTs = s.createdAt?.toDate?.()?.getTime?.()
          ? s.createdAt.toDate().getTime()
          : new Date(s.createdAt || 0).getTime();

        rows.push({
          storyId: doc.id,
          title: s.title || 'Untitled Story',
          destination: s.destination || '',
          area,
          state,
          country,
          authorId: resolvedUserId || '—',
          authorName: resolvedUser?.displayName || authorName || '—',
          authorEmail: resolvedUser?.email || authorEmail || '—',
          travelType: s.travelType || '—',
          duration: s.duration || '—',
          budget: s.budget || '—',
          likesCount: Array.isArray(s.likes) ? s.likes.length : 0,
          commentCount: Number(s.commentCount || 0),
          mediaCount: (Array.isArray(s.photos) ? s.photos.length : 0) + (Array.isArray(s.videos) ? s.videos.length : 0),
          createdAt: createdTs ? new Date(createdTs).toLocaleString() : '—',
          createdRelative: createdTs ? relativeTime(createdTs) : '—',
          summary: String(s.description || s.fullStory || '').slice(0, 180),
          exportedAt: new Date().toISOString(),
          _sortTs: createdTs || 0,
        });
      });

      rows.sort((a: any, b: any) => Number(b._sortTs || 0) - Number(a._sortTs || 0));
      return rows.map(({ _sortTs, ...rest }: any) => rest);
    }

    case 'tourist-places': {
      const areaFilter = normalizeText(options?.touristPlaces?.area || 'all');
      const stateFilter = normalizeText(options?.touristPlaces?.state || 'all');
      const countryFilter = normalizeText(options?.touristPlaces?.country || 'all');

      const placesSnap = await getDocs(collection(firestoreDb, 'touristPlaces'));
      const rows: Record<string, unknown>[] = [];

      placesSnap.forEach((doc) => {
        const p: any = doc.data();
        const area = String(p.area || p.region || p.city || '').trim();
        const state = String(p.state || p.province || '').trim();
        const country = String(p.country || 'India').trim();

        if (areaFilter !== 'all' && normalizeText(area) !== areaFilter) return;
        if (stateFilter !== 'all' && normalizeText(state) !== stateFilter) return;
        if (countryFilter !== 'all' && normalizeText(country) !== countryFilter) return;

        const createdTs = p.createdAt?.toDate?.()?.getTime?.()
          ? p.createdAt.toDate().getTime()
          : new Date(p.createdAt || 0).getTime();
        const updatedTs = p.updatedAt?.toDate?.()?.getTime?.()
          ? p.updatedAt.toDate().getTime()
          : new Date(p.updatedAt || 0).getTime();

        // Format media items: type | caption | url | thumbnail
        const mediaList = (Array.isArray(p.media) ? p.media : [])
          .map((m: any) => `[${m.type || 'unknown'}] ${m.caption || '(no caption)'} — ${m.url || ''}`)
          .join(' | ');

        // Format extra info sections: heading — description pairs
        const extraInfoList = (Array.isArray(p.extraInfo) ? p.extraInfo : [])
          .map((e: any) => `${e.heading || 'Section'}: ${e.description || ''}`)
          .join(' | ');

        rows.push({
          placeId: doc.id,
          name: p.name || 'Unnamed Place',
          area,
          state,
          country,
          category: p.category || '—',
          description: String(p.description || ''),
          fullDescription: String(p.description || ''), // Full text, not sliced
          googleMapsUrl: p.googleMapsUrl || '—',
          coverImage: p.coverImage || '—',
          mediaCount: (Array.isArray(p.media) ? p.media.length : 0),
          mediaDetails: mediaList || '(no media)',
          extraInfoSections: extraInfoList || '(no extra info)',
          createdAt: createdTs ? new Date(createdTs).toLocaleString() : '—',
          createdRelative: createdTs ? relativeTime(createdTs) : '—',
          updatedAt: updatedTs ? new Date(updatedTs).toLocaleString() : '—',
          updatedRelative: updatedTs ? relativeTime(updatedTs) : '—',
          exportedAt: new Date().toISOString(),
          _sortTs: createdTs || 0,
        });
      });

      rows.sort((a: any, b: any) => Number(b._sortTs || 0) - Number(a._sortTs || 0));
      return rows.map(({ _sortTs, ...rest }: any) => rest);
    }

    case 'travel-itineraries': {
      const placeFilter = normalizeText(options?.travelItineraries?.place || 'all');
      const countryFilter = normalizeText(options?.travelItineraries?.country || 'all');

      const itinerariesSnap = await getDocs(collection(firestoreDb, 'travel-destinations'));
      const rows: Record<string, unknown>[] = [];

      itinerariesSnap.forEach((doc) => {
        const t: any = doc.data();
        const place = String(t.place || '').trim();
        const country = String(t.country || '').trim();

        if (placeFilter !== 'all' && normalizeText(place) !== placeFilter) return;
        if (countryFilter !== 'all' && normalizeText(country) !== countryFilter) return;

        const createdTs = t.createdAt?.toDate?.()?.getTime?.()
          ? t.createdAt.toDate().getTime()
          : new Date(t.createdAt || 0).getTime();
        const updatedTs = t.updatedAt?.toDate?.()?.getTime?.()
          ? t.updatedAt.toDate().getTime()
          : new Date(t.updatedAt || 0).getTime();

        // Format lists
        const placesList = (Array.isArray(t.places) ? t.places : []).join(' | ') || '(none)';
        const restaurantsList = (Array.isArray(t.restaurants) ? t.restaurants : []).join(' | ') || '(none)';
        const hotelsList = (Array.isArray(t.hotels) ? t.hotels : []).join(' | ') || '(none)';
        const imageUrls = (Array.isArray(t.images) ? t.images : []).join(' | ') || '(none)';
        const videoUrls = (Array.isArray(t.videos) ? t.videos : []).join(' | ') || '(none)';

        rows.push({
          itineraryId: doc.id,
          place,
          country,
          budget: t.budget || '—',
          itinerary: String(t.itinerary || ''),
          fullItinerary: String(t.itinerary || ''),
          placesCount: (Array.isArray(t.places) ? t.places.length : 0),
          places: placesList,
          restaurantsCount: (Array.isArray(t.restaurants) ? t.restaurants.length : 0),
          restaurants: restaurantsList,
          hotelsCount: (Array.isArray(t.hotels) ? t.hotels.length : 0),
          hotels: hotelsList,
          imageCount: (Array.isArray(t.images) ? t.images.length : 0),
          imageUrls,
          videoCount: (Array.isArray(t.videos) ? t.videos.length : 0),
          videoUrls,
          mapUrl: t.map || '—',
          createdAt: createdTs ? new Date(createdTs).toLocaleString() : '—',
          createdRelative: createdTs ? relativeTime(createdTs) : '—',
          updatedAt: updatedTs ? new Date(updatedTs).toLocaleString() : '—',
          updatedRelative: updatedTs ? relativeTime(updatedTs) : '—',
          exportedAt: new Date().toISOString(),
          _sortTs: createdTs || 0,
        });
      });

      rows.sort((a: any, b: any) => Number(b._sortTs || 0) - Number(a._sortTs || 0));
      return rows.map(({ _sortTs, ...rest }: any) => rest);
    }

    case 'reviews-comments': {
      const userFilter = options?.feedback?.userId || 'all';
      const typeFilter = options?.feedback?.type || 'all';
      const placeFilter = options?.feedback?.placeId || 'all';
      const itemFilter = options?.feedback?.itemId || 'all';

      const placesSnap = await getDocs(collection(firestoreDb, 'touristPlaces'));
      const rows: Record<string, unknown>[] = [];

      const parseTs = (value: any): number => {
        if (!value) return 0;
        if (typeof value?.toDate === 'function') return value.toDate().getTime();
        if (typeof value?.seconds === 'number') return value.seconds * 1000;
        if (typeof value === 'number') return value;
        const ms = Date.parse(String(value));
        return Number.isNaN(ms) ? 0 : ms;
      };

      for (const placeDoc of placesSnap.docs) {
        const placeId = placeDoc.id;
        const placeData: any = placeDoc.data();
        const placeName = String(placeData?.name || 'Unknown place');

        if (placeFilter !== 'all' && placeId !== placeFilter) continue;

        const [reviewsSnap, commentsSnap] = await Promise.all([
          getDocs(collection(firestoreDb, 'touristPlaces', placeId, 'reviews')),
          getDocs(collection(firestoreDb, 'touristPlaces', placeId, 'mediaComments')),
        ]);

        if (typeFilter === 'all' || typeFilter === 'review') {
          reviewsSnap.forEach((reviewDoc) => {
            const r: any = reviewDoc.data();
            const userId = String(r.userId || '').trim();
            const itemKey = `review:${placeId}:${reviewDoc.id}`;
            if (userFilter !== 'all' && userId !== userFilter) return;
            if (itemFilter !== 'all' && itemKey !== itemFilter) return;

            const createdTs = parseTs(r.createdAt);
            rows.push({
              feedbackId: reviewDoc.id,
              type: 'review',
              placeId,
              placeName,
              userId: userId || '—',
              author: r.author || '—',
              rating: Number.isFinite(Number(r.rating)) ? Number(r.rating) : '—',
              text: String(r.text || ''),
              mediaCount: Array.isArray(r.media) ? r.media.length : 0,
              createdAt: createdTs ? new Date(createdTs).toLocaleString() : '—',
              createdRelative: createdTs ? relativeTime(createdTs) : '—',
              exportedAt: new Date().toISOString(),
              _sortTs: createdTs || 0,
            });
          });
        }

        if (typeFilter === 'all' || typeFilter === 'comment') {
          commentsSnap.forEach((commentDoc) => {
            const c: any = commentDoc.data();
            const userId = String(c.userId || '').trim();
            const itemKey = `comment:${placeId}:${commentDoc.id}`;
            if (userFilter !== 'all' && userId !== userFilter) return;
            if (itemFilter !== 'all' && itemKey !== itemFilter) return;

            const createdTs = parseTs(c.createdAt);
            rows.push({
              feedbackId: commentDoc.id,
              type: 'comment',
              placeId,
              placeName,
              userId: userId || '—',
              author: c.author || '—',
              rating: '—',
              text: String(c.text || ''),
              mediaCount: 0,
              mediaKey: c.mediaKey || '—',
              createdAt: createdTs ? new Date(createdTs).toLocaleString() : '—',
              createdRelative: createdTs ? relativeTime(createdTs) : '—',
              exportedAt: new Date().toISOString(),
              _sortTs: createdTs || 0,
            });
          });
        }
      }

      rows.sort((a: any, b: any) => Number(b._sortTs || 0) - Number(a._sortTs || 0));
      return rows.map(({ _sortTs, ...rest }: any) => rest);
    }

    case 'subscriptions': {
      const snap = await getDocs(collection(firestoreDb, 'subscriptions'));
      return snap.docs.map(d => {
        const s = d.data();
        return {
          id: d.id,
          userId: s.userId ?? '',
          status: s.status ?? '',
          planType: s.plan?.type ?? s.type ?? '',
          amount: s.plan?.price?.amount ?? '',
          currency: s.plan?.price?.currency ?? 'USD',
          startDate: s.startDate?.toDate?.()?.toISOString() ?? s.startDate ?? '',
          endDate:   s.endDate?.toDate?.()?.toISOString()   ?? s.endDate   ?? '',
        };
      });
    }

    case 'chatrooms': {
      const snap = await get(ref(database, 'chatrooms'));
      const data = snap.val() ?? {};
      return Object.entries(data).map(([id, r]: [string, any]) => ({
        id,
        name: r.name ?? '',
        isPrivate: r.isPrivate ? 'private' : 'public',
        memberCount: r.memberCount ?? Object.keys(r.participants ?? {}).length,
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : '',
      }));
    }

    case 'activity': {
      const activityUserId = options?.activityUserId;
      const parseTs = (value: any): number => {
        if (!value) return 0;
        if (typeof value?.toDate === 'function') return value.toDate().getTime();
        if (typeof value === 'number') return value;
        const ms = new Date(value).getTime();
        return Number.isFinite(ms) ? ms : 0;
      };

      // Build user lookup from already-cached list or full Firestore users collection.
      const usersLookup: Record<string, any> = {};
      const userIdentityMap = new Map<string, string>();
      if (cachedUsers && cachedUsers.length > 0) {
        cachedUsers.forEach((u) => {
          usersLookup[u.id] = u;
          [u.id, u.displayName, u.email, u.username].forEach((v) => {
            const key = String(v || '').trim().toLowerCase();
            if (key) userIdentityMap.set(key, u.id);
          });
        });
      } else {
        const usersSnap = await getDocs(collection(firestoreDb, 'users'));
        usersSnap.forEach((doc) => {
          const u = doc.data();
          const row = {
            id: doc.id,
            displayName: u.displayName ?? '',
            email: u.email ?? '',
            role: u.role ?? 'user',
            avatar: resolveAvatarUrl(u),
            username: u.username ?? '',
            createdAt: u.createdAt?.toDate?.()?.toISOString() ?? u.createdAt ?? '',
          };
          usersLookup[doc.id] = row;
          [row.id, row.displayName, row.email, row.username].forEach((v) => {
            const key = String(v || '').trim().toLowerCase();
            if (key) userIdentityMap.set(key, row.id);
          });
        });
      }

      const normalizeKey = (value: unknown) => String(value || '').trim().toLowerCase();
      const resolveUserId = (...candidates: unknown[]): string | null => {
        for (const c of candidates) {
          const key = normalizeKey(c);
          if (!key) continue;
          const resolved = userIdentityMap.get(key);
          if (resolved) return resolved;
          if (usersLookup[key]) return key;
        }
        return null;
      };

      const activityRows: Array<Record<string, unknown> & { _ts: number; _actorUserId: string; _targetUserId: string }> = [];

      const pushActivity = (payload: Record<string, unknown> & { _ts: number; _actorUserId?: string; _targetUserId?: string }) => {
        activityRows.push({
          ...payload,
          _actorUserId: String(payload._actorUserId || ''),
          _targetUserId: String(payload._targetUserId || ''),
        });
      };

      // Source 1: Registration activity from users collection.
      Object.values(usersLookup).forEach((u: any) => {
        const ts = parseTs(u.createdAt);
        if (!ts) return;
        pushActivity({
          activityType: 'registration',
          source: 'users',
          action: 'User registered',
          details: `Account created with role: ${u.role || 'user'}`,
          userId: u.id,
          userName: u.displayName || u.username || '—',
          email: u.email || '—',
          role: u.role || 'user',
          roomName: '—',
          occurredAt: new Date(ts).toLocaleString(),
          occurredRelative: relativeTime(ts),
          _ts: ts,
          _actorUserId: u.id,
        });
      });

      // Source 2: Chat message activity from all rooms.
      const roomsSnap = await get(ref(database, 'chatrooms'));
      const roomsData = roomsSnap.val() ?? {};
      Object.entries(roomsData).forEach(([, room]: [string, any]) => {
        const roomName = room?.name || 'room';
        const msgs = room?.messages;
        if (!msgs || typeof msgs !== 'object') return;

        Object.values(msgs).forEach((msg: any) => {
          const ts = parseTs(msg?.timestamp);
          if (!ts) return;

          const resolvedUserId = resolveUserId(
            msg?.userId,
            msg?.uid,
            msg?.senderId,
            msg?.username,
            msg?.displayName,
            msg?.email
          );
          const u = resolvedUserId ? usersLookup[resolvedUserId] : null;

          pushActivity({
            activityType: 'chat_message',
            source: 'chatrooms',
            action: `Message sent in ${roomName}`,
            details: String(msg?.text || msg?.content || '(attachment)').slice(0, 120),
            userId: resolvedUserId || String(msg?.userId || '—'),
            userName: u?.displayName || msg?.username || msg?.displayName || '—',
            email: u?.email || msg?.email || '—',
            role: u?.role || 'user',
            roomName,
            occurredAt: new Date(ts).toLocaleString(),
            occurredRelative: relativeTime(ts),
            _ts: ts,
            _actorUserId: resolvedUserId || '',
          });
        });
      });

      // Source 3: Presence status activity.
      const statusSnap = await get(ref(database, 'status'));
      const statusData = statusSnap.val() ?? {};
      Object.entries(statusData).forEach(([uid, s]: [string, any]) => {
        const ts = parseTs(s?.lastSeen);
        if (!ts) return;
        const u = usersLookup[uid] ?? null;
        pushActivity({
          activityType: 'presence',
          source: 'status',
          action: s?.isOnline ? 'User is online' : 'User was active',
          details: s?.isOnline ? 'Online session detected' : 'Recorded from last-seen state',
          userId: uid,
          userName: u?.displayName || s?.username || '—',
          email: u?.email || '—',
          role: u?.role || 'user',
          roomName: '—',
          occurredAt: new Date(ts).toLocaleString(),
          occurredRelative: relativeTime(ts),
          _ts: ts,
          _actorUserId: uid,
        });
      });

      // Source 4: Subscription activity.
      try {
        const subsSnap = await getDocs(collection(firestoreDb, 'subscriptions'));
        subsSnap.forEach((doc) => {
          const s: any = doc.data();
          const userId = resolveUserId(s.userId, s.user, s.uid);
          const u = userId ? usersLookup[userId] : null;
          const status = String(s.status || 'active');

          const createdTs = parseTs(s.createdAt || s.startDate);
          if (createdTs) {
            pushActivity({
              activityType: 'subscription',
              source: 'subscriptions',
              action: `Subscription ${status}`,
              details: `${s.plan?.type || s.type || 'plan'} · ${s.plan?.price?.amount ?? ''} ${s.plan?.price?.currency ?? ''}`.trim(),
              userId: userId || String(s.userId || s.user || '—'),
              userName: u?.displayName || '—',
              email: u?.email || '—',
              role: u?.role || 'user',
              roomName: '—',
              occurredAt: new Date(createdTs).toLocaleString(),
              occurredRelative: relativeTime(createdTs),
              _ts: createdTs,
              _actorUserId: userId || '',
            });
          }

          const updatedTs = parseTs(s.updatedAt);
          if (updatedTs && updatedTs !== createdTs) {
            pushActivity({
              activityType: 'subscription_update',
              source: 'subscriptions',
              action: `Subscription updated (${status})`,
              details: `${s.plan?.type || s.type || 'plan'} status changed`,
              userId: userId || String(s.userId || s.user || '—'),
              userName: u?.displayName || '—',
              email: u?.email || '—',
              role: u?.role || 'user',
              roomName: '—',
              occurredAt: new Date(updatedTs).toLocaleString(),
              occurredRelative: relativeTime(updatedTs),
              _ts: updatedTs,
              _actorUserId: userId || '',
            });
          }
        });
      } catch {
        // Ignore subscriptions source failures.
      }

      // Source 5: Notifications activity (invitations/alerts between users).
      try {
        const notificationsSnap = await getDocs(collection(firestoreDb, 'notifications'));
        notificationsSnap.forEach((doc) => {
          const n: any = doc.data();
          const fromUserId = resolveUserId(n.fromUserId, n.fromUser, n.fromEmail);
          const toUserId = resolveUserId(n.toUserId, n.toUser, n.toEmail);
          const fromUser = fromUserId ? usersLookup[fromUserId] : null;
          const toUser = toUserId ? usersLookup[toUserId] : null;
          const ts = parseTs(n.createdAt || n.updatedAt);
          if (!ts) return;

          pushActivity({
            activityType: 'notification',
            source: 'notifications',
            action: `Notification ${n.type || 'event'} (${n.status || 'pending'})`,
            details: n.message || 'Notification activity',
            userId: fromUserId || toUserId || '—',
            userName: fromUser?.displayName || toUser?.displayName || '—',
            email: fromUser?.email || toUser?.email || '—',
            role: fromUser?.role || toUser?.role || 'user',
            roomName: n.roomName || '—',
            occurredAt: new Date(ts).toLocaleString(),
            occurredRelative: relativeTime(ts),
            _ts: ts,
            _actorUserId: fromUserId || '',
            _targetUserId: toUserId || '',
          });
        });
      } catch {
        // Ignore notifications source failures.
      }

      // Source 6: Trip stories activity.
      try {
        const storiesSnap = await getDocs(collection(firestoreDb, 'stories'));
        storiesSnap.forEach((doc) => {
          const st: any = doc.data();
          const userId = resolveUserId(st.userId, st.authorId, st.createdBy, st.uid, st.username, st.email);
          const u = userId ? usersLookup[userId] : null;
          const ts = parseTs(st.createdAt || st.updatedAt);
          if (!ts) return;

          pushActivity({
            activityType: 'story',
            source: 'stories',
            action: 'Trip story published',
            details: st.title || st.storyTitle || 'Untitled story',
            userId: userId || '—',
            userName: u?.displayName || st.username || '—',
            email: u?.email || st.email || '—',
            role: u?.role || 'user',
            roomName: '—',
            occurredAt: new Date(ts).toLocaleString(),
            occurredRelative: relativeTime(ts),
            _ts: ts,
            _actorUserId: userId || '',
          });
        });
      } catch {
        // Ignore stories source failures.
      }

      // Source 7: Travel partner requests activity.
      try {
        const partnerReqSnap = await getDocs(collection(firestoreDb, 'travelPartnerRequests'));
        partnerReqSnap.forEach((doc) => {
          const req: any = doc.data();
          const userId = resolveUserId(req.userId, req.createdBy, req.ownerId, req.uid, req.email);
          const u = userId ? usersLookup[userId] : null;
          const createdTs = parseTs(req.createdAt);
          const updatedTs = parseTs(req.updatedAt);

          if (createdTs) {
            pushActivity({
              activityType: 'travel_partner_request',
              source: 'travelPartnerRequests',
              action: 'Travel partner request created',
              details: req.title || req.destination || req.status || 'New request',
              userId: userId || '—',
              userName: u?.displayName || '—',
              email: u?.email || req.email || '—',
              role: u?.role || 'user',
              roomName: '—',
              occurredAt: new Date(createdTs).toLocaleString(),
              occurredRelative: relativeTime(createdTs),
              _ts: createdTs,
              _actorUserId: userId || '',
            });
          }

          if (updatedTs && updatedTs !== createdTs) {
            pushActivity({
              activityType: 'travel_partner_request_update',
              source: 'travelPartnerRequests',
              action: `Travel partner request updated (${req.status || 'active'})`,
              details: req.title || req.destination || 'Request updated',
              userId: userId || '—',
              userName: u?.displayName || '—',
              email: u?.email || req.email || '—',
              role: u?.role || 'user',
              roomName: '—',
              occurredAt: new Date(updatedTs).toLocaleString(),
              occurredRelative: relativeTime(updatedTs),
              _ts: updatedTs,
              _actorUserId: userId || '',
            });
          }
        });
      } catch {
        // Ignore travel partner requests source failures.
      }

      activityRows.sort((a, b) => b._ts - a._ts);

      const filteredRows = activityUserId && activityUserId !== 'all'
        ? activityRows.filter((row) => row._actorUserId === activityUserId || row._targetUserId === activityUserId)
        : activityRows;

      return filteredRows.map(({ _ts, _actorUserId, _targetUserId, ...rest }) => rest);
    }

    case 'pageviews': {
      const snap = await get(ref(database, 'analytics/pageViews'));
      return [{ metric: 'pageViews', value: snap.val() ?? 0, exportedAt: new Date().toISOString() }];
    }

    default:
      return [];
  }
}

// ── Activity dedicated PDF ──────────────────────────────────────────────────
function printActivityPdf(rows: Record<string, unknown>[]) {
  const logoUrl = `${window.location.origin}/logo.jpg`;
  const genDate = new Date().toLocaleString();
  const total   = rows.length;
  const uniqueUsers = new Set(rows.map((r) => String(r.userId || ''))).size;
  const messageCount = rows.filter((r) => r.activityType === 'chat_message').length;
  const registrationCount = rows.filter((r) => r.activityType === 'registration').length;
  const presenceCount = rows.filter((r) => r.activityType === 'presence').length;

  const tableRows = rows.map((r, i) => {
    const type = String(r.activityType || 'activity');
    const typeColor =
      type === 'chat_message' ? '#0369a1' :
      type === 'registration' ? '#166534' : '#7c2d12';
    return `
    <tr>
      <td style="text-align:center;color:#9ca3af;font-size:10px">${i + 1}</td>
      <td><span style="color:${typeColor};font-weight:700;text-transform:uppercase">${type}</span></td>
      <td style="font-weight:600;color:#111827">${r.userName ?? '—'}</td>
      <td style="color:#2563eb">${r.email ?? '—'}</td>
      <td style="font-size:10px;word-break:break-all;color:#6b7280">${r.userId ?? '—'}</td>
      <td style="white-space:nowrap;font-size:10px;color:#374151">${r.roomName ?? '—'}</td>
      <td style="white-space:nowrap;font-size:10px;color:#374151">${r.occurredAt ?? '—'}</td>
      <td style="white-space:nowrap;font-size:10px;color:#6b7280">${r.occurredRelative ?? '—'}</td>
      <td style="max-width:280px;word-break:break-word">${r.details ?? '—'}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>User Activity Report</title>
<style>
  * { box-sizing:border-box;margin:0;padding:0; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:11px;color:#111827;
    padding:28px 32px 32px;background:#fff;position:relative; }
  body::before { content:'ABjee Travel';position:fixed;top:50%;left:50%;
    transform:translate(-50%,-50%) rotate(-38deg);font-size:90px;font-weight:900;
    color:rgba(220,38,38,.04);letter-spacing:-.02em;white-space:nowrap;pointer-events:none;z-index:0; }

  .brand-header { display:flex;align-items:center;justify-content:space-between;
    background:linear-gradient(135deg,#0f172a 0%,#1e3a8a 55%,#4c1d95 100%);
    color:#fff;padding:18px 24px;border-radius:12px 12px 0 0;position:relative;overflow:hidden; }
  .brand-header::before { content:'';position:absolute;left:-30px;top:-30px;width:160px;height:160px;
    background:radial-gradient(circle,rgba(255,255,255,.09) 0%,transparent 65%);pointer-events:none;z-index:0; }
  .brand-header::after { content:'';position:absolute;right:-40px;top:-40px;width:210px;height:210px;
    background:radial-gradient(circle,rgba(255,255,255,.11) 0%,transparent 70%);pointer-events:none; }
  .brand-left  { display:flex;align-items:center;gap:18px; }
  .brand-logo  { height:72px;width:72px;border-radius:14px;object-fit:cover;
    border:3px solid rgba(255,255,255,.5);flex-shrink:0;
    box-shadow:0 0 0 1px rgba(255,255,255,.15),0 6px 24px rgba(0,0,0,.5); }
  .brand-name  { font-size:30px;font-weight:900;letter-spacing:-.01em;
    background:linear-gradient(90deg,#ffffff 15%,#fca5a5 60%,#f87171 100%);
    -webkit-background-clip:text;-webkit-text-fill-color:transparent;line-height:1.1; }
  .brand-tagline { display:block;font-size:10.5px;opacity:.78;margin-top:4px;letter-spacing:.07em;font-style:italic; }
  .brand-right { text-align:right;flex-shrink:0; }
  .report-label { display:block;font-size:9px;text-transform:uppercase;letter-spacing:.12em;opacity:.6;margin-bottom:3px; }
  .report-title { display:block;font-size:13px;font-weight:700;opacity:.95; }
  .report-date  { display:block;font-size:9px;opacity:.55;margin-top:2px; }
  .brand-divider { height:6px;background:linear-gradient(90deg,#ef4444,#f97316,#eab308,#22c55e,#3b82f6);
    border-radius:0 0 4px 4px;margin-bottom:24px; }

  .stats-bar { display:grid;grid-template-columns:repeat(4,1fr);
    border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:22px; }
  .stat-item { padding:10px 14px;text-align:center;border-right:1px solid #f3f4f6; }
  .stat-item:last-child { border-right:none; }
  .stat-value { font-size:20px;font-weight:800;color:#1e3a8a;line-height:1; }
  .stat-label { font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:#9ca3af;margin-top:3px; }
  .stat-value.green { color:#15803d; }
  .stat-value.gray  { color:#6b7280; }

  .section { margin-bottom:22px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;position:relative;z-index:1; }
  .section-title { background:linear-gradient(90deg,#fef2f2,#fff1f2);padding:9px 16px;font-size:11px;font-weight:700;
    text-transform:uppercase;letter-spacing:.08em;color:#991b1b;border-bottom:1px solid #fecaca;
    display:flex;align-items:center;gap:8px; }
  .section-title::before { content:'';display:inline-block;width:3px;height:14px;
    background:linear-gradient(180deg,#ef4444,#dc2626);border-radius:2px; }

  table { width:100%;border-collapse:collapse; }
  th { background:linear-gradient(90deg,#fef2f2,#fff5f5);text-align:left;padding:7px 12px;font-size:9.5px;
    font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#991b1b;border-bottom:1px solid #fecaca; }
  td { padding:6px 12px;border-bottom:1px solid #fafafa;font-size:11px;color:#374151;vertical-align:middle; }
  tr:last-child td { border-bottom:none; }
  tr:nth-child(even) td { background:#fffafa; }

  .brand-footer { display:flex;align-items:center;justify-content:space-between;
    margin-top:30px;padding:14px 22px;border-radius:12px;
    background:linear-gradient(135deg,#fef2f2,#fff5f5);border:1px solid #fecaca;
    box-shadow:0 1px 6px rgba(220,38,38,.08); }
  .footer-left  { display:flex;align-items:center;gap:13px; }
  .footer-logo  { height:40px;width:40px;border-radius:9px;object-fit:cover;border:2px solid rgba(220,38,38,.25); }
  .footer-brand { font-size:15px;font-weight:900;color:#991b1b;letter-spacing:-.01em; }
  .footer-sub   { font-size:9px;color:#6b7280;margin-top:2px; }
  .footer-right { text-align:right;color:#9ca3af;font-size:8.5px;line-height:1.6; }

  @media print {
    body { padding:16px; }
    .brand-header,.brand-divider,.stats-bar,.section-title,th,.brand-footer
      { -webkit-print-color-adjust:exact;print-color-adjust:exact; }
  }
</style>
</head>
<body>

  <div class="brand-header">
    <div class="brand-left">
      <img src="${logoUrl}" alt="ABjee" class="brand-logo" onerror="this.style.display='none'" />
      <div>
        <div class="brand-name">ABjee Travel</div>
        <span class="brand-tagline">Connecting Travelers &middot; Exploring the World</span>
      </div>
    </div>
    <div class="brand-right">
      <span class="report-label">Admin Report</span>
      <span class="report-title">User Activity</span>
      <span class="report-date">${genDate}</span>
    </div>
  </div>
  <div class="brand-divider"></div>

  <div class="stats-bar">
    <div class="stat-item"><div class="stat-value">${total}</div><div class="stat-label">Total Activities</div></div>
    <div class="stat-item"><div class="stat-value green">${messageCount}</div><div class="stat-label">Messages</div></div>
    <div class="stat-item"><div class="stat-value gray">${registrationCount + presenceCount}</div><div class="stat-label">User/Presence Events</div></div>
    <div class="stat-item"><div class="stat-value" style="font-size:12px;color:#6b7280">${genDate.split(',')[0]}</div><div class="stat-label">Snapshot Date</div></div>
  </div>

  <p style="margin:-10px 0 14px;color:#6b7280;font-size:10px">Unique users in report: ${uniqueUsers}</p>

  <div class="section">
    <div class="section-title">Activity Timeline (${total} events &mdash; newest first)</div>
    <table>
      <thead><tr>
        <th style="width:28px">#</th>
        <th style="width:110px">Type</th>
        <th>Name</th>
        <th>Email</th>
        <th>UID</th>
        <th style="width:120px">Room</th>
        <th style="width:130px">Occurred At</th>
        <th style="width:80px">How Long Ago</th>
        <th>Details</th>
      </tr></thead>
      <tbody>${tableRows || '<tr><td colspan="9" style="text-align:center;color:#9ca3af">No activity data found</td></tr>'}</tbody>
    </table>
  </div>

  <div class="brand-footer">
    <div class="footer-left">
      <img src="${logoUrl}" alt="ABjee" class="footer-logo" onerror="this.style.display='none'" />
      <div>
        <div class="footer-brand">ABjee Travel</div>
        <div class="footer-sub">Connecting Travelers &middot; Exploring the World</div>
      </div>
    </div>
    <div class="footer-right">
      <div>Admin Report &mdash; User Activity</div>
      <div>${total} events &nbsp;&middot;&nbsp; ${uniqueUsers} users</div>
      <div>Generated: ${genDate}</div>
    </div>
  </div>

</body></html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('Please allow popups to export PDF.'); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 600);
}

// ── Bulk PDF via browser print ───────────────────────────────────────────────
function printAsPdf(sections: string[], allData: Record<string, Record<string, unknown>[]>, _stats: ExportDialogProps['stats']) {
  const sectionHtml = sections.map(id => {
    const rows = allData[id] ?? [];
    if (!rows.length) return '';
    const headers = Object.keys(rows[0]);
    const sec = SECTIONS.find(s => s.id === id);
    return `
      <div class="section">
        <div class="section-heading">${sec?.label ?? id}</div>
        <table>
          <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${rows.map(r => `<tr>${headers.map(h => `<td>${r[h] ?? ''}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<title>ABjee Travel — Dashboard Export</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 11px; color: #111; padding: 24px; }
  h1 { font-size: 20px; margin-bottom: 4px; color: #1d4ed8; }
  .meta { color: #6b7280; margin-bottom: 24px; font-size: 10px; }
  .section { margin-bottom: 28px; page-break-inside: avoid; }
  h2 { font-size: 14px; font-weight: 600; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 2px solid #e5e7eb; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f3f4f6; text-align: left; padding: 6px 8px; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; border: 1px solid #e5e7eb; }
  td { padding: 5px 8px; border: 1px solid #e5e7eb; vertical-align: top; }
  tr:nth-child(even) td { background: #f9fafb; }
  @media print { body { padding: 12px; } }
</style>
</head>
<body>
  <h1>ABjee Travel — Dashboard Export</h1>
  <p class="meta">Generated: ${new Date().toLocaleString()} &nbsp;|&nbsp; Sections: ${sections.map(id => SECTIONS.find(s => s.id === id)?.label).join(', ')}</p>
  ${sectionHtml}
</body>
</html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('Please allow popups to export PDF.'); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 500);
}

// ── Component ────────────────────────────────────────────────────────────────
export const ExportDialog = memo(({ open, onOpenChange, stats }: ExportDialogProps) => {
  const [selected, setSelected]             = useState<Set<string>>(new Set(['stats', 'users']));
  const [exporting, setExporting]           = useState<'csv' | 'pdf' | null>(null);
  const [done, setDone]                     = useState<'csv' | 'pdf' | null>(null);
  const doneTimerRef                        = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Online Status live count state
  const [onlineCount, setOnlineCount]         = useState<number | null>(null);
  const [onlineCountErr, setOnlineCountErr]   = useState(false);
  const [onlineCountLoading, setOnlineCountLoading] = useState(false);

  // User dropdown state
  const [usersList, setUsersList]           = useState<UserRecord[]>([]);
  const [usersLoading, setUsersLoading]     = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>('all');
  const [selectedActivityUserId, setSelectedActivityUserId] = useState<string>('all');

  // Room dropdown state
  const [roomsList, setRoomsList]           = useState<RoomRecord[]>([]);
  const [roomsLoading, setRoomsLoading]     = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string>('all');

  // Trip stories export filters
  const [tripStoriesList, setTripStoriesList] = useState<TripStoryRecord[]>([]);
  const [tripStoriesLoading, setTripStoriesLoading] = useState(false);
  const [selectedTripStoryUserId, setSelectedTripStoryUserId] = useState<string>('all');
  const [selectedTripStoryArea, setSelectedTripStoryArea] = useState<string>('all');
  const [selectedTripStoryState, setSelectedTripStoryState] = useState<string>('all');
  const [selectedTripStoryCountry, setSelectedTripStoryCountry] = useState<string>('all');

  // Tourist places export filters
  const [touristPlacesList, setTouristPlacesList] = useState<TouristPlaceRecord[]>([]);
  const [touristPlacesLoading, setTouristPlacesLoading] = useState(false);
  const [selectedTouristPlaceArea, setSelectedTouristPlaceArea] = useState<string>('all');
  const [selectedTouristPlaceState, setSelectedTouristPlaceState] = useState<string>('all');
  const [selectedTouristPlaceCountry, setSelectedTouristPlaceCountry] = useState<string>('all');

  // Travel itineraries export filters
  const [travelItinerariesList, setTravelItinerariesList] = useState<TravelItineraryRecord[]>([]);
  const [travelItinerariesLoading, setTravelItinerariesLoading] = useState(false);
  const [selectedTravelPlace, setSelectedTravelPlace] = useState<string>('all');
  const [selectedTravelCountry, setSelectedTravelCountry] = useState<string>('all');

  // Reviews & comments export filters
  const [feedbackList, setFeedbackList] = useState<FeedbackRecord[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [selectedFeedbackUserId, setSelectedFeedbackUserId] = useState<string>('all');
  const [selectedFeedbackType, setSelectedFeedbackType] = useState<'all' | 'review' | 'comment'>('all');
  const [selectedFeedbackPlaceId, setSelectedFeedbackPlaceId] = useState<string>('all');
  const [selectedFeedbackItemId, setSelectedFeedbackItemId] = useState<string>('all');

  // Clear done-timer on unmount to prevent state updates on unmounted component
  useEffect(() => () => { if (doneTimerRef.current) clearTimeout(doneTimerRef.current); }, []);

  const usersChecked    = selected.has('users');
  const roomsChecked    = selected.has('chatrooms');
  const activityChecked = selected.has('activity');
  const tripStoriesChecked = selected.has('trip-stories');
  const touristPlacesChecked = selected.has('tourist-places');
  const travelItinerariesChecked = selected.has('travel-itineraries');
  const feedbackChecked = selected.has('reviews-comments');

  // Load users when user-dependent section is first checked
  useEffect(() => {
    if ((!usersChecked && !activityChecked && !tripStoriesChecked && !feedbackChecked) || usersList.length > 0 || usersLoading) return;
    setUsersLoading(true);
    getDocs(collection(firestoreDb, 'users'))
      .then(snap => {
        setUsersList(snap.docs.map(d => {
          const u = d.data();
          return {
            id: d.id,
            displayName: u.displayName ?? '',
            email: u.email ?? '',
            role: u.role ?? 'user',
            avatar: resolveAvatarUrl(u),
            isActive: u.isActive !== false,
            city: u.city ?? '',
            phoneNumber: u.phoneNumber ?? '',
            createdAt: u.createdAt?.toDate?.()?.toISOString() ?? u.createdAt ?? '',
            username: u.username ?? '',
          } as UserRecord;
        }));
      })
      .catch(() => {})
      .finally(() => setUsersLoading(false));
  }, [usersChecked, activityChecked, tripStoriesChecked, feedbackChecked]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset user selection when users section is unchecked
  useEffect(() => {
    if (!usersChecked) setSelectedUserId('all');
  }, [usersChecked]);

  // Reset activity user selection when activity section is unchecked
  useEffect(() => {
    if (!activityChecked) setSelectedActivityUserId('all');
  }, [activityChecked]);

  useEffect(() => {
    if (!tripStoriesChecked) {
      setSelectedTripStoryUserId('all');
      setSelectedTripStoryArea('all');
      setSelectedTripStoryState('all');
      setSelectedTripStoryCountry('all');
    }
  }, [tripStoriesChecked]);

  // Reset tourist places filters when section is unchecked
  useEffect(() => {
    if (!touristPlacesChecked) {
      setSelectedTouristPlaceArea('all');
      setSelectedTouristPlaceState('all');
      setSelectedTouristPlaceCountry('all');
    }
  }, [touristPlacesChecked]);

  // Reset travel itineraries filters when section is unchecked
  useEffect(() => {
    if (!travelItinerariesChecked) {
      setSelectedTravelPlace('all');
      setSelectedTravelCountry('all');
    }
  }, [travelItinerariesChecked]);

  // Reset feedback filters when section is unchecked
  useEffect(() => {
    if (!feedbackChecked) {
      setSelectedFeedbackUserId('all');
      setSelectedFeedbackType('all');
      setSelectedFeedbackPlaceId('all');
      setSelectedFeedbackItemId('all');
    }
  }, [feedbackChecked]);

  useEffect(() => {
    setSelectedFeedbackItemId('all');
  }, [selectedFeedbackType, selectedFeedbackPlaceId]);

  useEffect(() => {
    if (!tripStoriesChecked || tripStoriesLoading || tripStoriesList.length > 0) return;

    setTripStoriesLoading(true);
    getDocs(collection(firestoreDb, 'stories'))
      .then((snap) => {
        const stories = snap.docs.map((doc) => {
          const s: any = doc.data();
          const geo = deriveStoryGeo(s);
          return {
            id: doc.id,
            title: s.title || 'Untitled Story',
            destination: s.destination || '',
            authorId: s.authorId || '',
            authorName: s.authorName || '',
            authorEmail: s.authorEmail || '',
            travelType: s.travelType || '',
            duration: s.duration || '',
            budget: s.budget || '',
            area: geo.area,
            state: geo.state,
            country: geo.country,
            likesCount: Array.isArray(s.likes) ? s.likes.length : 0,
            commentCount: Number(s.commentCount || 0),
            mediaCount: (Array.isArray(s.photos) ? s.photos.length : 0) + (Array.isArray(s.videos) ? s.videos.length : 0),
            createdAt: s.createdAt?.toDate?.()?.toISOString?.() || s.createdAt || '',
          } as TripStoryRecord;
        });
        setTripStoriesList(stories);
      })
      .catch(() => {
        setTripStoriesList([]);
      })
      .finally(() => setTripStoriesLoading(false));
  }, [tripStoriesChecked, tripStoriesLoading, tripStoriesList.length]);

  // Load tourist places when section is first checked
  useEffect(() => {
    if (!touristPlacesChecked || touristPlacesLoading || touristPlacesList.length > 0) return;

    setTouristPlacesLoading(true);
    getDocs(collection(firestoreDb, 'touristPlaces'))
      .then((snap) => {
        const places = snap.docs.map((doc) => {
          const p: any = doc.data();
          return {
            id: doc.id,
            name: p.name || 'Unnamed Place',
            area: String(p.area || p.region || p.city || '').trim(),
            state: String(p.state || p.province || '').trim(),
            country: String(p.country || 'India').trim(),
            description: p.description || '',
            category: p.category || 'Other',
            googleMapsUrl: p.googleMapsUrl || '',
            coverImage: p.coverImage || '',
            mediaCount: (Array.isArray(p.media) ? p.media.length : 0),
            createdAt: p.createdAt?.toDate?.()?.toISOString?.() || p.createdAt || '',
            updatedAt: p.updatedAt?.toDate?.()?.toISOString?.() || p.updatedAt || '',
          } as TouristPlaceRecord;
        });
        setTouristPlacesList(places);
      })
      .catch(() => {
        setTouristPlacesList([]);
      })
      .finally(() => setTouristPlacesLoading(false));
  }, [touristPlacesChecked, touristPlacesLoading, touristPlacesList.length]);

  // Load travel itineraries when section is first checked
  useEffect(() => {
    if (!travelItinerariesChecked || travelItinerariesLoading || travelItinerariesList.length > 0) return;

    setTravelItinerariesLoading(true);
    getDocs(collection(firestoreDb, 'travel-destinations'))
      .then((snap) => {
        const itineraries = snap.docs.map((doc) => {
          const t: any = doc.data();
          return {
            id: doc.id,
            place: t.place || 'Unnamed Place',
            country: t.country || 'India',
            itinerary: t.itinerary || '',
            placesCount: (Array.isArray(t.places) ? t.places.length : 0),
            restaurantsCount: (Array.isArray(t.restaurants) ? t.restaurants.length : 0),
            hotelsCount: (Array.isArray(t.hotels) ? t.hotels.length : 0),
            imageCount: (Array.isArray(t.images) ? t.images.length : 0),
            videoCount: (Array.isArray(t.videos) ? t.videos.length : 0),
            budget: t.budget || '',
            createdAt: t.createdAt?.toDate?.()?.toISOString?.() || t.createdAt || '',
            updatedAt: t.updatedAt?.toDate?.()?.toISOString?.() || t.updatedAt || '',
          } as TravelItineraryRecord;
        });
        setTravelItinerariesList(itineraries);
      })
      .catch(() => {
        setTravelItinerariesList([]);
      })
      .finally(() => setTravelItinerariesLoading(false));
  }, [travelItinerariesChecked, travelItinerariesLoading, travelItinerariesList.length]);

  // Load reviews and comments when section is first checked
  useEffect(() => {
    if (!feedbackChecked || feedbackLoading || feedbackList.length > 0) return;

    setFeedbackLoading(true);
    getDocs(collection(firestoreDb, 'touristPlaces'))
      .then(async (placesSnap) => {
        const parseTs = (value: any): number => {
          if (!value) return 0;
          if (typeof value?.toDate === 'function') return value.toDate().getTime();
          if (typeof value?.seconds === 'number') return value.seconds * 1000;
          if (typeof value === 'number') return value;
          const ms = Date.parse(String(value));
          return Number.isNaN(ms) ? 0 : ms;
        };

        const allRows: FeedbackRecord[] = [];
        for (const placeDoc of placesSnap.docs) {
          const placeId = placeDoc.id;
          const placeData: any = placeDoc.data();
          const placeName = String(placeData?.name || 'Unknown place');

          const [reviewsSnap, commentsSnap] = await Promise.all([
            getDocs(collection(firestoreDb, 'touristPlaces', placeId, 'reviews')),
            getDocs(collection(firestoreDb, 'touristPlaces', placeId, 'mediaComments')),
          ]);

          reviewsSnap.forEach((reviewDoc) => {
            const r: any = reviewDoc.data();
            allRows.push({
              id: reviewDoc.id,
              type: 'review',
              placeId,
              placeName,
              userId: String(r.userId || '').trim(),
              author: String(r.author || ''),
              text: String(r.text || ''),
              rating: Number.isFinite(Number(r.rating)) ? Number(r.rating) : null,
              mediaCount: Array.isArray(r.media) ? r.media.length : 0,
              createdAt: String(r.createdAt || parseTs(r.createdAt) || ''),
            });
          });

          commentsSnap.forEach((commentDoc) => {
            const c: any = commentDoc.data();
            allRows.push({
              id: commentDoc.id,
              type: 'comment',
              placeId,
              placeName,
              userId: String(c.userId || '').trim(),
              author: String(c.author || ''),
              text: String(c.text || ''),
              rating: null,
              mediaCount: 0,
              createdAt: String(c.createdAt || parseTs(c.createdAt) || ''),
            });
          });
        }

        setFeedbackList(allRows);
      })
      .catch(() => {
        setFeedbackList([]);
      })
      .finally(() => setFeedbackLoading(false));
  }, [feedbackChecked, feedbackLoading, feedbackList.length]);

  // Load rooms when chatrooms section is first checked
  useEffect(() => {
    if (!roomsChecked || roomsList.length > 0 || roomsLoading) return;
    setRoomsLoading(true);
    get(ref(database, 'chatrooms'))
      .then(snap => {
        const data = snap.val() ?? {};
        setRoomsList(Object.entries(data).map(([id, r]: [string, any]) => ({
          id,
          name:        r.name        ?? id,
          isPrivate:   !!r.isPrivate,
          memberCount: r.memberCount ?? (Array.isArray(r.participants) ? r.participants.length : Object.keys(r.participants ?? {}).length),
          createdAt:   r.createdAt   ? new Date(r.createdAt).toISOString() : '',
          description: r.description ?? '',
          createdBy:   r.createdBy   ?? '',
        } as RoomRecord)));
      })
      .catch(() => {})
      .finally(() => setRoomsLoading(false));
  }, [roomsChecked]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset room selection when chatrooms section is unchecked
  useEffect(() => {
    if (!roomsChecked) setSelectedRoomId('all');
  }, [roomsChecked]);

  // Live online-count fetch when Online Status section is checked
  const fetchOnlineCount = useCallback(() => {
    setOnlineCountLoading(true);
    setOnlineCountErr(false);
    get(ref(database, 'status'))
      .then(snap => {
        const data = snap.val() ?? {};
        setOnlineCount(
          Object.values(data).filter((s: any) => s?.isOnline === true).length
        );
      })
      .catch(() => setOnlineCountErr(true))
      .finally(() => setOnlineCountLoading(false));
  }, []);

  useEffect(() => {
    if (!activityChecked) { setOnlineCount(null); setOnlineCountErr(false); return; }
    fetchOnlineCount();
  }, [activityChecked, fetchOnlineCount]);

  const toggle = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => setSelected(new Set(SECTIONS.map(s => s.id))), []);
  const clearAll  = useCallback(() => setSelected(new Set()), []);

  // Memoize derived state to avoid recomputing on every render
  const isSingleUser   = useMemo(() => usersChecked    && selectedUserId !== 'all', [usersChecked, selectedUserId]);
  const selectedUser   = useMemo(() => usersList.find(u => u.id === selectedUserId), [usersList, selectedUserId]);
  const isActivityUserScoped = useMemo(
    () => activityChecked && selectedActivityUserId !== 'all',
    [activityChecked, selectedActivityUserId]
  );
  const selectedActivityUser = useMemo(
    () => usersList.find(u => u.id === selectedActivityUserId),
    [usersList, selectedActivityUserId]
  );
  const isSingleRoom   = useMemo(() => roomsChecked    && selectedRoomId !== 'all', [roomsChecked, selectedRoomId]);
  const selectedRoom   = useMemo(() => roomsList.find(r => r.id === selectedRoomId), [roomsList, selectedRoomId]);
  const isActivityOnly = useMemo(() => activityChecked && selected.size === 1, [activityChecked, selected]);

  const tripStoryAreas = useMemo(
    () => Array.from(new Set(tripStoriesList.map((s) => s.area).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [tripStoriesList]
  );
  const tripStoryStates = useMemo(
    () => Array.from(new Set(tripStoriesList.map((s) => s.state).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [tripStoriesList]
  );
  const tripStoryCountries = useMemo(
    () => Array.from(new Set(tripStoriesList.map((s) => s.country).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [tripStoriesList]
  );

  const touristPlaceAreas = useMemo(
    () => Array.from(new Set(touristPlacesList.map((p) => p.area).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [touristPlacesList]
  );
  const touristPlaceStates = useMemo(
    () => Array.from(new Set(touristPlacesList.map((p) => p.state).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [touristPlacesList]
  );
  const touristPlaceCountries = useMemo(
    () => Array.from(new Set(touristPlacesList.map((p) => p.country).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [touristPlacesList]
  );

  const travelPlaces = useMemo(
    () => Array.from(new Set(travelItinerariesList.map((t) => t.place).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [travelItinerariesList]
  );
  const travelCountries = useMemo(
    () => Array.from(new Set(travelItinerariesList.map((t) => t.country).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [travelItinerariesList]
  );

  const feedbackPlaces = useMemo(
    () => Array.from(new Set(feedbackList.map((f) => `${f.placeId}::${f.placeName}`))).sort((a, b) => a.localeCompare(b)),
    [feedbackList]
  );
  const feedbackItemOptions = useMemo(() => {
    return feedbackList
      .filter((item) => selectedFeedbackType === 'all' || item.type === selectedFeedbackType)
      .filter((item) => selectedFeedbackPlaceId === 'all' || item.placeId === selectedFeedbackPlaceId)
      .slice(0, 300);
  }, [feedbackList, selectedFeedbackType, selectedFeedbackPlaceId]);

  const handleExport = useCallback(async (format: 'csv' | 'pdf') => {
    if (!selected.size) return;
    setExporting(format);
    setDone(null);

    try {
      // ── Single-user detailed PDF ──────────────────────────────────────────
      const scheduleDone = (f: 'csv' | 'pdf') => {
        setDone(f);
        if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
        doneTimerRef.current = setTimeout(() => setDone(null), 3000);
      };

      if (isSingleUser && format === 'pdf') {
        const data = await fetchUserProfile(selectedUserId);
        printUserProfilePdf(data);
        scheduleDone('pdf');
        return;
      }

      // ── Single-user CSV (profile + subs + messages) ───────────────────────
      if (isSingleUser && format === 'csv') {
        const data = await fetchUserProfile(selectedUserId);
        const { profile, subscriptions, messages, status } = data;
        const uName = profile.displayName || profile.email || selectedUserId;

        downloadBlob(toCsv([{
          id: profile.id, displayName: profile.displayName, email: profile.email,
          role: profile.role, city: profile.city, phoneNumber: profile.phoneNumber,
          isActive: profile.isActive !== false ? 'active' : 'inactive',
          createdAt: profile.createdAt?.toDate?.()?.toISOString() ?? profile.createdAt ?? '',
          isOnline: status?.isOnline ? 'online' : 'offline',
          lastSeen: status?.lastSeen ? new Date(status.lastSeen).toISOString() : '',
        }]), `abjee-user-profile-${uName}-${dateStr()}.csv`, 'text/csv');

        if (subscriptions.length) {
          downloadBlob(toCsv(subscriptions.map(s => ({
            id: s.id, status: s.status, planType: s.plan?.type ?? s.type,
            amount: s.plan?.price?.amount, currency: s.plan?.price?.currency ?? 'USD',
            startDate: s.startDate?.toDate?.()?.toISOString() ?? s.startDate,
            endDate:   s.endDate?.toDate?.()?.toISOString()   ?? s.endDate,
          }))), `abjee-user-subs-${uName}-${dateStr()}.csv`, 'text/csv');
        }
        if (messages.length) {
          downloadBlob(toCsv(messages as any), `abjee-user-messages-${uName}-${dateStr()}.csv`, 'text/csv');
        }
        scheduleDone('csv');
        return;
      }

      // ── Single-room PDF ────────────────────────────────────────────────────
      if (isSingleRoom && format === 'pdf') {
        const data = await fetchRoomDetail(selectedRoomId);
        printRoomPdf(data);
        scheduleDone('pdf');
        return;
      }

      // ── Single-room CSV (info + participants + full transcript) ────────────
      if (isSingleRoom && format === 'csv') {
        const data = await fetchRoomDetail(selectedRoomId);
        const rName = data.info.name.replace(/[^a-z0-9]/gi, '-').toLowerCase();
        downloadBlob(toCsv([data.info as any]), `abjee-room-info-${rName}-${dateStr()}.csv`, 'text/csv');
        if (data.participants.length)
          downloadBlob(toCsv(data.participants as any), `abjee-room-participants-${rName}-${dateStr()}.csv`, 'text/csv');
        if (data.messages.length)
          downloadBlob(toCsv(data.messages as any), `abjee-room-messages-${rName}-${dateStr()}.csv`, 'text/csv');
        scheduleDone('csv');
        return;
      }

      // ── Activity-only dedicated PDF ───────────────────────────────────────
      if (isActivityOnly && format === 'pdf') {
        const cachedUsers = usersList.length > 0 ? usersList : undefined;
        const rows = await fetchSectionData('activity', stats, cachedUsers, {
          activityUserId: selectedActivityUserId,
        });
        printActivityPdf(rows);
        scheduleDone('pdf');
        return;
      }

      // ── Bulk export (all sections) ────────────────────────────────────────
      const ids = [...selected];
      // Pass the already-loaded users list to avoid a redundant Firestore read
      const cachedUsers = usersList.length > 0 ? usersList : undefined;
      const results = await Promise.allSettled(
        ids.map(id =>
          fetchSectionData(
            id,
            stats,
            cachedUsers,
            id === 'activity'
              ? { activityUserId: selectedActivityUserId }
              : id === 'trip-stories'
              ? {
                  tripStories: {
                    userId: selectedTripStoryUserId,
                    area: selectedTripStoryArea,
                    state: selectedTripStoryState,
                    country: selectedTripStoryCountry,
                  },
                }
              : id === 'tourist-places'
              ? {
                  touristPlaces: {
                    area: selectedTouristPlaceArea,
                    state: selectedTouristPlaceState,
                    country: selectedTouristPlaceCountry,
                  },
                }
              : id === 'travel-itineraries'
              ? {
                  travelItineraries: {
                    place: selectedTravelPlace,
                    country: selectedTravelCountry,
                  },
                }
              : id === 'reviews-comments'
              ? {
                  feedback: {
                    userId: selectedFeedbackUserId,
                    type: selectedFeedbackType,
                    placeId: selectedFeedbackPlaceId,
                    itemId: selectedFeedbackItemId,
                  },
                }
              : undefined
          )
        )
      );
      const allData: Record<string, Record<string, unknown>[]> = {};
      results.forEach((r, i) => {
        allData[ids[i]] = r.status === 'fulfilled' ? r.value : [];
      });

      if (format === 'csv') {
        ids.forEach(id => {
          const rows = allData[id];
          if (rows.length) downloadBlob(toCsv(rows), `abjee-${id}-${dateStr()}.csv`, 'text/csv');
        });
      } else {
        printAsPdf(ids, allData, stats);
      }

      scheduleDone(format);
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setExporting(null);
    }
  }, [
    selected,
    stats,
    isSingleUser,
    selectedUserId,
    isSingleRoom,
    selectedRoomId,
    isActivityOnly,
    usersList,
    selectedActivityUserId,
    selectedTripStoryUserId,
    selectedTripStoryArea,
    selectedTripStoryState,
    selectedTripStoryCountry,
    selectedTouristPlaceArea,
    selectedTouristPlaceState,
    selectedTouristPlaceCountry,
    selectedTravelPlace,
    selectedTravelCountry,
    selectedFeedbackUserId,
    selectedFeedbackType,
    selectedFeedbackPlaceId,
    selectedFeedbackItemId,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden gap-0 border-border">
        {/* ── Header ── */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border"
        >
          <div>
            <DialogTitle className="text-lg font-semibold flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" />
              Export Dashboard Data
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm mt-0.5">
              Choose sections and format to download
            </DialogDescription>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-lg p-1.5 hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </motion.div>

        {/* ── Section picker ── */}
        <div className="px-6 py-4 space-y-2 max-h-95 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Select sections ({selected.size}/{SECTIONS.length})
            </p>
            <div className="flex gap-2">
              <button onClick={selectAll} className="text-xs text-primary hover:underline">All</button>
              <span className="text-muted-foreground text-xs">·</span>
              <button onClick={clearAll}  className="text-xs text-muted-foreground hover:text-foreground hover:underline">None</button>
            </div>
          </div>

          {SECTIONS.map((sec, i) => {
            const Icon    = sec.icon;
            const checked = selected.has(sec.id);
            const isUsers    = sec.id === 'users';
            const isRooms    = sec.id === 'chatrooms';
            const isActivity = sec.id === 'activity';
            const isTripStories = sec.id === 'trip-stories';
            const isTouristPlaces = sec.id === 'tourist-places';
            const isTravelItineraries = sec.id === 'travel-itineraries';
            const isFeedback = sec.id === 'reviews-comments';
            const hasPanel   = (isUsers || isRooms || isActivity || isTripStories || isTouristPlaces || isTravelItineraries || isFeedback) && checked;
            return (
              <div key={sec.id}>
                <motion.button
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={() => toggle(sec.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 border transition-all text-left ${
                    hasPanel ? 'rounded-t-lg border-b-0' : 'rounded-lg'
                  } ${
                    checked
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-border bg-card/40 hover:bg-accent/50'
                  }`}
                >
                  <div className={`rounded-lg p-1.5 ${sec.bgColor} shrink-0`}>
                    <Icon className={`h-3.5 w-3.5 ${sec.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-none">{sec.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{sec.description}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {hasPanel && <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                    {checked
                      ? <CheckCircle2 className="h-4 w-4 text-primary" />
                      : <Circle       className="h-4 w-4 text-muted-foreground/40" />
                    }
                  </div>
                </motion.button>

                {/* ── User dropdown panel ── */}
                <AnimatePresence>
                  {isUsers && checked && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.22, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="border border-t-0 border-primary/40 bg-primary/5 rounded-b-lg px-3 pb-3 pt-2.5 space-y-2">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">User scope for export</p>
                        <Select value={selectedUserId} onValueChange={setSelectedUserId} disabled={usersLoading}>
                          <SelectTrigger className="h-8 text-xs bg-background">
                            {usersLoading
                              ? <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading users…</span>
                              : <SelectValue placeholder="All users (bulk export)" />}
                          </SelectTrigger>
                          <SelectContent className="max-h-52">
                            <SelectItem value="all"><span className="flex items-center gap-2"><Users className="h-3.5 w-3.5 text-muted-foreground" />All users (bulk export)</span></SelectItem>
                            {usersList.map(u => (
                              <SelectItem key={u.id} value={u.id}>
                                <span className="flex items-center gap-2">
                                  {u.avatar ? <img src={u.avatar} alt="" className="h-4 w-4 rounded-full object-cover shrink-0" /> : <UserCircle2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                                  <span className="truncate max-w-55">{u.displayName || u.email}<span className="text-muted-foreground ml-1.5">· {u.role}</span></span>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <AnimatePresence>
                          {selectedUser && (
                            <motion.div initial={{ opacity:0, scale:.95 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0, scale:.95 }}
                              className="flex items-center gap-2 rounded-lg border border-primary/30 bg-background px-2.5 py-1.5">
                              {selectedUser.avatar
                                ? <img src={selectedUser.avatar} alt="" className="h-6 w-6 rounded-full object-cover shrink-0" />
                                : <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-content-center shrink-0 text-xs font-bold text-primary">{(selectedUser.displayName || selectedUser.email).charAt(0).toUpperCase()}</div>}
                              <div className="min-w-0">
                                <p className="text-xs font-medium truncate">{selectedUser.displayName || selectedUser.email}</p>
                                <p className="text-[10px] text-muted-foreground">Photo · profile · messages · subscriptions</p>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ── Online Status live panel ── */}
                <AnimatePresence>
                  {isActivity && checked && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.22, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="border border-t-0 border-red-400/40 bg-red-500/5 rounded-b-lg px-3 pb-3 pt-2.5 space-y-2">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Activity scope for export</p>
                        <Select value={selectedActivityUserId} onValueChange={setSelectedActivityUserId} disabled={usersLoading}>
                          <SelectTrigger className="h-8 text-xs bg-background">
                            {usersLoading
                              ? <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading users…</span>
                              : <SelectValue placeholder="All users (activity export)" />}
                          </SelectTrigger>
                          <SelectContent className="max-h-52">
                            <SelectItem value="all"><span className="flex items-center gap-2"><Users className="h-3.5 w-3.5 text-muted-foreground" />All users (activity export)</span></SelectItem>
                            {usersList.map(u => (
                              <SelectItem key={u.id} value={u.id}>
                                <span className="flex items-center gap-2">
                                  {u.avatar ? <img src={u.avatar} alt="" className="h-4 w-4 rounded-full object-cover shrink-0" /> : <UserCircle2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                                  <span className="truncate max-w-55">{u.displayName || u.email}<span className="text-muted-foreground ml-1.5">· {u.role}</span></span>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <AnimatePresence>
                          {selectedActivityUser && (
                            <motion.div initial={{ opacity:0, scale:.95 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0, scale:.95 }}
                              className="flex items-center gap-2 rounded-lg border border-red-400/30 bg-background px-2.5 py-1.5">
                              {selectedActivityUser.avatar
                                ? <img src={selectedActivityUser.avatar} alt="" className="h-6 w-6 rounded-full object-cover shrink-0" />
                                : <div className="h-6 w-6 rounded-full bg-red-100 flex items-center justify-content-center shrink-0 text-xs font-bold text-red-600">{(selectedActivityUser.displayName || selectedActivityUser.email).charAt(0).toUpperCase()}</div>}
                              <div className="min-w-0">
                                <p className="text-xs font-medium truncate">{selectedActivityUser.displayName || selectedActivityUser.email}</p>
                                <p className="text-[10px] text-muted-foreground">Export activity for this user only</p>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                        <div className="flex items-center gap-3 rounded-lg border border-red-400/30 bg-background px-3 py-2">
                          {onlineCountLoading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
                          ) : onlineCountErr ? (
                            <span className="h-2.5 w-2.5 rounded-full bg-red-400 shrink-0" />
                          ) : onlineCount !== null ? (
                            <span className="relative flex h-2.5 w-2.5 shrink-0">
                              {onlineCount > 0 && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>}
                              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${onlineCount > 0 ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                            </span>
                          ) : (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            {onlineCountLoading ? (
                              <p className="text-xs text-muted-foreground">Fetching presence data…</p>
                            ) : onlineCountErr ? (
                              <p className="text-xs text-red-500 font-medium">Could not read status — check RTDB rules</p>
                            ) : onlineCount !== null ? (
                              <p className="text-xs font-medium">
                                <span className="text-green-600 font-bold">{onlineCount}</span>
                                <span className="text-muted-foreground"> users online right now</span>
                              </p>
                            ) : null}
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {isActivityUserScoped
                                ? 'Export includes selected user activity across website modules (users, chat, subscriptions, notifications, stories, partner requests)'
                                : 'Export includes all users activity across website modules (users, chat, subscriptions, notifications, stories, partner requests)'}
                            </p>
                          </div>
                          <button
                            onClick={fetchOnlineCount}
                            disabled={onlineCountLoading}
                            className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors p-0.5 rounded"
                            title="Refresh count"
                          >
                            <Activity className={`h-3.5 w-3.5 ${onlineCountLoading ? 'animate-pulse' : ''}`} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ── Trip stories filter panel ── */}
                <AnimatePresence>
                  {isTripStories && checked && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.22, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="border border-t-0 border-fuchsia-400/40 bg-fuchsia-500/5 rounded-b-lg px-3 pb-3 pt-2.5 space-y-2">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Trip stories filters</p>

                        <div className="grid grid-cols-1 gap-2">
                          <Select value={selectedTripStoryUserId} onValueChange={setSelectedTripStoryUserId} disabled={usersLoading}>
                            <SelectTrigger className="h-8 text-xs bg-background">
                              {usersLoading
                                ? <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading users…</span>
                                : <SelectValue placeholder="All users" />}
                            </SelectTrigger>
                            <SelectContent className="max-h-52">
                              <SelectItem value="all">All users</SelectItem>
                              {usersList.map(u => (
                                <SelectItem key={u.id} value={u.id}>
                                  <span className="truncate max-w-55">{u.displayName || u.email}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Select value={selectedTripStoryArea} onValueChange={setSelectedTripStoryArea} disabled={tripStoriesLoading}>
                            <SelectTrigger className="h-8 text-xs bg-background">
                              {tripStoriesLoading
                                ? <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading areas…</span>
                                : <SelectValue placeholder="All areas" />}
                            </SelectTrigger>
                            <SelectContent className="max-h-52">
                              <SelectItem value="all">All areas</SelectItem>
                              {tripStoryAreas.map(area => (
                                <SelectItem key={area} value={area}>{area}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Select value={selectedTripStoryState} onValueChange={setSelectedTripStoryState} disabled={tripStoriesLoading}>
                            <SelectTrigger className="h-8 text-xs bg-background">
                              {tripStoriesLoading
                                ? <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading states…</span>
                                : <SelectValue placeholder="All states" />}
                            </SelectTrigger>
                            <SelectContent className="max-h-52">
                              <SelectItem value="all">All states</SelectItem>
                              {tripStoryStates.map(state => (
                                <SelectItem key={state} value={state}>{state}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Select value={selectedTripStoryCountry} onValueChange={setSelectedTripStoryCountry} disabled={tripStoriesLoading}>
                            <SelectTrigger className="h-8 text-xs bg-background">
                              {tripStoriesLoading
                                ? <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading countries…</span>
                                : <SelectValue placeholder="All countries" />}
                            </SelectTrigger>
                            <SelectContent className="max-h-52">
                              <SelectItem value="all">All countries</SelectItem>
                              {tripStoryCountries.map(country => (
                                <SelectItem key={country} value={country}>{country}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <p className="text-[10px] text-muted-foreground">
                          Export includes trip story details for all users or filtered by user/area/state/country.
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ── Tourist places filter panel ── */}
                <AnimatePresence>
                  {isTouristPlaces && checked && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.22, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="border border-t-0 border-emerald-400/40 bg-emerald-500/5 rounded-b-lg px-3 pb-3 pt-2.5 space-y-2">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Tourist places filters</p>

                        <div className="grid grid-cols-1 gap-2">
                          <Select value={selectedTouristPlaceArea} onValueChange={setSelectedTouristPlaceArea} disabled={touristPlacesLoading}>
                            <SelectTrigger className="h-8 text-xs bg-background">
                              {touristPlacesLoading
                                ? <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading areas…</span>
                                : <SelectValue placeholder="All areas" />}
                            </SelectTrigger>
                            <SelectContent className="max-h-52">
                              <SelectItem value="all">All areas</SelectItem>
                              {touristPlaceAreas.map(area => (
                                <SelectItem key={area} value={area}>{area}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Select value={selectedTouristPlaceState} onValueChange={setSelectedTouristPlaceState} disabled={touristPlacesLoading}>
                            <SelectTrigger className="h-8 text-xs bg-background">
                              {touristPlacesLoading
                                ? <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading states…</span>
                                : <SelectValue placeholder="All states" />}
                            </SelectTrigger>
                            <SelectContent className="max-h-52">
                              <SelectItem value="all">All states</SelectItem>
                              {touristPlaceStates.map(state => (
                                <SelectItem key={state} value={state}>{state}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Select value={selectedTouristPlaceCountry} onValueChange={setSelectedTouristPlaceCountry} disabled={touristPlacesLoading}>
                            <SelectTrigger className="h-8 text-xs bg-background">
                              {touristPlacesLoading
                                ? <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading countries…</span>
                                : <SelectValue placeholder="All countries" />}
                            </SelectTrigger>
                            <SelectContent className="max-h-52">
                              <SelectItem value="all">All countries</SelectItem>
                              {touristPlaceCountries.map(country => (
                                <SelectItem key={country} value={country}>{country}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <p className="text-[10px] text-muted-foreground">
                          Export includes tourist place details filtered by area, state, and country.
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ── Travel itineraries filter panel ── */}
                <AnimatePresence>
                  {isTravelItineraries && checked && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.22, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="border border-t-0 border-sky-400/40 bg-sky-500/5 rounded-b-lg px-3 pb-3 pt-2.5 space-y-2">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Travel itineraries filters</p>

                        <div className="grid grid-cols-1 gap-2">
                          <Select value={selectedTravelPlace} onValueChange={setSelectedTravelPlace} disabled={travelItinerariesLoading}>
                            <SelectTrigger className="h-8 text-xs bg-background">
                              {travelItinerariesLoading
                                ? <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading places…</span>
                                : <SelectValue placeholder="All places" />}
                            </SelectTrigger>
                            <SelectContent className="max-h-52">
                              <SelectItem value="all">All places</SelectItem>
                              {travelPlaces.map(place => (
                                <SelectItem key={place} value={place}>{place}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Select value={selectedTravelCountry} onValueChange={setSelectedTravelCountry} disabled={travelItinerariesLoading}>
                            <SelectTrigger className="h-8 text-xs bg-background">
                              {travelItinerariesLoading
                                ? <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading countries…</span>
                                : <SelectValue placeholder="All countries" />}
                            </SelectTrigger>
                            <SelectContent className="max-h-52">
                              <SelectItem value="all">All countries</SelectItem>
                              {travelCountries.map(country => (
                                <SelectItem key={country} value={country}>{country}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <p className="text-[10px] text-muted-foreground">
                          Export includes travel itinerary details with places, restaurants, hotels, budget, and media for selected destination.
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ── Reviews & comments filter panel ── */}
                <AnimatePresence>
                  {isFeedback && checked && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.22, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="border border-t-0 border-amber-400/40 bg-amber-500/5 rounded-b-lg px-3 pb-3 pt-2.5 space-y-2">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Reviews & comments filters</p>

                        <div className="grid grid-cols-1 gap-2">
                          <Select value={selectedFeedbackUserId} onValueChange={setSelectedFeedbackUserId} disabled={usersLoading}>
                            <SelectTrigger className="h-8 text-xs bg-background">
                              {usersLoading
                                ? <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading users…</span>
                                : <SelectValue placeholder="All users" />}
                            </SelectTrigger>
                            <SelectContent className="max-h-52">
                              <SelectItem value="all">All users</SelectItem>
                              {usersList.map((u) => (
                                <SelectItem key={u.id} value={u.id}>{u.displayName || u.email}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Select value={selectedFeedbackType} onValueChange={(v) => setSelectedFeedbackType(v as 'all' | 'review' | 'comment')}>
                            <SelectTrigger className="h-8 text-xs bg-background">
                              <SelectValue placeholder="All feedback types" />
                            </SelectTrigger>
                            <SelectContent className="max-h-52">
                              <SelectItem value="all">All types</SelectItem>
                              <SelectItem value="review">Reviews only</SelectItem>
                              <SelectItem value="comment">Comments only</SelectItem>
                            </SelectContent>
                          </Select>

                          <Select value={selectedFeedbackPlaceId} onValueChange={setSelectedFeedbackPlaceId} disabled={feedbackLoading}>
                            <SelectTrigger className="h-8 text-xs bg-background">
                              {feedbackLoading
                                ? <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading posts…</span>
                                : <SelectValue placeholder="All posts/places" />}
                            </SelectTrigger>
                            <SelectContent className="max-h-52">
                              <SelectItem value="all">All posts/places</SelectItem>
                              {feedbackPlaces.map((pair) => {
                                const [placeId, placeName] = pair.split('::');
                                return (
                                  <SelectItem key={placeId} value={placeId}>{placeName || placeId}</SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>

                          <Select value={selectedFeedbackItemId} onValueChange={setSelectedFeedbackItemId} disabled={feedbackLoading}>
                            <SelectTrigger className="h-8 text-xs bg-background">
                              {feedbackLoading
                                ? <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading feedback…</span>
                                : <SelectValue placeholder="All reviews/comments" />}
                            </SelectTrigger>
                            <SelectContent className="max-h-52">
                              <SelectItem value="all">All reviews/comments</SelectItem>
                              {feedbackItemOptions.map((item) => (
                                <SelectItem key={`${item.type}-${item.id}-${item.placeId}`} value={`${item.type}:${item.placeId}:${item.id}`}>
                                  {`${item.type.toUpperCase()} · ${item.placeName} · ${(item.text || '').slice(0, 40)}`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <p className="text-[10px] text-muted-foreground">
                          Export includes all reviews and comments together, or filtered by specific user, post, and review/comment entry.
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ── Room dropdown panel ── */}
                <AnimatePresence>
                  {isRooms && checked && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.22, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="border border-t-0 border-orange-400/40 bg-orange-500/5 rounded-b-lg px-3 pb-3 pt-2.5 space-y-2">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Room scope for export</p>
                        <Select value={selectedRoomId} onValueChange={setSelectedRoomId} disabled={roomsLoading}>
                          <SelectTrigger className="h-8 text-xs bg-background">
                            {roomsLoading
                              ? <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading rooms…</span>
                              : <SelectValue placeholder="All rooms (bulk export)" />}
                          </SelectTrigger>
                          <SelectContent className="max-h-52">
                            <SelectItem value="all">
                              <span className="flex items-center gap-2"><MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />All rooms (bulk export)</span>
                            </SelectItem>
                            {roomsList.map(r => (
                              <SelectItem key={r.id} value={r.id}>
                                <span className="flex items-center gap-2">
                                  <span className="h-4 w-4 rounded flex items-center justify-center bg-orange-100 text-orange-600 text-[10px] shrink-0">{r.isPrivate ? '🔒' : '🌐'}</span>
                                  <span className="truncate max-w-50">{r.name}<span className="text-muted-foreground ml-1.5">· {r.memberCount} members</span></span>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <AnimatePresence>
                          {selectedRoom && (
                            <motion.div initial={{ opacity:0, scale:.95 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0, scale:.95 }}
                              className="flex items-center gap-2 rounded-lg border border-orange-400/30 bg-background px-2.5 py-1.5">
                              <div className="h-7 w-7 rounded-lg bg-orange-100 flex items-center justify-center text-base shrink-0">
                                {selectedRoom.isPrivate ? '🔒' : '💬'}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-medium truncate">{selectedRoom.name}</p>
                                <p className="text-[10px] text-muted-foreground">Room info · participants · full message transcript</p>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {/* ── Format buttons ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.25 }}
          className="px-6 pb-6 pt-4 border-t border-border space-y-3"
        >
          {selected.size === 0 && (
            <p className="text-xs text-center text-muted-foreground py-1">
              Select at least one section above
            </p>
          )}

          {(isSingleUser || isSingleRoom || isActivityOnly) && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={`text-xs text-center rounded-lg py-1.5 px-3 border ${
                isSingleUser
                  ? 'text-primary/80 bg-primary/5 border-primary/20'
                  : isActivityOnly
                  ? 'text-red-700 bg-red-500/5 border-red-400/20'
                  : 'text-orange-700 bg-orange-500/5 border-orange-400/20'
              }`}
            >
              {isSingleUser
                ? 'PDF will include full profile photo, details, messages & subscriptions'
                : isActivityOnly
                ? isActivityUserScoped
                  ? 'PDF will include a branded presence table for the selected user'
                  : 'PDF will include a branded presence table — name, email, role, last-seen for all users'
                : 'PDF will include room details, all participants & full message transcript'}
            </motion.p>
          )}

          <div className="grid grid-cols-2 gap-3">
            {/* CSV */}
            <Button
              variant="outline"
              className="h-auto py-3 flex-col gap-1.5 border-dashed hover:border-green-500/60 hover:bg-green-500/5 group"
              disabled={!selected.size || exporting !== null}
              onClick={() => handleExport('csv')}
            >
              {exporting === 'csv' ? (
                <Loader2 className="h-5 w-5 animate-spin text-green-500" />
              ) : done === 'csv' ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <FileSpreadsheet className="h-5 w-5 text-green-500 group-hover:scale-110 transition-transform" />
              )}
              <span className="text-sm font-medium">
                {exporting === 'csv' ? 'Exporting…' : done === 'csv' ? 'Downloaded!' : 'Export CSV'}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {isSingleUser ? 'Profile + subs + messages' : isSingleRoom ? 'Info + participants + transcript' : isActivityOnly ? (isActivityUserScoped ? 'Selected user status export' : 'Name, email, status, last-seen') : 'Comma-separated values'}
              </span>
            </Button>

            {/* PDF */}
            <Button
              variant="outline"
              className="h-auto py-3 flex-col gap-1.5 border-dashed hover:border-red-500/60 hover:bg-red-500/5 group"
              disabled={!selected.size || exporting !== null}
              onClick={() => handleExport('pdf')}
            >
              {exporting === 'pdf' ? (
                <Loader2 className="h-5 w-5 animate-spin text-red-500" />
              ) : done === 'pdf' ? (
                <CheckCircle2 className="h-5 w-5 text-red-500" />
              ) : (
                <FileText className="h-5 w-5 text-red-500 group-hover:scale-110 transition-transform" />
              )}
              <span className="text-sm font-medium">
                {exporting === 'pdf' ? 'Preparing…' : done === 'pdf' ? 'Opened!' : 'Export PDF'}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {isSingleUser ? 'Detailed profile report' : isSingleRoom ? 'Full room transcript' : isActivityOnly ? (isActivityUserScoped ? 'Single-user presence report' : 'Branded presence table') : 'Print-ready report'}
              </span>
            </Button>
          </div>

          {/* Section badges */}
          {selected.size > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[...selected].map(id => {
                const sec = SECTIONS.find(s => s.id === id);
                const label = id === 'users' && selectedUser
                  ? `User: ${selectedUser.displayName || selectedUser.email}`
                  : id === 'activity' && selectedActivityUser
                  ? `Activity: ${selectedActivityUser.displayName || selectedActivityUser.email}`
                  : id === 'chatrooms' && selectedRoom
                  ? `Room: ${selectedRoom.name}`
                  : sec?.label;
                return (
                  <Badge key={id} variant="secondary" className="text-[10px] gap-1 pr-1">
                    {label}
                    <button onClick={() => toggle(id)} className="ml-0.5 hover:text-destructive">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          )}
        </motion.div>
      </DialogContent>
    </Dialog>
  );
});

ExportDialog.displayName = 'ExportDialog';
