import { memo, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ref, get, remove } from 'firebase/database';
import { database } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  Eye,
  Calendar,
  MapPin,
  MoreHorizontal,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Users,
  MessageSquare,
  Globe,
  Lock,
  Crown,
  CheckCircle2,
  XCircle,
  Clock,
  Hash,
  Tag,
  Shield,
  ArrowUpRight,
} from 'lucide-react';
import { AddChatRoomDialog } from '@/components/ui/add-chatroom-dialog';
import { ChatRoomActionsDialog } from '@/components/ui/chatroom-actions-dialog';
import { modernConfirm } from '@/lib/modernDialog';

// ─── Pure helpers (outside component — never recreated on render) ─────────────

const AVATAR_COLORS = [
  'bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-yellow-500',
  'bg-lime-600', 'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500',
  'bg-sky-500', 'bg-blue-500', 'bg-violet-500', 'bg-pink-500',
];

function getRoomAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getTypeColor(type: string): string {
  switch (type) {
    case 'private': return 'bg-orange-500/10 text-orange-600 border-orange-400/30 dark:text-orange-400';
    case 'premium': return 'bg-purple-500/10 text-purple-600 border-purple-400/30 dark:text-purple-400';
    default:        return 'bg-blue-500/10 text-blue-600 border-blue-400/30 dark:text-blue-400';
  }
}

function getTypeLabel(type: string): string {
  switch (type) {
    case 'private': return 'Private Community Chat';
    case 'premium': return 'Premium';
    default:        return 'General Community Chat';
  }
}

function getVisibilityColor(visibility: 'exposed' | 'private'): string {
  return visibility === 'exposed'
    ? 'bg-green-100 text-green-800 border-2 border-green-500 dark:bg-green-950/50 dark:text-green-300 dark:border-green-500/60'
    : 'bg-blue-100 text-blue-800 border-2 border-blue-500 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-500/60';
}

function getTypeIcon(type: string, size = 'sm') {
  const cls = size === 'lg' ? 'h-5 w-5' : 'h-3.5 w-3.5';
  switch (type) {
    case 'private': return <Lock className={cls} />;
    case 'premium': return <Crown className={cls} />;
    default:        return <Globe className={cls} />;
  }
}

function normalizeRoom(id: string, raw: any) {
  const memberCount =
    Array.isArray(raw.participants) ? raw.participants.length
    : raw.members && typeof raw.members === 'object' ? Object.keys(raw.members).length
    : 0;
  const maxMembers = raw.maxMembers || 1000;
  const type =
    raw.type === 'public' || raw.type === 'private' || raw.type === 'premium'
      ? raw.type
      : raw.isPublic === false ? 'private' : 'public';
  const visibility: 'exposed' | 'private' = raw.visibility === 'exposed' ? 'exposed' : 'private';
  return {
    id,
    name: raw.name || '',
    description: raw.description || '',
    type,
    isPublic: raw.isPublic !== false,
    visibility,
    isActive: raw.isActive !== false,
    destination: raw.destination || {},
    maxMembers,
    memberCount,
    capacityPercent: Math.round((memberCount / maxMembers) * 100),
    messageCount: raw.messages && typeof raw.messages === 'object'
      ? Object.keys(raw.messages).length
      : (raw.messageCount || 0),
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
    lastActivity: raw.lastActivity || null,
    createdBy: raw.createdBy || null,
    iconImage: raw.iconImage || null,
    backgroundImage: raw.backgroundImage || null,
    iconUrl: raw.iconImage?.url || raw.avatar || null,
    avatar: raw.avatar || raw.iconImage?.url || null,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    rules: Array.isArray(raw.rules) ? raw.rules : [],
    subscriptionRequired: raw.subscriptionRequired || false,
    // Derive lastMessage from the actual messages subtree so edited messages reflect immediately.
    // Falls back to the denormalized raw.lastMessage only when the subtree is absent.
    lastMessage: (() => {
      if (raw.messages && typeof raw.messages === 'object') {
        const msgs = Object.values(raw.messages) as any[];
        if (msgs.length > 0) {
          const latest = msgs.reduce((a: any, b: any) =>
            ((a.timestamp || 0) >= (b.timestamp || 0) ? a : b)
          );
          return {
            text: latest.text || (latest.attachment ? (latest.attachment.name || 'Attachment') : ''),
            senderName: latest.username || latest.senderName || '',
            timestamp: latest.timestamp || 0,
          };
        }
      }
      return raw.lastMessage || null;
    })(),
    inviteToken: raw.inviteToken || null,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ChatRoomsTableProps {
  refreshTrigger?: number;
}

const ROOMS_PER_PAGE = 10;

// Stable animation variants — defined once at module level, never recreated
const CARD_VARIANTS = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -8 },
} as const;

