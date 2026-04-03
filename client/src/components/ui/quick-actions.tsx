import { memo, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Users, BarChart3, Download, Settings } from 'lucide-react';

interface QuickActionsProps {
  onAddUser: () => void;
  onExport: () => void;
  onSettings?: () => void;
  onViewChange?: (view: string) => void;
}

const actions = [
  {
    icon: Users,
    label: 'Add New User',
    color: 'blue',
    shortcut: 'Ctrl+N',
    action: 'addUser',
  },
  {
    icon: BarChart3,
    label: 'View Analytics',
    color: 'green',
    shortcut: 'Ctrl+A',
    action: 'analytics',
  },
  {
    icon: Download,
    label: 'Export Data',
    color: 'purple',
    shortcut: 'Ctrl+E',
    action: 'export',
  },
  {
    icon: Settings,
    label: 'System Settings',
    color: 'orange',
    shortcut: 'Ctrl+S',
    action: 'settings',
  },
];

const actionStyles: Record<string, { buttonClass: string; iconClass: string }> = {
  blue: {
    buttonClass: 'hover:border-blue-500/50 hover:bg-blue-500/10',
    iconClass: 'text-blue-500',
  },
  green: {
    buttonClass: 'hover:border-green-500/50 hover:bg-green-500/10',
    iconClass: 'text-green-500',
  },
  purple: {
    buttonClass: 'hover:border-purple-500/50 hover:bg-purple-500/10',
    iconClass: 'text-purple-500',
  },
  orange: {
    buttonClass: 'hover:border-orange-500/50 hover:bg-orange-500/10',
    iconClass: 'text-orange-500',
  },
};

export const QuickActions = memo(
  ({ onAddUser, onExport, onSettings, onViewChange }: QuickActionsProps) => {
    const handleAction = useCallback((action: string) => {
      switch (action) {
        case 'addUser':
          onAddUser();
          break;
        case 'analytics':
          // Navigate to analytics view
          if (onViewChange) {
            onViewChange('analytics');
          } else {
            // Fallback to scrolling
            const analyticsSection = document.querySelector('[class*="revenue"]') || 
                                    document.querySelector('[class*="chart"]');
            if (analyticsSection) {
              analyticsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }
          if ((process.env.NODE_ENV === "development")) {
            console.log('Navigating to analytics section');
          }
          break;
        case 'export':
          onExport();
          break;
        case 'settings':
          // Call the settings handler if provided
          if (onSettings) {
            onSettings();
          } else if (onViewChange) {
            onViewChange('settings');
          } else {
            // Fallback to scrolling behavior
            window.location.hash = 'settings';
            const settingsSection = document.getElementById('settings');
            if (settingsSection) {
              settingsSection.scrollIntoView({ behavior: 'smooth' });
            } else {
              alert('Settings: Configure dashboard preferences, notifications, and system options.');
            }
          }
          if ((process.env.NODE_ENV === "development")) {
            console.log('Navigating to settings');
          }
          break;
      }
    }, [onAddUser, onExport, onSettings, onViewChange]);

    useEffect(() => {
      const handleKeydown = (event: KeyboardEvent) => {
        if (!event.ctrlKey) return;

        const activeTag = (event.target as HTMLElement | null)?.tagName;
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

        const key = event.key.toLowerCase();
        if (key === 'n') {
          event.preventDefault();
          handleAction('addUser');
        } else if (key === 'a') {
          event.preventDefault();
          handleAction('analytics');
        } else if (key === 'e') {
          event.preventDefault();
          handleAction('export');
        } else if (key === 's') {
          event.preventDefault();
          handleAction('settings');
        }
      };

      window.addEventListener('keydown', handleKeydown);
      return () => window.removeEventListener('keydown', handleKeydown);
    }, [handleAction]);

    return (
      <div className="border-border bg-card/40 rounded-xl border p-6">
        <h3 className="mb-4 text-xl font-semibold">Quick Actions</h3>
        <div className="space-y-3">
          {actions.map((action) => {
            const Icon = action.icon;
            const styles = actionStyles[action.color] ?? actionStyles.blue;
            return (
              <motion.div
                key={action.label}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button
                  variant="outline"
                  className={`h-12 w-full justify-start transition-all duration-200 ${styles.buttonClass}`}
                  onClick={() => handleAction(action.action)}
                >
                  <Icon className={`mr-3 h-5 w-5 ${styles.iconClass}`} />
                  <span className="font-medium">{action.label}</span>
                  <div className="text-muted-foreground ml-auto text-xs">
                    {action.shortcut}
                  </div>
                </Button>
              </motion.div>
            );
          })}
        </div>
      </div>
    );
  },
);

QuickActions.displayName = 'QuickActions';

