import { memo, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent } from '@/components/ui/dialog';
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
} from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { ref, get } from 'firebase/database';
import { firestoreDb, database } from '@/lib/firebase';

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

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stats: { title: string; value: string; change: string }[];
}

// ── Available export sections ───────────────────────────────────────────────
const SECTIONS: ExportSection[] = [
  { id: 'stats',         label: 'Dashboard Stats',  description: 'Users, revenue, sessions, page views',       icon: BarChart3,     color: 'text-blue-500',   bgColor: 'bg-blue-500/10'   },
  { id: 'users',         label: 'Users',            description: 'All users — or pick one for a detailed PDF', icon: Users,         color: 'text-purple-500', bgColor: 'bg-purple-500/10' },
  { id: 'subscriptions', label: 'Subscriptions',    description: 'Subscription & revenue records',             icon: DollarSign,    color: 'text-green-500',  bgColor: 'bg-green-500/10'  },
  { id: 'chatrooms',     label: 'Chat Rooms',       description: 'Room list & member counts',                  icon: MessageSquare, color: 'text-orange-500', bgColor: 'bg-orange-500/10' },
  { id: 'activity',      label: 'Online Status',    description: 'User presence & last-seen data',             icon: Activity,      color: 'text-red-500',    bgColor: 'bg-red-500/10'    },
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
    avatar:      creatorData.photoURL    ?? creatorData.avatar ?? '',
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
  const avatar = profile.photoURL || profile.avatar || '';

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
      const statusSnap = await get(ref(database, 'status'));
      const statusData = statusSnap.val() ?? {};
      const statusEntries = Object.entries(statusData) as [string, any][];

      // Build user lookup from already-cached list or fetch from Firestore
      const usersLookup: Record<string, any> = {};
      if (cachedUsers && cachedUsers.length > 0) {
        cachedUsers.forEach(u => { usersLookup[u.id] = u; });
      } else {
        const uids = statusEntries.map(([uid]) => uid).filter(Boolean);
        const chunks: string[][] = [];
        for (let i = 0; i < uids.length; i += 10) chunks.push(uids.slice(i, i + 10));
        await Promise.allSettled(
          chunks.map(chunk =>
            getDocs(query(collection(firestoreDb, 'users'), where('__name__', 'in', chunk)))
              .then(snap => snap.forEach(d => {
                const u = d.data();
                usersLookup[d.id] = {
                  id: d.id,
                  displayName: u.displayName ?? '',
                  email: u.email ?? '',
                  role: u.role ?? 'user',
                  avatar: u.photoURL ?? u.avatar ?? '',
                };
              }))
          )
        );
      }

      const rows = statusEntries.map(([uid, s]) => {
        const u = usersLookup[uid] ?? {};
        return {
          uid,
          displayName:     (u.displayName || s?.username || '—') as string,
          email:           (u.email        || '—') as string,
          role:            (u.role         || 'user') as string,
          status:          s?.isOnline ? 'Online' : 'Offline',
          lastSeen:        s?.lastSeen ? new Date(s.lastSeen).toLocaleString() : '—',
          lastSeenRelative: relativeTime(s?.lastSeen ?? 0),
          _lastSeenMs:     (s?.lastSeen ?? 0) as number,
          _isOnline:       !!(s?.isOnline),
        };
      });

      // Sort: online first, then by most-recently-seen
      rows.sort((a, b) => {
        if (a._isOnline !== b._isOnline) return a._isOnline ? -1 : 1;
        return b._lastSeenMs - a._lastSeenMs;
      });

      return rows.map(({ _lastSeenMs: _l, _isOnline: _o, ...rest }) => rest);
    }

    case 'pageviews': {
      const snap = await get(ref(database, 'analytics/pageViews'));
      return [{ metric: 'pageViews', value: snap.val() ?? 0, exportedAt: new Date().toISOString() }];
    }

    default:
      return [];
  }
}

