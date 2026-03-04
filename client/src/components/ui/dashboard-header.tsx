import { memo, useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Bell,
  Search,
  Filter,
  Download,
  RefreshCw,
  MoreHorizontal,
  X,
} from 'lucide-react';

export interface DashboardFilters {
  dateRange: '7d' | '30d' | '90d' | '1y' | 'all';
  userRole: 'all' | 'user' | 'admin' | 'moderator';
  userStatus: 'all' | 'active' | 'inactive';
  roomType: 'all' | 'public' | 'private';
}

export const DEFAULT_FILTERS: DashboardFilters = {
  dateRange: 'all',
  userRole: 'all',
  userStatus: 'all',
  roomType: 'all',
};

interface DashboardHeaderProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  onExport: () => void;
  isRefreshing: boolean;
  currentView: string;
  activeFilters: DashboardFilters;
  onFilterChange: (filters: DashboardFilters) => void;
}

function countActiveFilters(f: DashboardFilters, view: string): number {
  let count = 0;
  if (view === 'users') {
    if (f.userRole !== 'all') count++;
    if (f.userStatus !== 'all') count++;
  } else if (view === 'chatrooms') {
    if (f.roomType !== 'all') count++;
  } else {
    if (f.dateRange !== 'all') count++;
  }
  return count;
}

export const DashboardHeader = memo(
  ({
    searchQuery,
    onSearchChange,
    onRefresh,
    onExport,
    isRefreshing,
    currentView,
    activeFilters,
    onFilterChange,
  }: DashboardHeaderProps) => {
    const [open, setOpen] = useState(false);
    const activeCount = countActiveFilters(activeFilters, currentView);

    const resetFilters = () => onFilterChange(DEFAULT_FILTERS);

    const FilterPopoverContent = () => (
      <div className="w-72 space-y-4 p-1">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Filters</p>
          {activeCount > 0 && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" /> Clear all
            </button>
          )}
        </div>

        {/* Dashboard / Analytics: Date Range */}
        {(currentView === 'dashboard' || currentView === 'analytics' || currentView === 'activity') && (
          <div className="space-y-1.5">
            <Label className="text-xs">Date Range</Label>
            <Select
              value={activeFilters.dateRange}
              onValueChange={(v) =>
                onFilterChange({ ...activeFilters, dateRange: v as DashboardFilters['dateRange'] })
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
                <SelectItem value="1y">Last year</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Users: Role + Status */}
        {currentView === 'users' && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Role</Label>
              <Select
                value={activeFilters.userRole}
                onValueChange={(v) =>
                  onFilterChange({ ...activeFilters, userRole: v as DashboardFilters['userRole'] })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="moderator">Moderator</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select
                value={activeFilters.userStatus}
                onValueChange={(v) =>
                  onFilterChange({ ...activeFilters, userStatus: v as DashboardFilters['userStatus'] })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {/* Chatrooms: Room Type */}
        {currentView === 'chatrooms' && (
          <div className="space-y-1.5">
            <Label className="text-xs">Room Type</Label>
            <Select
              value={activeFilters.roomType}
              onValueChange={(v) =>
                onFilterChange({ ...activeFilters, roomType: v as DashboardFilters['roomType'] })
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="private">Private</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    );

    return (
      <header className="bg-background/95 sticky top-0 z-50 flex h-16 w-full shrink-0 items-center gap-2 border-b backdrop-blur transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
        <div className="flex items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink href="/admin">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage className="capitalize">
                  {currentView === 'dashboard' ? 'Overview' : currentView}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        <div className="ml-auto flex items-center gap-2 px-4">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2"
          >
            {/* Search Input */}
            <div className="relative hidden md:block">
              <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-64 pl-10"
              />
            </div>

            {/* Desktop Actions */}
            <div className="hidden items-center gap-2 md:flex">
              <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                  <Button variant={activeCount > 0 ? 'default' : 'outline'} size="sm" className="relative">
                    <Filter className="mr-2 h-4 w-4" />
                    Filter
                    {activeCount > 0 && (
                      <Badge className="ml-2 h-4 min-w-4 rounded-full px-1 text-[10px]">
                        {activeCount}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="p-3">
                  <FilterPopoverContent />
                </PopoverContent>
              </Popover>

              <Button variant="outline" size="sm" onClick={onExport}>
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
                />
                Refresh
              </Button>
            </div>

            {/* Mobile Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild className="md:hidden">
                <Button variant="outline" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => {
                  const input = prompt('Search dashboard:');
                  if (input) onSearchChange(input);
                }}>
                  <Search className="mr-2 h-4 w-4" />
                  Search
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setOpen(true)}>
                  <Filter className="mr-2 h-4 w-4" />
                  Filter {activeCount > 0 && `(${activeCount})`}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onExport}>
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onRefresh}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="outline" size="sm">
              <Bell className="h-4 w-4" />
            </Button>
          </motion.div>
        </div>
      </header>
    );
  },
);

DashboardHeader.displayName = 'DashboardHeader';
