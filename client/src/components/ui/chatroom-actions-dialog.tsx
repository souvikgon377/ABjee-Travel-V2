import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { ref, get, update, onValue } from 'firebase/database';
import { database } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Users, Settings, Activity, Hash, Tag, Shield, Clock, MessageSquare, Crown, Globe, Lock, Paperclip, Mic, RefreshCw } from 'lucide-react';

// ─── Pure helpers (outside component) ───────────────────────────────

const DIALOG_AVATAR_COLORS = [
  'bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-lime-600',
  'bg-emerald-500', 'bg-teal-500', 'bg-sky-500', 'bg-blue-500',
  'bg-violet-500', 'bg-pink-500',
];

function getDialogAvatarBg(name: string): string {
  const hash = (name || '').split('').reduce((h: number, c: string) => c.charCodeAt(0) + ((h << 5) - h), 0);
  return DIALOG_AVATAR_COLORS[Math.abs(hash) % DIALOG_AVATAR_COLORS.length];
}

interface ChatRoomActionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  room: any;
  onRoomUpdated: () => void;
}

export const ChatRoomActionsDialog = memo(
  ({ open, onOpenChange, room, onRoomUpdated }: ChatRoomActionsDialogProps) => {
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('details');
    const [members, setMembers] = useState<any[]>([]);
    const [loadingMembers, setLoadingMembers] = useState(false);
    const [messages, setMessages] = useState<any[]>([]);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [messagesError, setMessagesError] = useState<string | null>(null);
    // Visited tabs: only mount content after the tab has been opened at least once
    const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set(['details']));
    // Cache the full room snapshot — shared by fetchMembers and fetchMessages
    const roomDataRef = useRef<any>(null);
    // Unsubscribe handles for live listeners
    const msgsUnsubRef = useRef<(() => void) | null>(null);
    const membersUnsubRef = useRef<(() => void) | null>(null);
    const [formData, setFormData] = useState({
      name: '',
      description: '',
      type: 'public',
      country: '',
      city: '',
      maxMembers: '1000',
      isActive: true,
    });

    // Reset tab + data when room changes to avoid stale state
    useEffect(() => {
      if (room) {
        // Tear down any live subscriptions for the previous room
        msgsUnsubRef.current?.();
        msgsUnsubRef.current = null;
        membersUnsubRef.current?.();
        membersUnsubRef.current = null;
        setActiveTab('details');
        setVisitedTabs(new Set(['details']));
        setMembers([]);
        setMessages([]);
        setMessagesError(null);
        roomDataRef.current = null; // clear snapshot cache
        setFormData({
          name: room.name || '',
          description: room.description || '',
          type: room.type || 'public',
          country: room.destination?.country || '',
          city: room.destination?.city || '',
          maxMembers: String(room.maxMembers || 1000),
          isActive: room.isActive !== false,
        });
      }
    }, [room?.id]); // only on id change, not on every room object re-reference

    // Tear down live listeners when dialog is closed
    useEffect(() => {
      if (!open) {
        msgsUnsubRef.current?.();
        msgsUnsubRef.current = null;
        membersUnsubRef.current?.();
        membersUnsubRef.current = null;
      }
    }, [open]);

    const fetchMembers = useCallback(() => {
      if (!room?.id) return;
      membersUnsubRef.current?.();
      membersUnsubRef.current = null;
      setLoadingMembers(true);

      const participantsRef = ref(database, `chatrooms/${room.id}/participants`);
      membersUnsubRef.current = onValue(
        participantsRef,
        async (snap) => {
          const raw = snap.val();
          // participants can be stored as an array or an object map
          const participants: string[] = Array.isArray(raw)
            ? raw.filter(Boolean)
            : raw && typeof raw === 'object'
            ? Object.values(raw).filter(Boolean) as string[]
            : [];

          // Resolve names: source 1 — status/{uid} nodes (parallel)
          const nameMap: Record<string, { displayName: string; avatar: string | null }> = {};
          const statusSnaps = await Promise.all(
            participants.map((uid) =>
              get(ref(database, `status/${uid}`))
                .then((s) => ({ uid, val: s.val() }))
                .catch(() => ({ uid, val: null }))
            )
          );
          for (const { uid, val } of statusSnaps) {
            if (val?.username) nameMap[uid] = { displayName: val.username, avatar: val.photoURL || null };
          }

          // Source 2 — any messages already cached (no extra RTDB call)
          const messagesData = roomDataRef.current?.messages;
          if (messagesData && typeof messagesData === 'object') {
            for (const msg of Object.values(messagesData) as any[]) {
              if (msg?.userId && msg?.username && !nameMap[msg.userId]) {
                nameMap[msg.userId] = { displayName: msg.username, avatar: msg.photoURL || null };
              }
            }
          }

          setMembers(participants.map((uid: string) => ({
            id: uid,
            displayName: nameMap[uid]?.displayName || uid,
            avatar: nameMap[uid]?.avatar || null,
            email: '',
            role: uid === room.createdBy ? 'admin' : 'member',
          })));
          setLoadingMembers(false);
        },
        (err) => {
          console.error('members onValue error:', err);
          setMembers([]);
          setLoadingMembers(false);
        }
      );
    }, [room?.id, room?.createdBy]);

    const fetchMessages = useCallback(() => {
      if (!room?.id) return;
      // Tear down any previous listener before creating a new one
      msgsUnsubRef.current?.();
      msgsUnsubRef.current = null;
      setLoadingMessages(true);
      setMessagesError(null);
      const msgsRef = ref(database, `chatrooms/${room.id}/messages`);
      msgsUnsubRef.current = onValue(
        msgsRef,
        (snap) => {
          const raw = snap.val();
          if (!raw || typeof raw !== 'object') {
            setMessages([]);
          } else {
            const list = Object.entries(raw).map(([key, val]: [string, any]) => ({ id: key, ...val }));
            list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)); // newest first
            setMessages(list);
          }
          setLoadingMessages(false);
        },
        (err) => {
          console.error('messages onValue error:', err);
          setMessagesError(err.message || 'Failed to load messages');
          setMessages([]);
          setLoadingMessages(false);
        }
      );
    }, [room?.id]);

    const handleTabChange = useCallback((tab: string) => {
      setActiveTab(tab);
      setVisitedTabs((prev) => prev.has(tab) ? prev : new Set([...prev, tab]));
    }, []);

    useEffect(() => {
      if (activeTab === 'members')  fetchMembers();
      if (activeTab === 'messages') fetchMessages();
    }, [activeTab, fetchMembers, fetchMessages]);

    const handleChange = useCallback((field: string, value: string | boolean) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    }, []);

    const handleUpdate = useCallback(async () => {
      if (!room?.id) return;
      setLoading(true);
      try {
        const updates: Record<string, any> = {
          name: formData.name,
          description: formData.description,
          type: formData.type,
          isPublic: formData.type === 'public',
          destination: {
            country: formData.country || null,
            city: formData.city || null,
            region: null,
          },
          maxMembers: parseInt(formData.maxMembers) || 1000,
          isActive: formData.isActive,
          updatedAt: new Date().toISOString(),
        };
        await update(ref(database, `chatrooms/${room.id}`), updates);
        onRoomUpdated();
        onOpenChange(false);
      } catch (error: any) {
        console.error('Failed to update room:', error);
        alert('Failed to update room. Please try again.');
      } finally {
        setLoading(false);
      }
    }, [room?.id, formData, onRoomUpdated, onOpenChange]);

    if (!room) return null;

    const iconUrl = room.iconUrl || room.iconImage?.url || room.avatar || null;
    const avatarBg = getDialogAvatarBg(room.name);

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-150 max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3">
              {iconUrl ? (
                <img src={iconUrl} alt={room.name} className="h-12 w-12 rounded-full object-cover ring-2 ring-border shrink-0" />
              ) : (
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white font-bold text-lg ${avatarBg}`}>
                  {(room.name || '?').charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <DialogTitle className="text-left">{room.name}</DialogTitle>
                <DialogDescription className="text-left">View and edit chat room details</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="details" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Details
              </TabsTrigger>
              <TabsTrigger value="members" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Members ({room.memberCount || 0})
              </TabsTrigger>
              <TabsTrigger value="messages" className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Messages
              </TabsTrigger>
              <TabsTrigger value="stats" className="flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Stats
              </TabsTrigger>
            </TabsList>

            {/* Details Tab */}
            <TabsContent value="details" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Room Name *</Label>
                <Input
                  id="edit-name"
                  placeholder="e.g., Paris Travel Group"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  placeholder="Brief description of the chat room..."
                  value={formData.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-type">Room Type *</Label>
                  <Select value={formData.type} onValueChange={(value) => handleChange('type', value)}>
                    <SelectTrigger id="edit-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="public">Public</SelectItem>
                      <SelectItem value="private">Private</SelectItem>
                      <SelectItem value="premium">Premium</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-maxMembers">Max Members</Label>
                  <Input
                    id="edit-maxMembers"
                    type="number"
                    min="1"
                    placeholder="1000"
                    value={formData.maxMembers}
                    onChange={(e) => handleChange('maxMembers', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-country">Country</Label>
                  <Input
                    id="edit-country"
                    placeholder="e.g., France"
                    value={formData.country}
                    onChange={(e) => handleChange('country', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-city">City</Label>
                  <Input
                    id="edit-city"
                    placeholder="e.g., Paris"
                    value={formData.city}
                    onChange={(e) => handleChange('city', e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="edit-isActive">Active Status</Label>
                  <p className="text-sm text-muted-foreground">
                    {formData.isActive ? 'Room is active and accepting members' : 'Room is inactive and hidden'}
                  </p>
                </div>
                <Switch
                  id="edit-isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) => handleChange('isActive', checked)}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                  Cancel
                </Button>
                <Button onClick={handleUpdate} disabled={loading}>
                  {loading ? 'Updating...' : 'Update Room'}
                </Button>
              </div>
            </TabsContent>

            {/* Members Tab */}
            <TabsContent value="members" className="space-y-4 mt-4">
              {visitedTabs.has('members') && <>
              {loadingMembers ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">Loading members...</p>
                </div>
              ) : members.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No members in this room yet</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-100 overflow-y-auto">
                  {members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between rounded-lg border border-border p-3"
                    >
                      <div className="flex items-center gap-3">
                        {member.avatar ? (
                          <img
                            src={member.avatar}
                            alt={member.displayName}
                            className="h-10 w-10 rounded-full"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                            <span className="text-sm font-medium">
                              {member.displayName === member.id ? '?' : (member.displayName?.charAt(0)?.toUpperCase() || '?')}
                            </span>
                          </div>
                        )}
                        <div>
                          {member.displayName === member.id ? (
                            // Name not resolved — show truncated UID in mono
                            <>
                              <p className="font-medium text-sm text-muted-foreground italic">Unknown user</p>
                              <p className="text-[10px] font-mono text-muted-foreground/60 truncate max-w-48" title={member.id}>{member.id}</p>
                            </>
                          ) : (
                            <>
                              <p className="font-medium text-sm">{member.displayName}</p>
                              <p className="text-[10px] font-mono text-muted-foreground/50 truncate max-w-48" title={member.id}>{member.id}</p>
                            </>
                          )}
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          member.role === 'admin'
                            ? 'bg-purple-500/10 text-purple-500'
                            : member.role === 'moderator'
                              ? 'bg-blue-500/10 text-blue-500'
                              : 'bg-gray-500/10 text-gray-500'
                        }`}
                      >
                        {member.role}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              </>}
            </TabsContent>

            {/* Messages Tab */}
            <TabsContent value="messages" className="space-y-3 mt-4">
              {visitedTabs.has('messages') && <>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {loadingMessages ? 'Loading…' : messages.length > 0 ? `${messages.length} messages (newest first)` : 'Messages'}
                </p>
                <Button variant="ghost" size="sm" onClick={fetchMessages} disabled={loadingMessages} className="h-7 w-7 p-0">
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingMessages ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              {loadingMessages ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                  <RefreshCw className="h-6 w-6 animate-spin" />
                  <p className="text-sm">Loading messages...</p>
                </div>
              ) : messagesError ? (
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-center">
                  <p className="text-sm text-red-500 font-medium">Failed to load messages</p>
                  <p className="text-xs text-muted-foreground mt-1">{messagesError}</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={fetchMessages}>Retry</Button>
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>No messages in this room yet</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-100 overflow-y-auto pr-1">
                  {messages.map((msg) => (
                    <div key={msg.id} className="flex items-start gap-3 rounded-lg border border-border p-3 bg-card">
                      {/* Avatar */}
                      {msg.photoURL ? (
                        <img src={msg.photoURL} alt={msg.username} className="h-8 w-8 rounded-full shrink-0 object-cover" />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <span className="text-xs font-medium">{(msg.username || 'U').charAt(0).toUpperCase()}</span>
                        </div>
                      )}
                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-sm font-semibold truncate max-w-40">{msg.username || 'Unknown'}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {msg.timestamp ? new Date(msg.timestamp).toLocaleString() : ''}
                          </span>
                        </div>
                        {msg.attachment ? (
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                            {msg.attachment.type === 'voice' ? (
                              <><Mic className="h-3.5 w-3.5" /> Voice message</>
                            ) : (
                              <><Paperclip className="h-3.5 w-3.5" />{msg.attachment.name || 'Attachment'}</>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-foreground mt-0.5 wrap-break-word">
                            {msg.text}
                            {msg.edited && <span className="ml-1.5 text-[10px] text-muted-foreground/70 italic">(edited)</span>}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              </>}
            </TabsContent>

            {/* Statistics Tab */}
            <TabsContent value="stats" className="space-y-4 mt-4">
              {visitedTabs.has('stats') && <>
              {/* Room images */}
              {(iconUrl || (room.backgroundImage?.url)) && (
                <div className="rounded-lg border border-border p-4 space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Room Images</p>
                  <div className="flex items-center gap-4">
                    {iconUrl && (
                      <div className="space-y-1 text-center">
                        <img src={iconUrl} alt="icon" className="h-16 w-16 rounded-full object-cover ring-2 ring-border mx-auto" />
                        <p className="text-xs text-muted-foreground">Icon</p>
                      </div>
                    )}
                    {room.backgroundImage?.url && (
                      <div className="space-y-1 flex-1">
                        <img src={room.backgroundImage.url} alt="background" className="h-16 w-full rounded-lg object-cover ring-2 ring-border" />
                        <p className="text-xs text-muted-foreground">Background</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Core stats grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border p-4">
                  <p className="text-xs text-muted-foreground">Total Members</p>
                  <p className="text-2xl font-bold mt-1">{room.memberCount || 0}</p>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <p className="text-xs text-muted-foreground">Total Messages</p>
                  <p className="text-2xl font-bold mt-1">{room.messageCount || 0}</p>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <p className="text-xs text-muted-foreground">Room Type</p>
                  <div className="mt-2">
                    {room.type === 'private' ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-400/30 bg-orange-500/10 px-3 py-1 text-sm font-semibold text-orange-500">
                        <Lock className="h-4 w-4" /> Private
                      </span>
                    ) : room.type === 'premium' ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-400/30 bg-purple-500/10 px-3 py-1 text-sm font-semibold text-purple-500">
                        <Crown className="h-4 w-4" /> Premium
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1 text-sm font-semibold text-blue-500">
                        <Globe className="h-4 w-4" /> Public
                      </span>
                    )}
                  </div>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <p className="text-xs text-muted-foreground">Max Capacity</p>
                  <p className="text-base font-semibold mt-1">{room.maxMembers || 1000}</p>
                </div>
              </div>

              {/* Capacity bar */}
              <div className="rounded-lg border border-border p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> Capacity Used
                  </p>
                  <span className={`text-sm font-semibold ${
                    (room.capacityPercent ?? Math.round(((room.memberCount || 0) / (room.maxMembers || 1000)) * 100)) >= 90 ? 'text-red-500' :
                    (room.capacityPercent ?? Math.round(((room.memberCount || 0) / (room.maxMembers || 1000)) * 100)) >= 70 ? 'text-amber-500' : 'text-green-500'
                  }`}>
                    {room.capacityPercent ?? Math.round(((room.memberCount || 0) / (room.maxMembers || 1000)) * 100)}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      (room.capacityPercent ?? 0) >= 90 ? 'bg-red-500' :
                      (room.capacityPercent ?? 0) >= 70 ? 'bg-amber-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(room.capacityPercent ?? Math.round(((room.memberCount || 0) / (room.maxMembers || 1000)) * 100), 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{room.memberCount || 0} of {room.maxMembers || 1000} slots filled</p>
              </div>

              {/* Subscription & Status */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border p-4">
                  <p className="text-xs text-muted-foreground mb-1">Status</p>
                  {room.isActive ? (
                    <span className="inline-flex items-center gap-1 text-green-500 font-medium text-sm">
                      <span className="h-2 w-2 rounded-full bg-green-500 inline-block" /> Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-red-500 font-medium text-sm">
                      <span className="h-2 w-2 rounded-full bg-red-500 inline-block" /> Inactive
                    </span>
                  )}
                </div>
                <div className="rounded-lg border border-border p-4">
                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <Shield className="h-3.5 w-3.5" /> Subscription
                  </p>
                  <span className={`text-sm font-medium ${
                    room.subscriptionRequired ? 'text-amber-500' : 'text-muted-foreground'
                  }`}>
                    {room.subscriptionRequired ? 'Required' : 'Not required'}
                  </span>
                </div>
              </div>

              {/* Timestamps */}
              <div className="rounded-lg border border-border p-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Timestamps</p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Created</span>
                    <span>{room.createdAt ? new Date(room.createdAt).toLocaleString() : 'Unknown'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last Updated</span>
                    <span>{room.updatedAt ? new Date(room.updatedAt).toLocaleString() : 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" /> Last Activity
                    </span>
                    <span>{room.lastActivity ? new Date(room.lastActivity).toLocaleString() : 'No activity yet'}</span>
                  </div>
                </div>
              </div>

              {/* Last Message */}
              {room.lastMessage?.text && (
                <div className="rounded-lg border border-border p-4">
                  <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5" /> Last Message
                  </p>
                  <p className="text-sm">{room.lastMessage.text}</p>
                  {room.lastMessage.senderName && (
                    <p className="text-xs text-muted-foreground mt-1">— {room.lastMessage.senderName}</p>
                  )}
                </div>
              )}

              {/* Tags */}
              {Array.isArray(room.tags) && room.tags.length > 0 && (
                <div className="rounded-lg border border-border p-4">
                  <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                    <Tag className="h-3.5 w-3.5" /> Tags
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {room.tags.map((tag: string, i: number) => (
                      <span key={i} className="rounded-full bg-secondary px-2.5 py-1 text-xs">{tag}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Room ID */}
              <div className="rounded-lg border border-border p-4">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Hash className="h-3.5 w-3.5" /> Room ID
                </p>
                <p className="text-xs font-mono wrap-anywhere text-muted-foreground">{room.id}</p>
              </div>
              </>}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    );
  }
);

ChatRoomActionsDialog.displayName = 'ChatRoomActionsDialog';
