import { memo } from 'react';
import { useTheme } from '../mvpblocks/theme-provider';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
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
} from 'lucide-react';

const menuItems = [
  { title: 'Dashboard', icon: LayoutDashboard, view: 'dashboard' },
  { title: 'Users', icon: Users, view: 'users' },
  { title: 'Analytics', icon: BarChart3, view: 'analytics' },
  { title: 'Bookings', icon: FileText, view: 'bookings' },
  { title: 'Activity', icon: Activity, view: 'activity' },
  { title: 'Chat Rooms', icon: Database, view: 'chatrooms' },
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
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/auth');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleBackToWebsite = () => {
    navigate('/');
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" onClick={() => onViewChange('dashboard')}>
              <div className="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                <LayoutDashboard className="h-5 w-5" />
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
                      onClick={() => onViewChange(item.view)}
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
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
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
