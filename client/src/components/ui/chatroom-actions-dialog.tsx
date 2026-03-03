import { memo, useState, useCallback, useEffect } from 'react';
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
import { adminAPI } from '@/lib/api';
import { Users, Settings, Activity } from 'lucide-react';

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
    const [formData, setFormData] = useState({
      name: '',
      description: '',
      type: 'public',
      country: '',
      city: '',
      maxMembers: '1000',
      isActive: true,
    });

    useEffect(() => {
      if (room) {
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
    }, [room]);

    const fetchMembers = useCallback(async () => {
      if (!room?.id) return;
      
      setLoadingMembers(true);
      try {
        const response = await adminAPI.getRoomMembers(room.id);
        setMembers(response.data.data.members);
      } catch (error) {
        console.error('Failed to fetch members:', error);
      } finally {
        setLoadingMembers(false);
      }
    }, [room?.id]);

    useEffect(() => {
      if (activeTab === 'members') {
        fetchMembers();
      }
    }, [activeTab, fetchMembers]);

    const handleChange = useCallback((field: string, value: string | boolean) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    }, []);

    const handleUpdate = useCallback(async () => {
      if (!room?.id) return;

      setLoading(true);
      try {
        const destination = {
          country: formData.country || null,
          city: formData.city || null,
          region: null,
        };

        await adminAPI.updateChatRoom(room.id, {
          name: formData.name,
          description: formData.description,
          type: formData.type,
          destination,
          maxMembers: parseInt(formData.maxMembers) || 1000,
          isActive: formData.isActive,
        });

        onRoomUpdated();
        onOpenChange(false);
      } catch (error: any) {
        console.error('Failed to update room:', error);
        alert(error.response?.data?.message || 'Failed to update room. Please try again.');
      } finally {
        setLoading(false);
      }
    }, [room?.id, formData, onRoomUpdated, onOpenChange]);

    if (!room) return null;

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Chat Room</DialogTitle>
            <DialogDescription>View and edit chat room details</DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="details" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Details
              </TabsTrigger>
              <TabsTrigger value="members" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Members ({room.memberCount || 0})
              </TabsTrigger>
              <TabsTrigger value="stats" className="flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Statistics
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
              {loadingMembers ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">Loading members...</p>
                </div>
              ) : members.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No members in this room yet</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
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
                              {member.displayName?.charAt(0)?.toUpperCase() || 'U'}
                            </span>
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-sm">{member.displayName || 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground">{member.email}</p>
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
            </TabsContent>

            {/* Statistics Tab */}
            <TabsContent value="stats" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-border p-4">
                  <p className="text-sm text-muted-foreground">Total Members</p>
                  <p className="text-2xl font-bold mt-1">{room.memberCount || 0}</p>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <p className="text-sm text-muted-foreground">Total Messages</p>
                  <p className="text-2xl font-bold mt-1">{room.messageCount || 0}</p>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <p className="text-sm text-muted-foreground">Room Type</p>
                  <p className="text-lg font-semibold mt-1 capitalize">{room.type}</p>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <p className="text-sm text-muted-foreground">Max Capacity</p>
                  <p className="text-lg font-semibold mt-1">{room.maxMembers || 1000}</p>
                </div>
              </div>
              <div className="rounded-lg border border-border p-4">
                <p className="text-sm text-muted-foreground mb-2">Created</p>
                <p className="text-sm">
                  {room.createdAt ? new Date(room.createdAt).toLocaleString() : 'Unknown'}
                </p>
              </div>
              <div className="rounded-lg border border-border p-4">
                <p className="text-sm text-muted-foreground mb-2">Last Activity</p>
                <p className="text-sm">
                  {room.lastActivity ? new Date(room.lastActivity).toLocaleString() : 'No activity yet'}
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    );
  }
);

ChatRoomActionsDialog.displayName = 'ChatRoomActionsDialog';
