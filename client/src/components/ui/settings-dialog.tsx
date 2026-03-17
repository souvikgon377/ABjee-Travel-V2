import { memo, useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  Settings,
  Bell,
  Database,
  Mail,
  Shield,
  Clock,
} from 'lucide-react';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SettingsDialog = memo(
  ({ open, onOpenChange }: SettingsDialogProps) => {
    const [loading, setLoading] = useState(false);
    const [settings, setSettings] = useState({
      // General settings
      siteName: 'ABjee Travel',
      siteDescription: 'Your travel companion',
      maintenanceMode: false,
      
      // Notification settings
      emailNotifications: true,
      pushNotifications: true,
      newUserNotification: true,
      bookingNotification: true,
      
      // Database settings
      autoBackup: true,
      backupFrequency: 'daily',
      retentionDays: '30',
      
      // Security settings
      twoFactorAuth: false,
      sessionTimeout: '30',
      maxLoginAttempts: '5',
    });

    const handleSaveSettings = useCallback(async () => {
      setLoading(true);
      try {
        // Here you would call an API to save settings
        // await adminAPI.updateSettings(settings);
        
        // Simulate API call
        await new Promise((resolve) => setTimeout(resolve, 1000));
        
        onOpenChange(false);
        
        if ((process.env.NODE_ENV === "development")) {
          console.log('Settings saved:', settings);
        }
        
        alert('Settings saved successfully!');
      } catch (error) {
        console.error('Failed to save settings:', error);
        alert('Failed to save settings. Please try again.');
      } finally {
        setLoading(false);
      }
    }, [settings, onOpenChange]);

    const handleToggle = useCallback((key: string) => {
      setSettings((prev) => ({
        ...prev,
        [key]: !prev[key as keyof typeof prev],
      }));
    }, []);

    const handleChange = useCallback((key: string, value: string) => {
      setSettings((prev) => ({
        ...prev,
        [key]: value,
      }));
    }, []);

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              System Settings
            </DialogTitle>
            <DialogDescription>
              Configure platform settings, notifications, and preferences
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="general" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="notifications">Notifications</TabsTrigger>
              <TabsTrigger value="database">Database</TabsTrigger>
              <TabsTrigger value="security">Security</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-4">
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="siteName">Site Name</Label>
                  <Input
                    id="siteName"
                    value={settings.siteName}
                    onChange={(e) => handleChange('siteName', e.target.value)}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="siteDescription">Site Description</Label>
                  <Input
                    id="siteDescription"
                    value={settings.siteDescription}
                    onChange={(e) =>
                      handleChange('siteDescription', e.target.value)
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label>Maintenance Mode</Label>
                    <p className="text-xs text-muted-foreground">
                      Temporarily disable site access for maintenance
                    </p>
                  </div>
                  <Switch
                    checked={settings.maintenanceMode}
                    onCheckedChange={() => handleToggle('maintenanceMode')}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="notifications" className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <Bell className="h-4 w-4" />
                  <span>Configure notification preferences</span>
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label>Email Notifications</Label>
                    <p className="text-xs text-muted-foreground">
                      Receive notifications via email
                    </p>
                  </div>
                  <Switch
                    checked={settings.emailNotifications}
                    onCheckedChange={() => handleToggle('emailNotifications')}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label>Push Notifications</Label>
                    <p className="text-xs text-muted-foreground">
                      Receive browser push notifications
                    </p>
                  </div>
                  <Switch
                    checked={settings.pushNotifications}
                    onCheckedChange={() => handleToggle('pushNotifications')}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label>New User Notifications</Label>
                    <p className="text-xs text-muted-foreground">
                      Get notified when new users register
                    </p>
                  </div>
                  <Switch
                    checked={settings.newUserNotification}
                    onCheckedChange={() => handleToggle('newUserNotification')}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label>Booking Notifications</Label>
                    <p className="text-xs text-muted-foreground">
                      Get notified when new bookings are made
                    </p>
                  </div>
                  <Switch
                    checked={settings.bookingNotification}
                    onCheckedChange={() => handleToggle('bookingNotification')}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="database" className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <Database className="h-4 w-4" />
                  <span>Database backup and maintenance</span>
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label>Automatic Backup</Label>
                    <p className="text-xs text-muted-foreground">
                      Enable automatic database backups
                    </p>
                  </div>
                  <Switch
                    checked={settings.autoBackup}
                    onCheckedChange={() => handleToggle('autoBackup')}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="backupFrequency">Backup Frequency</Label>
                  <Select
                    value={settings.backupFrequency}
                    onValueChange={(value) =>
                      handleChange('backupFrequency', value)
                    }
                    disabled={!settings.autoBackup}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">Hourly</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="retentionDays">Retention Period (days)</Label>
                  <Input
                    id="retentionDays"
                    type="number"
                    value={settings.retentionDays}
                    onChange={(e) =>
                      handleChange('retentionDays', e.target.value)
                    }
                    disabled={!settings.autoBackup}
                  />
                  <p className="text-xs text-muted-foreground">
                    Number of days to keep backup files
                  </p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="security" className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <Shield className="h-4 w-4" />
                  <span>Security and authentication settings</span>
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label>Two-Factor Authentication</Label>
                    <p className="text-xs text-muted-foreground">
                      Require 2FA for admin accounts
                    </p>
                  </div>
                  <Switch
                    checked={settings.twoFactorAuth}
                    onCheckedChange={() => handleToggle('twoFactorAuth')}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="sessionTimeout">
                    Session Timeout (minutes)
                  </Label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="sessionTimeout"
                      type="number"
                      value={settings.sessionTimeout}
                      onChange={(e) =>
                        handleChange('sessionTimeout', e.target.value)
                      }
                      className="pl-10"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Auto-logout inactive users after this duration
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="maxLoginAttempts">Max Login Attempts</Label>
                  <Input
                    id="maxLoginAttempts"
                    type="number"
                    value={settings.maxLoginAttempts}
                    onChange={(e) =>
                      handleChange('maxLoginAttempts', e.target.value)
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Lock account after this many failed login attempts
                  </p>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveSettings} disabled={loading}>
              {loading ? 'Saving...' : 'Save Settings'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

SettingsDialog.displayName = 'SettingsDialog';

