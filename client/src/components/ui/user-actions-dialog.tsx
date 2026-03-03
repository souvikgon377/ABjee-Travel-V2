import { memo, useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { adminAPI } from '@/lib/api';
import {
  User,
  Mail,
  MapPin,
  Phone,
  Shield,
  Ban,
  CheckCircle,
  History,
} from 'lucide-react';

interface UserActionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: any;
  onUserUpdated?: () => void;
}

export const UserActionsDialog = memo(
  ({ open, onOpenChange, user, onUserUpdated }: UserActionsDialogProps) => {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
      email: '',
      displayName: '',
      role: 'user',
      city: '',
      phoneNumber: '',
      isActive: true,
    });
    const [activityLog, setActivityLog] = useState<any[]>([]);

    const fetchActivityLog = useCallback(async () => {
      if (!user) return;
      try {
        const response = await adminAPI.getUserActivity(user.id);
        setActivityLog(response.data.data.activities || []);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Failed to fetch user activity:', error);
        }
      }
    }, [user]);

    useEffect(() => {
      if (user) {
        setFormData({
          email: user.email || '',
          displayName: user.displayName || '',
          role: user.role || 'user',
          city: user.city || '',
          phoneNumber: user.phoneNumber || '',
          isActive: user.isActive ?? true,
        });

        // Fetch user activity log
        fetchActivityLog();
      }
    }, [user, fetchActivityLog]);

    const handleUpdate = useCallback(async () => {
      setLoading(true);
      try {
        await adminAPI.updateUser(user.id, formData);
        
        onOpenChange(false);
        onUserUpdated?.();
        
        if (import.meta.env.DEV) {
          console.log('User updated successfully:', formData);
        }
      } catch (error: any) {
        console.error('Failed to update user:', error);
        alert(error.response?.data?.message || 'Failed to update user. Please try again.');
      } finally {
        setLoading(false);
      }
    }, [user, formData, onOpenChange, onUserUpdated]);

    const handleToggleStatus = useCallback(async () => {
      setLoading(true);
      try {
        await adminAPI.updateUser(user.id, {
          isActive: !formData.isActive,
        });
        
        setFormData((prev) => ({ ...prev, isActive: !prev.isActive }));
        onUserUpdated?.();
        
        if (import.meta.env.DEV) {
          console.log('User status toggled:', !formData.isActive);
        }
      } catch (error: any) {
        console.error('Failed to toggle user status:', error);
        alert(error.response?.data?.message || 'Failed to update user status.');
      } finally {
        setLoading(false);
      }
    }, [user, formData.isActive, onUserUpdated]);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      setFormData((prev) => ({
        ...prev,
        [e.target.name]: e.target.value,
      }));
    }, []);

    if (!user) return null;

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>User Management</DialogTitle>
            <DialogDescription>
              View and manage user information, role, and activity
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="profile" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="permissions">Permissions</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="space-y-4">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-email">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="edit-email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleChange}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="edit-displayName">Display Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="edit-displayName"
                      name="displayName"
                      type="text"
                      value={formData.displayName}
                      onChange={handleChange}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="edit-city">City</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="edit-city"
                      name="city"
                      type="text"
                      value={formData.city}
                      onChange={handleChange}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="edit-phoneNumber">Phone Number</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="edit-phoneNumber"
                      name="phoneNumber"
                      type="tel"
                      value={formData.phoneNumber}
                      onChange={handleChange}
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="permissions" className="space-y-4">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-role">User Role</Label>
                  <div className="relative">
                    <Shield className="absolute left-3 top-3 h-4 w-4 text-muted-foreground z-10" />
                    <Select
                      value={formData.role}
                      onValueChange={(value) =>
                        setFormData((prev) => ({ ...prev, role: value }))
                      }
                    >
                      <SelectTrigger className="pl-10">
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="moderator">Moderator</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formData.role === 'admin' &&
                      'Full access to all admin features'}
                    {formData.role === 'moderator' &&
                      'Can moderate content and manage users'}
                    {formData.role === 'user' && 'Standard user access'}
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label>Account Status</Label>
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="flex items-center gap-2">
                      {formData.isActive ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <Ban className="h-5 w-5 text-red-500" />
                      )}
                      <div>
                        <p className="text-sm font-medium">
                          {formData.isActive ? 'Active' : 'Suspended'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formData.isActive
                            ? 'User can access the platform'
                            : 'User cannot access the platform'}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant={formData.isActive ? 'destructive' : 'default'}
                      size="sm"
                      onClick={handleToggleStatus}
                      disabled={loading}
                    >
                      {formData.isActive ? 'Suspend' : 'Activate'}
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="activity" className="space-y-4">
              <div className="max-h-[300px] overflow-y-auto space-y-2">
                {activityLog.length > 0 ? (
                  activityLog.map((activity, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 rounded-lg border p-3"
                    >
                      <History className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{activity.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(activity.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No activity recorded yet</p>
                  </div>
                )}
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
            <Button onClick={handleUpdate} disabled={loading}>
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

UserActionsDialog.displayName = 'UserActionsDialog';
