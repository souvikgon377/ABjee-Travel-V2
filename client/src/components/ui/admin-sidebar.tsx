import { memo } from 'react';
import { useTheme } from '../mvpblocks/theme-provider';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  LayoutDashboard,
  Users,
  BarChart3,
  FileText,
  Activity,
  Database,
  Settings,
  Zap,
  Moon,
  Sun,
  Home,
  LogOut,
  MapPin,
  MessageSquare,
} from 'lucide-react';

const menuItems = [
  { title: 'Dashboard', icon: LayoutDashboard, view: 'dashboard' },
  { title: 'Users', icon: Users, view: 'users' },
  { title: 'About Page', icon: FileText, view: 'about-page' },
  { title: 'Analytics', icon: BarChart3, view: 'analytics' },
  { title: 'Bookings', icon: FileText, view: 'bookings' },
  { title: 'Activity', icon: Activity, view: 'activity' },
  { title: 'Chat Rooms', icon: Database, view: 'chatrooms' },
  { title: 'Tourist Places', icon: MapPin, view: 'tourist-places' },
  { title: 'Reviews & Comments', icon: MessageSquare, view: 'place-feedback' },
  { title: 'Revenue', icon: Zap, view: 'revenue' },
  { title: 'Settings', icon: Settings, view: 'settings' },
];

interface AdminSidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
}

export const AdminSidebar = memo(({ currentView, onViewChange }: AdminSidebarProps) => {
  const { theme, setTheme } = useTheme();
  const { userProfile, logout } = useAuth();
  const router = useRouter();
  const { isMobile, setOpenMobile, setOpen } = useSidebar();

  const closeSidebarOnSmallScreens = () => {
    if (isMobile) {
      setOpenMobile(false);
      return;
    }

    if (window.innerWidth < 1024) {
      setOpen(false);
    }
  };

  const handleViewChange = (view: string) => {
    onViewChange(view);
    closeSidebarOnSmallScreens();
  };

  const handleLogout = async () => {
    try {
      closeSidebarOnSmallScreens();
      await logout();
      router.push('/auth');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleBackToWebsite = () => {
    closeSidebarOnSmallScreens();
    router.push('/');
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" onClick={() => handleViewChange('dashboard')}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg overflow-hidden">
                <img src="/logo.jpg" alt="ABjee Travel" className="h-8 w-8 object-cover" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">ABjee Travel</span>
                <span className="truncate text-xs">Admin Dashboard</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="flex-1 overflow-y-auto py-2">
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentView === item.view;
                return (
                  <SidebarMenuItem key={item.view}>
                    <SidebarMenuButton 
                      onClick={() => handleViewChange(item.view)}
                      isActive={isActive}
                      className={isActive ? 'bg-accent' : ''}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="mt-auto border-t border-sidebar-border pt-2 pb-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => {
                setTheme(theme === 'dark' ? 'light' : 'dark');
                closeSidebarOnSmallScreens();
              }}
              className="w-full"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleBackToWebsite} className="w-full">
              <Home className="h-4 w-4" />
              <span>Back to Website</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout} className="w-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 hover:text-rose-700">
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
});

AdminSidebar.displayName = 'AdminSidebar';
