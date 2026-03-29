import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Label } from '../ui/label';
import { Loader2, X, Search, UserPlus, Check } from 'lucide-react';
import { usersAPI } from '../../lib/api';

interface CreateRoomDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (roomData: RoomData) => Promise<void>;
}

export interface RoomData {
  name: string;
  description?: string;
  type: 'public' | 'private' | 'travel_partner';
  destination?: {
    country: string;
    city?: string;
    region?: string;
  };
  memberIds?: string[];
}

interface User {
  id: string;
  username: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
}

interface SelectedMember extends User {
  addedAt: number;
}

const CreateRoomDialog: React.FC<CreateRoomDialogProps> = ({
  isOpen,
  onClose,
  onSubmit
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<SelectedMember[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showUserSearch, setShowUserSearch] = useState(false);
  const [formData, setFormData] = useState<RoomData>({
    name: '',
    description: '',
    type: 'public',
    destination: undefined,
    memberIds: []
  });

  // Fetch users when search is triggered
  useEffect(() => {
    if (searchQuery.trim() && formData.type === 'private') {
      fetchUsers(searchQuery);
    } else if (!searchQuery.trim()) {
      setUsers([]);
    }
  }, [searchQuery, formData.type]);

  const fetchUsers = async (query: string) => {
    setLoadingUsers(true);
    try {
      const response = await usersAPI.searchUsers({ q: query });
      const fetchedUsers = response.data.data?.users || [];
      // Filter out already selected members
      const filteredUsers = fetchedUsers.filter(
        (user: User) => !selectedMembers.find(m => m.id === user.id)
      );
      setUsers(filteredUsers);
    } catch (error) {
      if ((process.env.NODE_ENV === "development")) {
        console.error('Failed to search users:', error);
      }
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleAddMember = (user: User) => {
    const newMember: SelectedMember = {
      ...user,
      addedAt: Date.now()
    };
    setSelectedMembers(prev => [...prev, newMember]);
    setSearchQuery('');
    setUsers([]);
  };

  const handleRemoveMember = (userId: string) => {
    setSelectedMembers(prev => prev.filter(m => m.id !== userId));
  };

  const handleTypeChange = (value: 'public' | 'private' | 'travel_partner') => {
    setFormData(prev => ({ ...prev, type: value }));
    if (value !== 'private') {
      setSelectedMembers([]);
      setShowUserSearch(false);
      setSearchQuery('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const submitData = {
        ...formData,
        memberIds: formData.type === 'private' ? selectedMembers.map(m => m.id) : undefined
      };
      await onSubmit(submitData);
      handleClose();
    } catch (error) {
      if ((process.env.NODE_ENV === "development")) {
        console.error('Failed to create community:', error);
      }
      // TODO: Show error message to user
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      name: '',
      description: '',
      type: 'public',
      destination: undefined,
      memberIds: []
    });
    setSelectedMembers([]);
    setSearchQuery('');
    setShowUserSearch(false);
    onClose();
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    if (name.startsWith('destination.')) {
      const field = name.split('.')[1] as 'country' | 'city' | 'region';
      setFormData(prev => {
        const newDestination = {
          country: prev.destination?.country || '',
          city: prev.destination?.city || '',
          region: prev.destination?.region || ''
        };
        newDestination[field] = value;
        
        // Only include destination if country has a value
        return {
          ...prev,
          destination: newDestination.country ? newDestination : undefined
        };
      });
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-106.25">
        <DialogHeader>
          <DialogTitle>Create New Chat Community</DialogTitle>
          <DialogDescription>
            Set up a new chat community for your community or travel group.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Community Name</Label>
            <Input
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="Enter community name"
              required
              maxLength={50}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              placeholder="Describe the purpose of this community"
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Community Type</Label>
            <Select
              value={formData.type}
              onValueChange={handleTypeChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select community type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="private">Private</SelectItem>
                <SelectItem value="travel_partner">Travel Partner</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Members Selection for Private Rooms */}
          {formData.type === 'private' && (
            <div className="space-y-4 border-2 border-blue-100 rounded-lg p-4 bg-linear-to-br from-blue-50 to-slate-50">
              <div className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-blue-600" />
                <Label className="text-base font-semibold text-blue-900">Add Members (Optional)</Label>
              </div>

              {/* Member Search Input */}
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search users by name or username..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setShowUserSearch(true)}
                    onBlur={() => setTimeout(() => setShowUserSearch(false), 200)}
                    className="pl-10 border-2 border-blue-200 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Search Results Dropdown */}
              {showUserSearch && searchQuery.trim() && (
                <div className="border-2 border-gray-200 rounded-lg bg-white shadow-lg">
                  {loadingUsers ? (
                    <div className="p-4 text-center text-sm text-gray-500 flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Searching...
                    </div>
                  ) : users.length > 0 ? (
                    <div className="max-h-64 overflow-y-auto divide-y">
                      {users.map(user => (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => handleAddMember(user)}
                          className="w-full text-left p-3 hover:bg-blue-50 transition-colors flex items-center justify-between group"
                        >
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">
                              {user.firstName} {user.lastName}
                            </div>
                            <div className="text-sm text-gray-500">@{user.username}</div>
                          </div>
                          <span className="ml-2 px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-700 group-hover:bg-blue-200 transition-colors">
                            Add
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-sm text-gray-500">
                      No users found
                    </div>
                  )}
                </div>
              )}

              {/* Selected Members Display */}
              {selectedMembers.length > 0 && (
                <div className="space-y-3 p-3 bg-white rounded-lg border border-blue-100">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-600" />
                    <Label className="text-sm font-medium text-gray-700">
                      Selected Members ({selectedMembers.length})
                    </Label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedMembers.map(member => (
                      <div
                        key={member.id}
                        className="flex items-center gap-2 px-3 py-2 bg-linear-to-r from-blue-500 to-blue-600 text-white rounded-full text-sm font-medium shadow-md hover:shadow-lg transition-shadow"
                      >
                        <span>
                          {member.firstName} {member.lastName}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(member.id)}
                          className="hover:bg-white/20 rounded-full p-1 transition-colors"
                          title="Remove member"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedMembers.length === 0 && !showUserSearch && searchQuery === '' && (
                <div className="p-3 bg-white rounded-lg border border-gray-200 text-center text-sm text-gray-500">
                  👥 Search and add members to your private community
                </div>
              )}
            </div>
          )}

          <div className="space-y-4">
            <Label>Destination</Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  name="destination.country"
                  value={formData.destination?.country || ''}
                  onChange={handleInputChange}
                  placeholder="Country"
                  required={formData.type === 'travel_partner'}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  name="destination.city"
                  value={formData.destination?.city || ''}
                  onChange={handleInputChange}
                  placeholder="City"
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label htmlFor="region">Region</Label>
                <Input
                  id="region"
                  name="destination.region"
                  value={formData.destination?.region || ''}
                  onChange={handleInputChange}
                  placeholder="Region (optional)"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !formData.name.trim()}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Community
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateRoomDialog;

