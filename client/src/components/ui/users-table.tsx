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
  TrendingUp,
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
import { adminAPI } from '@/lib/api';
import { UserActionsDialog } from '@/components/ui/user-actions-dialog';

interface UsersTableProps {
  onAddUser: () => void;
  refreshTrigger?: number; // Add a prop to trigger refresh from parent
}

export const UsersTable = memo(({ onAddUser, refreshTrigger }: UsersTableProps) => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUserActions, setShowUserActions] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const usersPerPage = 10;

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getUsers({
        limit: usersPerPage,
        page: currentPage,
        search: searchQuery || undefined,
        role: roleFilter !== 'all' ? roleFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      });
      setUsers(response.data.data.users);
      setTotalPages(response.data.data.pagination.pages);
      setTotalUsers(response.data.data.pagination.total);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Failed to fetch users:', error);
      }
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchQuery, roleFilter, statusFilter, usersPerPage]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers, refreshTrigger]); // Add refreshTrigger to dependencies

  const handleUserClick = useCallback((user: any) => {
    setSelectedUser(user);
    setShowUserActions(true);
  }, []);

  const handleUserUpdated = useCallback(async () => {
    await fetchUsers();
  }, [fetchUsers]);

  const handleDeleteUser = useCallback(async (user: any) => {
    if (!confirm(`Are you sure you want to delete user "${user.displayName || user.email}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await adminAPI.deleteUser(user.id);
      await fetchUsers();
      if (import.meta.env.DEV) {
        console.log('User deleted:', user.id);
      }
    } catch (error: any) {
      console.error('Failed to delete user:', error);
      alert(error.response?.data?.message || 'Failed to delete user. Please try again.');
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
              {totalUsers} total users
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
      ) : (
        <>
          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {users.map((user, index) => (
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
                        src={user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || user.email)}`}
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

          {users.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg font-medium">No users found</p>
              <p className="text-sm mt-1">Try adjusting your filters</p>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
              <p className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
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