export const ChatRoomsTable = memo(({ refreshTrigger }: ChatRoomsTableProps) => {
  // Cache of all normalized rooms — filter/search/page never trigger RTDB re-fetch
  const allRoomsRef = useRef<any[]>([]);
  // Refs for current filter state — fetchRooms reads from these, avoiding stale-closure deps
  const typeFilterRef   = useRef('all');
  const statusFilterRef = useRef('all');
  const searchQueryRef  = useRef('');
  const currentPageRef  = useRef(1);
  // Prevent the filter-effect from re-running applyFilters right after fetchRooms just did
  const justFetchedRef  = useRef(false);

  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showActionsDialog, setShowActionsDialog] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRooms, setTotalRooms] = useState(0);

  // Apply filters/sort/pagination from cached data (no RTDB call)
  const applyFilters = useCallback((
    all: any[], type: string, status: string, query: string, page: number,
  ) => {
    let filtered = all;
    if (type !== 'all') filtered = filtered.filter(r => r.type === type);
    if (status === 'active') filtered = filtered.filter(r => r.isActive);
    else if (status === 'inactive') filtered = filtered.filter(r => !r.isActive);
    if (query) {
      const q = query.toLowerCase();
      filtered = filtered.filter(r =>
        r.name.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        (r.destination?.country || '').toLowerCase().includes(q) ||
        (r.destination?.city || '').toLowerCase().includes(q),
      );
    }
    filtered = [...filtered].sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / ROOMS_PER_PAGE));
    const safePage = Math.min(page, pages);
    const start = (safePage - 1) * ROOMS_PER_PAGE;
    setRooms(filtered.slice(start, start + ROOMS_PER_PAGE));
    setTotalPages(pages);
    setTotalRooms(total);
  }, []);

  // Fetch RTDB state once per refresh action; no live subscription remains active.
  const fetchRooms = useCallback(async () => {
    setLoading(true);
    try {
      const snapshot = await get(ref(database, 'chatrooms'));
      const data = snapshot.val();
      if (!data) {
        allRoomsRef.current = [];
        setRooms([]);
        setTotalPages(1);
        setTotalRooms(0);
        return;
      }

      const normalized = Object.entries(data).map(([id, raw]) => normalizeRoom(id, raw as any));
      allRoomsRef.current = normalized;
      justFetchedRef.current = true;
      applyFilters(
        normalized,
        typeFilterRef.current,
        statusFilterRef.current,
        searchQueryRef.current,
        currentPageRef.current,
      );
    } catch (err) {
      console.error('Failed to load chat communities from RTDB:', err);
      setRooms([]);
      setTotalPages(1);
      setTotalRooms(0);
    } finally {
      setLoading(false);
    }
  }, [applyFilters]);

  // Load once on mount and on explicit refresh requests.
  useEffect(() => {
    void fetchRooms();
  }, [refreshTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter/search/page changes → client-side only, no RTDB call
  // Skips the cycle immediately following a fetchRooms call (already applied there)
  useEffect(() => {
    if (justFetchedRef.current) { justFetchedRef.current = false; return; }
    if (!loading) applyFilters(allRoomsRef.current, typeFilter, statusFilter, searchQuery, currentPage);
  }, [typeFilter, statusFilter, searchQuery, currentPage, applyFilters, loading]);

  // Keep refs in sync with state so fetchRooms can read latest values
  useEffect(() => { typeFilterRef.current   = typeFilter;   }, [typeFilter]);
  useEffect(() => { statusFilterRef.current = statusFilter; }, [statusFilter]);
  useEffect(() => { searchQueryRef.current  = searchQuery;  }, [searchQuery]);
  useEffect(() => { currentPageRef.current  = currentPage;  }, [currentPage]);

  const handleRoomClick    = useCallback((room: any) => { setSelectedRoom(room); setShowActionsDialog(true); }, []);
  const handleRoomUpdated  = useCallback(() => fetchRooms(), [fetchRooms]);
  const handleRoomAdded    = useCallback(() => fetchRooms(), [fetchRooms]);
  const handleRefresh      = useCallback(() => fetchRooms(), [fetchRooms]);

  const handleDeleteRoom = useCallback(async (room: any) => {
    const normalizedRoomName = (room?.name || '').trim().toLowerCase();
    const isGeneralCommunity =
      normalizedRoomName === 'general community chat' ||
      normalizedRoomName === 'general chat' ||
      normalizedRoomName.startsWith('general chat') ||
      normalizedRoomName.includes('general community');

    if (isGeneralCommunity) {
      alert('General Community Chat cannot be deleted from client side.');
      return;
    }

    const confirmed = await modernConfirm(`Delete "${room.name}"? This will remove all messages and cannot be undone.`, {
      title: 'Delete Community',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await remove(ref(database, `chatrooms/${room.id}`));
      fetchRooms();
    } catch (err: any) {
      console.error('Failed to delete chat community:', err);
      alert('Failed to delete chat community. Please try again.');
    }
  }, [fetchRooms]);

  const handleSearch       = useCallback((v: string) => { setSearchQuery(v); setCurrentPage(1); }, []);
  const handleTypeFilter   = useCallback((v: string) => { setTypeFilter(v);   setCurrentPage(1); }, []);
  const handleStatusFilter = useCallback((v: string) => { setStatusFilter(v); setCurrentPage(1); }, []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-bold">Chat Communities</h2>
          <p className="text-muted-foreground text-sm">
            {totalRooms} {totalRooms === 1 ? 'community' : 'communities'} total
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleRefresh} variant="outline" size="sm" disabled={loading}>
            <RefreshCw
              className="h-4 w-4"
              style={loading ? { animationDuration: '0.7s' } : undefined}
            />
          </Button>
          <Button onClick={() => setShowAddDialog(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Community
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Search communities..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={typeFilter} onValueChange={handleTypeFilter}>
          <SelectTrigger className="w-full sm:w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="public">Public</SelectItem>
            <SelectItem value="private">Private</SelectItem>
            <SelectItem value="premium">Premium</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={handleStatusFilter}>
          <SelectTrigger className="w-full sm:w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loading && rooms.length === 0 ? (
        <div className="text-center py-12">
          <RefreshCw
            className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4"
            style={{ animationDuration: '0.7s' }}
          />
          <p className="text-muted-foreground">Loading chat communities...</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <AnimatePresence mode="sync">
              {rooms.map((room) => (
                <RoomCard
                  key={room.id}
                  room={room}
                  onManage={handleRoomClick}
                  onDelete={handleDeleteRoom}
                />
              ))}
            </AnimatePresence>
          </div>

          {rooms.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg font-medium">No chat communities found</p>
              <p className="text-sm mt-1">Try adjusting your filters or create a new community</p>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
              <p className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages} • {totalRooms} total
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1 || loading}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages || loading}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <AddChatRoomDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onRoomAdded={handleRoomAdded}
      />
      <ChatRoomActionsDialog
        open={showActionsDialog}
        onOpenChange={setShowActionsDialog}
        room={selectedRoom}
        onRoomUpdated={handleRoomUpdated}
      />
    </div>
  );
});

