import { memo, useState, useCallback } from 'react';
import { ref, push, set } from 'firebase/database';
import { database } from '@/lib/firebase';
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

interface AddChatRoomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRoomAdded: () => void;
}

export const AddChatRoomDialog = memo(({ open, onOpenChange, onRoomAdded }: AddChatRoomDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'public',
    visibility: 'private',
    country: '',
    city: '',
    maxMembers: '1000',
  });

  const handleChange = useCallback((field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleTypeChange = useCallback((value: string) => {
    setFormData((prev) => ({
      ...prev,
      type: value,
      visibility: value === 'private' ? prev.visibility : 'private',
    }));
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);

      try {
        const destination = {
          country: formData.country || null,
          city: formData.city || null,
          region: null,
        };

        // Write directly to RTDB
        const roomsRef = ref(database, 'chatrooms');
        const newRoomRef = push(roomsRef);
        await set(newRoomRef, {
          name: formData.name,
          description: formData.description || '',
          type: formData.type,
          isPublic: formData.type === 'public',
          ...(formData.type === 'private' ? { visibility: formData.visibility } : {}),
          destination,
          maxMembers: parseInt(formData.maxMembers) || 1000,
          isActive: true,
          participants: [],
          members: {},
          messageCount: 0,
          subscriptionRequired: false,
          tags: [],
          rules: [],
          lastMessage: null,
          avatar: null,
          iconImage: null,
          backgroundImage: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastActivity: new Date().toISOString(),
        });

        // Reset form
        setFormData({
          name: '',
          description: '',
          type: 'public',
          visibility: 'private',
          country: '',
          city: '',
          maxMembers: '1000',
        });

        onRoomAdded();
        onOpenChange(false);
      } catch (error: any) {
        console.error('Failed to create chat community:', error);
        alert('Failed to create chat community. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    [formData, onRoomAdded, onOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-125">
        <DialogHeader>
          <DialogTitle>Create New Chat Community</DialogTitle>
          <DialogDescription>Add a new chat community for users to join and communicate.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Community Name *</Label>
            <Input
              id="name"
              placeholder="e.g., Paris Travel Group"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Brief description of the chat community..."
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">Community Type *</Label>
              <Select value={formData.type} onValueChange={handleTypeChange}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">General</SelectItem>
                  <SelectItem value="private">Private</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxMembers">Max Members</Label>
              <Input
                id="maxMembers"
                type="number"
                min="1"
                placeholder="1000"
                value={formData.maxMembers}
                onChange={(e) => handleChange('maxMembers', e.target.value)}
              />
            </div>
          </div>

          {formData.type === 'private' && (
            <div className="space-y-2">
              <Label htmlFor="visibility">Private Visibility *</Label>
              <Select value={formData.visibility} onValueChange={(value) => handleChange('visibility', value)}>
                <SelectTrigger id="visibility">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="exposed">Exposed</SelectItem>
                  <SelectItem value="private">Private</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                placeholder="e.g., France"
                value={formData.country}
                onChange={(e) => handleChange('country', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                placeholder="e.g., Paris"
                value={formData.city}
                onChange={(e) => handleChange('city', e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Community'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
});

AddChatRoomDialog.displayName = 'AddChatRoomDialog';
