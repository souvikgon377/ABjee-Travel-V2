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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { adminAPI } from '@/lib/api';
import { Mail, User, MapPin, Phone } from 'lucide-react';

interface AddUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUserAdded?: () => void;
}

export const AddUserDialog = memo(
  ({ open, onOpenChange, onUserAdded }: AddUserDialogProps) => {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
      email: '',
      displayName: '',
      role: 'user',
      city: '',
      phoneNumber: '',
    });

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);

      try {
        await adminAPI.createUser(formData);
        
        // Reset form
        setFormData({
          email: '',
          displayName: '',
          role: 'user',
          city: '',
          phoneNumber: '',
        });

        // Close dialog and notify parent
        onOpenChange(false);
        onUserAdded?.();
        
        if (import.meta.env.DEV) {
          console.log('User created successfully:', formData);
        }
      } catch (error: any) {
        console.error('Failed to create user:', error);
        alert(error.response?.data?.message || 'Failed to create user. Please try again.');
      } finally {
        setLoading(false);
      }
    }, [formData, onOpenChange, onUserAdded]);

    const handleChange = useCallback((
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
      setFormData((prev) => ({
        ...prev,
        [e.target.name]: e.target.value,
      }));
    }, []);

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>
              Create a new user account. They will receive an email to set their password.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email Address *</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="user@example.com"
                    value={formData.email}
                    onChange={handleChange}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="displayName">Display Name *</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="displayName"
                    name="displayName"
                    type="text"
                    placeholder="John Doe"
                    value={formData.displayName}
                    onChange={handleChange}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="role">Role</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, role: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="moderator">Moderator</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="city">City</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="city"
                    name="city"
                    type="text"
                    placeholder="New York"
                    value={formData.city}
                    onChange={handleChange}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="phoneNumber">Phone Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="phoneNumber"
                    name="phoneNumber"
                    type="tel"
                    placeholder="+1 (555) 123-4567"
                    value={formData.phoneNumber}
                    onChange={handleChange}
                    className="pl-10"
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Creating...' : 'Create User'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    );
  }
);

AddUserDialog.displayName = 'AddUserDialog';
