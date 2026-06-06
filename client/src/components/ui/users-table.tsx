import { memo, useState, useEffect, useCallback, useMemo } from 'react';
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
  Mail,
  MapPin,
  MoreHorizontal,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Trash2,
} from 'lucide-react';
import { collection, query, orderBy, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { firestoreDb } from '@/lib/firebaseFirestore';
import { UserActionsDialog } from '@/components/ui/user-actions-dialog';
import { resolveAvatarUrl } from '@/lib/avatar';
import { modernConfirm } from '@/lib/modernDialog';

const USERS_PER_PAGE = 10;

interface UsersTableProps {
  onAddUser: () => void;
  refreshTrigger?: number;
  /** Role filter driven externally from the header Filter button */
  externalRoleFilter?: string;
  /** Status filter driven externally from the header Filter button */
  externalStatusFilter?: string;
  externalSearchQuery?: string;
}

export const UsersTable = memo(({ onAddUser, refreshTrigger, externalRoleFilter, externalStatusFilter, externalSearchQuery }: UsersTableProps) => {
  const [_users, _setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUserActions, setShowUserActions] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (externalSearchQuery !== undefined) {
      setSearchQuery(externalSearchQuery);
      setCurrentPage(1);
    }
  }, [externalSearchQuery]);

  // Load all users from Firestore (same collection the Overview card reads)
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    try {
      let snap;
      try {
        snap = await getDocs(query(collection(firestoreDb, 'users'), orderBy('createdAt', 'desc')));
      } catch (err: any) {
        if (err?.code !== 'failed-precondition') throw err;
        snap = await getDocs(collection(firestoreDb, 'users'));
      }

      const docs: any[] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      docs.sort((a: any, b: any) => {
        const ta = a.createdAt?.toDate?.()?.getTime() ?? a.createdAt ?? 0;
        const tb = b.createdAt?.toDate?.()?.getTime() ?? b.createdAt ?? 0;
        return tb - ta;
      });
      setAllUsers(docs);
    } catch (err: any) {
      if ((process.env.NODE_ENV === "development")) console.error('Failed to fetch users:', err);
      setFetchError(
        err?.code === 'permission-denied'
          ? 'Access denied - update Firestore security rules to allow admin reads on the users collection.'
          : `Failed to load users: ${err?.message ?? err}`
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers, refreshTrigger]);

  // Sync both external filters in a single effect
  useEffect(() => {
    let changed = false;
    if (externalRoleFilter !== undefined && externalRoleFilter !== roleFilter) {
      setRoleFilter(externalRoleFilter);
      changed = true;
    }
    if (externalStatusFilter !== undefined && externalStatusFilter !== statusFilter) {
      setStatusFilter(externalStatusFilter);
      changed = true;
    }
    if (changed) setCurrentPage(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalRoleFilter, externalStatusFilter]);

  // Client-side filter + paginate — derived state via useMemo (no setState cascade)
  const { users: filteredUsers, totalUsers: filteredTotal, totalPages: filteredPages } = useMemo(() => {
    let filtered = allUsers;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (u) => u.displayName?.toLowerCase().includes(q) ||
               u.email?.toLowerCase().includes(q) ||
               u.username?.toLowerCase().includes(q)
      );
    }
    if (roleFilter !== 'all') filtered = filtered.filter((u) => u.role === roleFilter);
    if (statusFilter !== 'all')
      filtered = filtered.filter((u) =>
        statusFilter === 'active' ? u.isActive !== false : u.isActive === false
      );
    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / USERS_PER_PAGE));
    const page = filtered.slice((currentPage - 1) * USERS_PER_PAGE, currentPage * USERS_PER_PAGE);
    return { users: page, totalUsers: total, totalPages: pages };
  }, [allUsers, searchQuery, roleFilter, statusFilter, currentPage]);

  const handleUserClick = useCallback((user: any) => {
    setSelectedUser(user);
    setShowUserActions(true);
  }, []);

  const handleUserUpdated = useCallback(async () => {
    await fetchUsers();
  }, [fetchUsers]);

  const handleDeleteUser = useCallback(async (user: any) => {
    const confirmed = await modernConfirm(
      `Are you sure you want to delete user "${user.displayName || user.email}"? This action cannot be undone.`,
      {
        title: 'Delete User',
        confirmText: 'Delete',
        cancelText: 'Cancel',
        destructive: true,
      }
    );

    if (!confirmed)
      return;
    try {
      await deleteDoc(doc(firestoreDb, 'users', user.id));
      await fetchUsers();
      if ((process.env.NODE_ENV === "development")) console.log('User deleted:', user.id);
    } catch (err: any) {
      console.error('Failed to delete user:', err);
      alert('Failed to delete user. Please try again.');
    }
  }, [fetchUsers]);

  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
    setCurrentPage(1); // Reset to first page on search
  }, []);

  const handleRoleFilter = useCallback((value: string) => {
    setRoleFilter(value);
    setCurrentPage(1);
  }, []);

  const handleStatusFilter = useCallback((value: string) => {
    setStatusFilter(value);
    setCurrentPage(1);
  }, []);

  const handleRefresh = useCallback(() => {
    fetchUsers();
  }, [fetchUsers]);

  return (
    <div className="border-border bg-card/40 rounded-xl border p-3 sm:p-6">
      <div className="mb-6 flex flex-col justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold sm:text-xl">Users Management</h3>
            <p className="text-muted-foreground text-sm">
              {filteredTotal} total users
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="default" size="sm" onClick={onAddUser}>
              <Plus className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Add User</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select value={roleFilter} onValueChange={handleRoleFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="user">User</SelectItem>
              <SelectItem value="moderator">Moderator</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={handleStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto"></div>
          <p className="text-muted-foreground text-sm mt-3">Loading users...</p>
        </div>
      ) : fetchError ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          <p className="font-medium mb-1">Could not load users</p>
          <p className="text-xs opacity-80">{fetchError}</p>
          <button onClick={fetchUsers} className="mt-3 text-xs underline hover:no-underline">
            Try again
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {filteredUsers.map((user, index) => (
                <motion.div
                  key={user.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: index * 0.05 }}
                  className="group hover:bg-accent/50 flex flex-col items-start gap-4 rounded-lg p-4 transition-colors sm:flex-row sm:items-center"
                >
                  <div className="flex w-full items-center gap-4 sm:w-auto">
                    <div className="relative">
                      <img
                        src={resolveAvatarUrl(user as Record<string, unknown>) || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || user.email)}`}
                        alt={user.displayName || user.email}
                        width={40}
                        height={40}
                        className="rounded-full"
                      />
                      <div
                        className={`border-background absolute -right-1 -bottom-1 h-3 w-3 rounded-full border-2 ${
                          user.isActive ? 'bg-green-500' : 'bg-red-500'
                        }`}
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="truncate text-sm font-medium">{user.displayName || user.email}</h4>
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${
                            user.role === 'admin'
                              ? 'bg-purple-500/10 text-purple-500'
                              : user.role === 'moderator'
                                ? 'bg-blue-500/10 text-blue-500'
                                : 'bg-gray-500/10 text-gray-500'
                          }`}
                        >
                          {user.role}
                        </span>
                      </div>
                      <div className="text-muted-foreground mt-1 flex flex-col gap-2 text-xs sm:flex-row sm:items-center sm:gap-4">
                        <div className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          <span className="truncate">{user.email}</span>
                        </div>
                        {user.city && (
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            <span>{user.city}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="ml-auto flex items-center gap-3">
                    <div className="text-muted-foreground flex items-center gap-1 text-xs">
                      <Calendar className="h-3 w-3" />
                      <span>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}</span>
                    </div>

                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleDeleteUser(user)}
                      className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>

                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleUserClick(user)}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {filteredUsers.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg font-medium">No users found</p>
              <p className="text-sm mt-1">Try adjusting your filters</p>
            </div>
          )}

          {/* Pagination */}
          {filteredPages > 1 && (
            <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
              <p className="text-sm text-muted-foreground">
                Page {currentPage} of {filteredPages}
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
                  onClick={() => setCurrentPage((p) => Math.min(filteredPages, p + 1))}
                  disabled={currentPage === filteredPages || loading}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <UserActionsDialog
        open={showUserActions}
        onOpenChange={setShowUserActions}
        user={selectedUser}
        onUserUpdated={handleUserUpdated}
      />
    </div>
  );
});

UsersTable.displayName = 'UsersTable';