ChatRoomsTable.displayName = 'ChatRoomsTable';

// ─── RoomCard — separate memo'd component to prevent full-list re-renders ─────

interface RoomCardProps {
  room: any;
  onManage: (room: any) => void;
  onDelete: (room: any) => void;
}

const RoomCard = memo(({ room, onManage, onDelete }: RoomCardProps) => {
  const typeColor  = useMemo(() => getTypeColor(room.type),       [room.type]);
  const visibilityColor = useMemo(() => getVisibilityColor(room.visibility), [room.visibility]);
  const avatarColor = useMemo(() => getRoomAvatarColor(room.name || ''), [room.name]);
  const capPct = room.capacityPercent ?? 0;
  const capColor = capPct >= 90 ? 'text-red-500' : capPct >= 70 ? 'text-amber-500' : 'text-green-500';
  const barColor  = capPct >= 90 ? 'bg-red-500'  : capPct >= 70 ? 'bg-amber-500'  : 'bg-green-500';

  return (
    <motion.div
      variants={CARD_VARIANTS}
      initial="initial"
      animate="animate"
      exit="exit"
      className="bg-card hover:bg-accent/30 flex flex-col gap-3 rounded-lg border border-border p-4 transition-colors"
    >
      {/* Top row */}
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="relative shrink-0">
          {room.iconUrl ? (
            <img src={room.iconUrl} alt={room.name} className="h-12 w-12 rounded-full object-cover ring-2 ring-border" />
          ) : (
            <div className={`flex h-12 w-12 items-center justify-center rounded-full text-white font-bold text-base ${avatarColor}`}>
              {(room.name || '?').charAt(0).toUpperCase()}
            </div>
          )}
          <span className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-card ${typeColor}`}>
            {getTypeIcon(room.type)}
          </span>
        </div>

        {/* Name + badges */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold truncate max-w-50">{room.name}</h4>
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold flex items-center gap-1.5 ${typeColor}`}>
              {getTypeIcon(room.type)}
              {getTypeLabel(room.type)}
            </span>
            {!room.isPublic && (
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold flex items-center gap-1.5 ${visibilityColor}`}>
                {room.visibility === 'exposed' ? <Eye className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                {room.visibility === 'exposed' ? 'Exposed' : 'Private'}
              </span>
            )}
            {room.subscriptionRequired && (
              <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-amber-500/10 text-amber-500 flex items-center gap-1">
                <Shield className="h-3 w-3" /> Premium
              </span>
            )}
            {room.isActive ? (
              <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-green-500/10 text-green-500 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Active
              </span>
            ) : (
              <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-red-500/10 text-red-500 flex items-center gap-1">
                <XCircle className="h-3 w-3" /> Inactive
              </span>
            )}
          </div>
          <p className="text-muted-foreground text-xs mt-1 line-clamp-2">
            {room.description || <span className="italic">No description</span>}
          </p>
        </div>

        {/* Actions */}
        <div className="shrink-0 flex items-center gap-1">
          {!(((room.name || '').trim().toLowerCase() === 'general community chat') ||
            ((room.name || '').trim().toLowerCase() === 'general chat') ||
            ((room.name || '').trim().toLowerCase().startsWith('general chat')) ||
            ((room.name || '').trim().toLowerCase().includes('general community'))) && (
            <Button
              variant="ghost" size="sm"
              onClick={() => onDelete(room)}
              className="text-red-500 hover:text-red-600 hover:bg-red-500/10 h-8 w-8 p-0"
              title="Delete community"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => onManage(room)} className="h-8 w-8 p-0" title="Manage community">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Capacity bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {room.memberCount} / {room.maxMembers} members
          </span>
          <span className={`font-medium ${capColor}`}>{capPct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(capPct, 100)}%` }} />
        </div>
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <MessageSquare className="h-3 w-3" />
          <span>{room.messageCount} messages</span>
        </div>
        {(room.destination?.country || room.destination?.city) && (
          <div className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            <span>{[room.destination.city, room.destination.country].filter(Boolean).join(', ')}</span>
          </div>
        )}
        <div className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          <span>Created {room.createdAt ? new Date(room.createdAt).toLocaleDateString() : 'N/A'}</span>
        </div>
        {room.lastActivity && (
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>Active {new Date(room.lastActivity).toLocaleDateString()}</span>
          </div>
        )}
        {room.updatedAt && (
          <div className="flex items-center gap-1">
            <ArrowUpRight className="h-3 w-3" />
            <span>Updated {new Date(room.updatedAt).toLocaleDateString()}</span>
          </div>
        )}
      </div>

      {/* Last message */}
      {room.lastMessage?.text && (
        <div className="rounded-md bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Last message: </span>
          <span className="line-clamp-1">{room.lastMessage.text}</span>
        </div>
      )}

      {/* Tags */}
      {room.tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <Tag className="h-3 w-3 text-muted-foreground" />
          {room.tags.map((tag: string, i: number) => (
            <span key={i} className="rounded-full bg-secondary px-2 py-0.5 text-xs">{tag}</span>
          ))}
        </div>
      )}

      {/* Room ID */}
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60 font-mono">
        <Hash className="h-3 w-3" />
        <span title={room.id}>{room.id}</span>
      </div>
    </motion.div>
  );
});

RoomCard.displayName = 'RoomCard';
