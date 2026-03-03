import { memo, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
} from 'lucide-react';
import { adminAPI } from '@/lib/api';
import { AddChatRoomDialog } from '@/components/ui/add-chatroom-dialog';
import { ChatRoomActionsDialog } from '@/components/ui/chatroom-actions-dialog';

interface ChatRoomsTableProps {
  refreshTrigger?: number;
}

export const ChatRoomsTable = memo(({ refreshTrigger }: ChatRoomsTableProps) => {
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
  const roomsPerPage = 10;

  const fetchRooms = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {
        limit: roomsPerPage,
        page: currentPage,
        search: searchQuery || undefined,
        type: typeFilter !== 'all' ? typeFilter : undefined,
      };

      // Support both API styles: status=active/inactive OR isActive=true/false
      if (statusFilter !== 'all') {
        params.status = statusFilter;
        params.isActive = statusFilter === 'active';
      }

      const response = await adminAPI.getChatRooms(params);

      // Support multiple response shapes
      const root = response?.data ?? {};
      const payload = root?.data ?? root;

      const rawRooms =
        payload?.rooms ??
        payload?.chatRooms ??
        payload?.items ??
        [];

      const normalizedRooms = (Array.isArray(rawRooms) ? rawRooms : []).map((room: any) => ({
        ...room,
        id: room?.id ?? room?._id ?? room?.roomId,
        isActive:
          typeof room?.isActive === 'boolean'
            ? room.isActive
            : room?.status === 'active',
      }));

      const pagination = payload?.pagination ?? {};
      const pages = Number(pagination?.pages ?? pagination?.totalPages ?? 1);
      const total = Number(pagination?.total ?? normalizedRooms.length ?? 0);

      setRooms(normalizedRooms);
      setTotalPages(Number.isFinite(pages) && pages > 0 ? pages : 1);
      setTotalRooms(Number.isFinite(total) && total >= 0 ? total : normalizedRooms.length);

      if (import.meta.env.DEV) {
        console.log('Chat rooms loaded:', normalizedRooms.length, normalizedRooms);
      }
    } catch (error) {
      setRooms([]);
      setTotalPages(1);
      setTotalRooms(0);
      console.error('Failed to fetch chat rooms:', error);
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchQuery, typeFilter, statusFilter]);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms, refreshTrigger]);

  const handleRoomClick = useCallback((room: any) => {
    setSelectedRoom(room);
    setShowActionsDialog(true);
  }, []);

  const handleRoomUpdated = useCallback(async () => {
    await fetchRooms();
  }, [fetchRooms]);

  const handleDeleteRoom = useCallback(async (room: any) => {
    if (!confirm(`Are you sure you want to delete "${room.name}"? This will delete all messages in this room. This action cannot be undone.`)) {
      return;
    }

    try {
      await adminAPI.deleteChatRoom(room.id);
      await fetchRooms();
      if (import.meta.env.DEV) {
        console.log('Chat room deleted:', room.id);
      }
    } catch (error: any) {
      console.error('Failed to delete chat room:', error);
      alert(error.response?.data?.message || 'Failed to delete chat room. Please try again.');
    }
  }, [fetchRooms]);

  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  }, []);

  const handleRoleFilterChange = useCallback((value: string) => {
    setTypeFilter(value);
    setCurrentPage(1);
  }, []);

  const handleStatusFilterChange = useCallback((value: string) => {
    setStatusFilter(value);
    setCurrentPage(1);
  }, []);

  const handleRefresh = useCallback(() => {
    fetchRooms();
  }, [fetchRooms]);

  const handleAddRoom = useCallback(() => {
    setShowAddDialog(true);
  }, []);

  const handleRoomAdded = useCallback(() => {
    fetchRooms();
  }, [fetchRooms]);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'private':
        return <Lock className="h-3 w-3" />;
      case 'premium':
        return <Crown className="h-3 w-3" />;
      default:
        return <Globe className="h-3 w-3" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'private':
        return 'bg-orange-500/10 text-orange-500';
      case 'premium':
        return 'bg-purple-500/10 text-purple-500';
      default:
        return 'bg-blue-500/10 text-blue-500';
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-bold">Chat Rooms</h2>
          <p className="text-muted-foreground text-sm">
            {totalRooms} {totalRooms === 1 ? 'room' : 'rooms'} total
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleRefresh} variant="outline" size="sm" disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={handleAddRoom} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Room
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Search rooms..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={typeFilter} onValueChange={handleRoleFilterChange}>
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
        <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
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
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Loading chat rooms...</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {rooms.map((room) => (
                <motion.div
                  key={room.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="bg-card hover:bg-accent/50 flex flex-col gap-3 rounded-lg border border-border p-4 transition-colors sm:flex-row sm:items-center sm:gap-4"
                >
                  <div className="flex flex-1 items-start gap-3">
                    <div className="flex flex-col items-center gap-1">
                      <div className={`p-3 rounded-full ${getTypeColor(room.type)}`}>
                        {getTypeIcon(room.type)}
                      </div>
                      {room.isActive ? (
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                      ) : (
                        <XCircle className="h-3 w-3 text-red-500" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="truncate text-sm font-medium">{room.name}</h4>
                        <span className={`rounded-full px-2 py-1 text-xs font-medium ${getTypeColor(room.type)}`}>
                          {room.type}
                        </span>
                      </div>
                      <p className="text-muted-foreground text-xs mt-1 line-clamp-1">
                        {room.description || 'No description'}
                      </p>
                      <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-3 text-xs">
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          <span>{room.memberCount || 0} members</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          <span>{room.messageCount || 0} messages</span>
                        </div>
                        {(room.destination?.country || room.destination?.city) && (
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            <span>
                              {[room.destination.city, room.destination.country]
                                .filter(Boolean)
                                .join(', ')}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="ml-auto flex items-center gap-3">
                    <div className="text-muted-foreground flex items-center gap-1 text-xs">
                      <Calendar className="h-3 w-3" />
                      <span>{room.createdAt ? new Date(room.createdAt).toLocaleDateString() : 'N/A'}</span>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteRoom(room)}
                      className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>

                    <Button variant="ghost" size="sm" onClick={() => handleRoomClick(room)}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {rooms.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg font-medium">No chat rooms found</p>
              <p className="text-sm mt-1">Try adjusting your filters or create a new room</p>
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