// ── Online-status dedicated PDF ─────────────────────────────────────────────
function printActivityPdf(rows: Record<string, unknown>[]) {
  const logoUrl = `${window.location.origin}/logo.jpg`;
  const genDate = new Date().toLocaleString();
  const total   = rows.length;
  const online  = rows.filter(r => r.status === 'Online').length;
  const offline = total - online;

  const tableRows = rows.map((r, i) => {
    const isOnline = r.status === 'Online';
    return `
    <tr>
      <td style="text-align:center;color:#9ca3af;font-size:10px">${i + 1}</td>
      <td>
        <span style="display:inline-flex;align-items:center;gap:5px">
          <span style="width:7px;height:7px;border-radius:50%;flex-shrink:0;background:${isOnline ? '#16a34a' : '#d1d5db'};
            box-shadow:${isOnline ? '0 0 0 2px #bbf7d0' : 'none'}"></span>
          <strong style="color:${isOnline ? '#15803d' : '#6b7280'}">${isOnline ? 'Online' : 'Offline'}</strong>
        </span>
      </td>
      <td style="font-weight:600;color:#111827">${r.displayName ?? '—'}</td>
      <td style="color:#2563eb">${r.email ?? '—'}</td>
      <td style="font-size:10px;word-break:break-all;color:#6b7280">${r.uid ?? '—'}</td>
      <td><span style="background:${r.role === 'admin' ? '#fef3c7' : r.role === 'owner' ? '#fce7f3' : '#f0fdf4'};
        color:${r.role === 'admin' ? '#92400e' : r.role === 'owner' ? '#9d174d' : '#166534'};
        padding:2px 8px;border-radius:99px;font-size:9px;font-weight:700;text-transform:uppercase">${r.role ?? 'user'}</span></td>
      <td style="white-space:nowrap;font-size:10px;color:#374151">${r.lastSeen ?? '—'}</td>
      <td style="white-space:nowrap;font-size:10px;color:${isOnline ? '#16a34a' : '#9ca3af'}">${r.lastSeenRelative ?? '—'}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Online Status Report</title>
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
      <span class="report-title">User Online Status</span>
      <span class="report-date">${genDate}</span>
    </div>
  </div>
  <div class="brand-divider"></div>

  <div class="stats-bar">
    <div class="stat-item"><div class="stat-value">${total}</div><div class="stat-label">Total Users</div></div>
    <div class="stat-item"><div class="stat-value green">${online}</div><div class="stat-label">Online Now</div></div>
    <div class="stat-item"><div class="stat-value gray">${offline}</div><div class="stat-label">Offline</div></div>
    <div class="stat-item"><div class="stat-value" style="font-size:12px;color:#6b7280">${genDate.split(',')[0]}</div><div class="stat-label">Snapshot Date</div></div>
  </div>

  <div class="section">
    <div class="section-title">Presence Table (${total} users &mdash; online first)</div>
    <table>
      <thead><tr>
        <th style="width:28px">#</th>
        <th style="width:80px">Status</th>
        <th>Name</th>
        <th>Email</th>
        <th>UID</th>
        <th style="width:70px">Role</th>
        <th style="width:130px">Last Seen</th>
        <th style="width:80px">How Long Ago</th>
      </tr></thead>
      <tbody>${tableRows || '<tr><td colspan="8" style="text-align:center;color:#9ca3af">No status data found</td></tr>'}</tbody>
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
      <div>Admin Report &mdash; User Online Status</div>
      <div>${online} online &nbsp;&middot;&nbsp; ${offline} offline &nbsp;&middot;&nbsp; ${total} total</div>
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

  // Room dropdown state
  const [roomsList, setRoomsList]           = useState<RoomRecord[]>([]);
  const [roomsLoading, setRoomsLoading]     = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string>('all');

  // Clear done-timer on unmount to prevent state updates on unmounted component
  useEffect(() => () => { if (doneTimerRef.current) clearTimeout(doneTimerRef.current); }, []);

  const usersChecked    = selected.has('users');
  const roomsChecked    = selected.has('chatrooms');
  const activityChecked = selected.has('activity');

  // Load users when the users section is first checked
  useEffect(() => {
    if (!usersChecked || usersList.length > 0 || usersLoading) return;
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
            avatar: u.photoURL ?? u.avatar ?? '',
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
  }, [usersChecked]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset user selection when users section is unchecked
  useEffect(() => {
    if (!usersChecked) setSelectedUserId('all');
  }, [usersChecked]);

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
  const isSingleRoom   = useMemo(() => roomsChecked    && selectedRoomId !== 'all', [roomsChecked, selectedRoomId]);
  const selectedRoom   = useMemo(() => roomsList.find(r => r.id === selectedRoomId), [roomsList, selectedRoomId]);
  const isActivityOnly = useMemo(() => activityChecked && selected.size === 1, [activityChecked, selected]);

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
        const rows = await fetchSectionData('activity', stats, cachedUsers);
        printActivityPdf(rows);
        scheduleDone('pdf');
        return;
      }

      // ── Bulk export (all sections) ────────────────────────────────────────
      const ids = [...selected];
      // Pass the already-loaded users list to avoid a redundant Firestore read
      const cachedUsers = usersList.length > 0 ? usersList : undefined;
      const results = await Promise.allSettled(
        ids.map(id => fetchSectionData(id, stats, cachedUsers))
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
  }, [selected, stats, isSingleUser, selectedUserId, isSingleRoom, selectedRoomId, isActivityOnly, usersList]);

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
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" />
              Export Dashboard Data
            </h2>
            <p className="text-muted-foreground text-sm mt-0.5">
              Choose sections and format to download
            </p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-lg p-1.5 hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </motion.div>

        {/* ── Section picker ── */}
        <div className="px-6 py-4 space-y-2 max-h-[380px] overflow-y-auto">
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
            const hasPanel   = (isUsers || isRooms || isActivity) && checked;
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
                  <div className={`rounded-lg p-1.5 ${sec.bgColor} flex-shrink-0`}>
                    <Icon className={`h-3.5 w-3.5 ${sec.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-none">{sec.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{sec.description}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
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
                                  {u.avatar ? <img src={u.avatar} alt="" className="h-4 w-4 rounded-full object-cover flex-shrink-0" /> : <UserCircle2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                                  <span className="truncate max-w-[220px]">{u.displayName || u.email}<span className="text-muted-foreground ml-1.5">· {u.role}</span></span>
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
                                ? <img src={selectedUser.avatar} alt="" className="h-6 w-6 rounded-full object-cover flex-shrink-0" />
                                : <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-content-center flex-shrink-0 text-xs font-bold text-primary">{(selectedUser.displayName || selectedUser.email).charAt(0).toUpperCase()}</div>}
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
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Live presence snapshot</p>
                        <div className="flex items-center gap-3 rounded-lg border border-red-400/30 bg-background px-3 py-2">
                          {onlineCountLoading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground flex-shrink-0" />
                          ) : onlineCountErr ? (
                            <span className="h-2.5 w-2.5 rounded-full bg-red-400 flex-shrink-0" />
                          ) : onlineCount !== null ? (
                            <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                              {onlineCount > 0 && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>}
                              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${onlineCount > 0 ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                            </span>
                          ) : (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground flex-shrink-0" />
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
                            <p className="text-[10px] text-muted-foreground mt-0.5">Export includes all users — name, email, UID, role, last-seen</p>
                          </div>
                          <button
                            onClick={fetchOnlineCount}
                            disabled={onlineCountLoading}
                            className="flex-shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors p-0.5 rounded"
                            title="Refresh count"
                          >
                            <Activity className={`h-3.5 w-3.5 ${onlineCountLoading ? 'animate-pulse' : ''}`} />
                          </button>
                        </div>
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
                                  <span className="h-4 w-4 rounded flex items-center justify-center bg-orange-100 text-orange-600 text-[10px] flex-shrink-0">{r.isPrivate ? '🔒' : '🌐'}</span>
                                  <span className="truncate max-w-[200px]">{r.name}<span className="text-muted-foreground ml-1.5">· {r.memberCount} members</span></span>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <AnimatePresence>
                          {selectedRoom && (
                            <motion.div initial={{ opacity:0, scale:.95 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0, scale:.95 }}
                              className="flex items-center gap-2 rounded-lg border border-orange-400/30 bg-background px-2.5 py-1.5">
                              <div className="h-7 w-7 rounded-lg bg-orange-100 flex items-center justify-center text-base flex-shrink-0">
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
                ? 'PDF will include a branded presence table — name, email, role, last-seen for all users'
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
                {isSingleUser ? 'Profile + subs + messages' : isSingleRoom ? 'Info + participants + transcript' : isActivityOnly ? 'Name, email, status, last-seen' : 'Comma-separated values'}
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
                {isSingleUser ? 'Detailed profile report' : isSingleRoom ? 'Full room transcript' : isActivityOnly ? 'Branded presence table' : 'Print-ready report'}
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
