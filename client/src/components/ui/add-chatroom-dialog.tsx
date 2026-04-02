import { memo, useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ref, push, set } from 'firebase/database';
import { database } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { getSubscriptionInfo, hasPaidAccess } from '@/lib/subscriptionPolicy';
import { uploadImageToR2, createImagePreview, revokeImagePreview, type ImageUploadResult } from '@/lib/r2Upload';
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
import { Image as ImageIcon, Upload, X, Sparkles } from 'lucide-react';

interface AddChatRoomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRoomAdded: () => void;
}

export const AddChatRoomDialog = memo(({ open, onOpenChange, onRoomAdded }: AddChatRoomDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [uploadingBackground, setUploadingBackground] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [backgroundImagePreview, setBackgroundImagePreview] = useState<string | null>(null);
  const [iconImagePreview, setIconImagePreview] = useState<string | null>(null);
  const [backgroundImageData, setBackgroundImageData] = useState<ImageUploadResult | null>(null);
  const [iconImageData, setIconImageData] = useState<ImageUploadResult | null>(null);
  const { userProfile } = useAuth();
  const router = useRouter();
  const subscriptionInfo = useMemo(() => getSubscriptionInfo(userProfile), [userProfile]);
  const paidMember = useMemo(() => hasPaidAccess(subscriptionInfo), [subscriptionInfo]);
  const isAdminOrOwner = useMemo(() => {
    const role = typeof userProfile?.role === 'string' ? userProfile.role.toLowerCase() : '';
    return role === 'admin' || role === 'owner';
  }, [userProfile?.role]);
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

  const handleBackgroundImageChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const preview = createImagePreview(file);
      setBackgroundImagePreview(preview);
      setUploadingBackground(true);
      const result = await uploadImageToR2(file, {
        folder: 'chat-rooms/backgrounds',
      });
      setBackgroundImageData(result);
    } catch (error: any) {
      alert(error.message || 'Failed to upload background image');
      if (backgroundImagePreview) {
        revokeImagePreview(backgroundImagePreview);
        setBackgroundImagePreview(null);
      }
      setBackgroundImageData(null);
    } finally {
      setUploadingBackground(false);
      e.target.value = '';
    }
  }, [backgroundImagePreview]);

  const handleIconImageChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const preview = createImagePreview(file);
      setIconImagePreview(preview);
      setUploadingIcon(true);
      const result = await uploadImageToR2(file, {
        folder: 'chat-rooms/icons',
      });
      setIconImageData(result);
    } catch (error: any) {
      alert(error.message || 'Failed to upload icon image');
      if (iconImagePreview) {
        revokeImagePreview(iconImagePreview);
        setIconImagePreview(null);
      }
      setIconImageData(null);
    } finally {
      setUploadingIcon(false);
      e.target.value = '';
    }
  }, [iconImagePreview]);

  const removeBackgroundImage = useCallback(() => {
    if (backgroundImagePreview) {
      revokeImagePreview(backgroundImagePreview);
    }
    setBackgroundImagePreview(null);
    setBackgroundImageData(null);
  }, [backgroundImagePreview]);

  const removeIconImage = useCallback(() => {
    if (iconImagePreview) {
      revokeImagePreview(iconImagePreview);
    }
    setIconImagePreview(null);
    setIconImageData(null);
  }, [iconImagePreview]);

  const resetImages = useCallback(() => {
    removeBackgroundImage();
    removeIconImage();
  }, [removeBackgroundImage, removeIconImage]);

  useEffect(() => {
    if (!open) {
      resetImages();
    }
  }, [open, resetImages]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);

      if (formData.type !== 'public' && !isAdminOrOwner && !paidMember) {
        setLoading(false);
        onOpenChange(false);
        router.push('/pricing?source=private-community');
        return;
      }

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
          ...(backgroundImageData ? { backgroundImage: backgroundImageData } : {}),
          ...(iconImageData ? { iconImage: iconImageData } : {}),
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
        resetImages();

        onRoomAdded();
        onOpenChange(false);
      } catch (error: any) {
        console.error('Failed to create chat community:', error);
        alert('Failed to create chat community. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    [backgroundImageData, formData, iconImageData, isAdminOrOwner, onRoomAdded, onOpenChange, paidMember, resetImages, router]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex w-[calc(100vw-1.5rem)] max-h-[90vh] flex-col overflow-hidden p-0 sm:max-w-125">
        <DialogHeader className="border-b border-border px-6 pb-3 pt-6">
          <DialogTitle>Create New Chat Community</DialogTitle>
          <DialogDescription>Add a new chat community for users to join and communicate.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-6 pt-4">
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

          <div className="space-y-4 rounded-xl border border-dashed border-border bg-muted/30 p-4">
            <div className="space-y-2">
              <Label htmlFor="backgroundImage" className="text-sm font-semibold flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-primary" />
                Community Background Image (Optional)
              </Label>
              <div className="space-y-3">
                {backgroundImagePreview ? (
                  <div className="relative group">
                    <img
                      src={backgroundImagePreview}
                      alt="Background preview"
                      className="h-32 w-full rounded-xl border border-border object-cover"
                    />
                    <button
                      type="button"
                      onClick={removeBackgroundImage}
                      className="absolute right-2 top-2 rounded-full bg-red-500 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <label htmlFor="backgroundImage" className="cursor-pointer">
                    <div className="flex h-32 flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-background transition-colors hover:border-primary hover:bg-primary/5">
                      <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Click to upload background</p>
                      <p className="mt-1 text-xs text-muted-foreground/70">PNG, JPG, WEBP (Max 5MB)</p>
                    </div>
                  </label>
                )}
                <Input
                  id="backgroundImage"
                  type="file"
                  accept="image/*"
                  onChange={handleBackgroundImageChange}
                  className="hidden"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="iconImage" className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Community Icon (Optional)
              </Label>
              <div className="space-y-3">
                {iconImagePreview ? (
                  <div className="relative group inline-block">
                    <img
                      src={iconImagePreview}
                      alt="Icon preview"
                      className="h-24 w-24 rounded-xl border border-border object-cover"
                    />
                    <button
                      type="button"
                      onClick={removeIconImage}
                      className="absolute right-1 top-1 rounded-full bg-red-500 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <label htmlFor="iconImage" className="inline-block cursor-pointer">
                    <div className="flex h-24 w-24 flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-background transition-colors hover:border-primary hover:bg-primary/5">
                      <Upload className="mb-1 h-6 w-6 text-muted-foreground" />
                      <p className="px-1 text-center text-xs text-muted-foreground">Upload icon</p>
                    </div>
                  </label>
                )}
                <Input
                  id="iconImage"
                  type="file"
                  accept="image/*"
                  onChange={handleIconImageChange}
                  className="hidden"
                />
              </div>
              <p className="text-xs text-muted-foreground">Square images work best (recommended: 256x256px)</p>
            </div>

            {(uploadingBackground || uploadingIcon) && (
              <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                <p className="text-sm font-medium text-blue-700">Uploading images...</p>
              </div>
            )}
          </div>

          <div className="sticky bottom-0 flex justify-end gap-3 border-t border-border bg-background pb-1 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || uploadingBackground || uploadingIcon}>
              {loading ? 'Creating...' : uploadingBackground || uploadingIcon ? 'Uploading...' : 'Create Community'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
});

AddChatRoomDialog.displayName = 'AddChatRoomDialog';
