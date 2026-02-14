import React, { useState, useEffect } from 'react';
import { useNavigate, Routes, Route, useLocation } from 'react-router-dom';
import { Plus, MessageCircle, Users, Clock, Share2, Trash2, Copy, Lock } from 'lucide-react';
import { chatService } from '@/lib/chatService';
import { type ChatRoom as ChatRoomType } from '@/lib/chatService';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import Header from '@/components/mvpblocks/header-1';
import ChatRoom from '@/components/chat/ChatRoom';

/**
 * Chat Rooms List Component
 */
const ChatRoomsList: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [rooms, setRooms] = useState<ChatRoomType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDescription, setNewRoomDescription] = useState('');
  const [newRoomPassword, setNewRoomPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareRoom, setShareRoom] = useState<ChatRoomType | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [userCreatedRoomsCount, setUserCreatedRoomsCount] = useState(0);

  // Load chat rooms
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const unsubscribe = chatService.listenToUserRooms((loadedRooms: ChatRoomType[]) => {
        setRooms(loadedRooms);
        
        // Count rooms created by current user
        const count = loadedRooms.filter(room => room.createdBy === user.uid).length;
        setUserCreatedRoomsCount(count);
        
        setLoading(false);
      });

      return () => {
        if (unsubscribe) unsubscribe();
      };
    } catch (error) {
      console.error('Error loading chat rooms:', error);
      setLoading(false);
    }
  }, [user]);

  // Create new room
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newRoomName.trim() || !newRoomPassword.trim() || !user) return;

    setCreating(true);
    try {
      const roomId = await chatService.createGroupRoom(
        newRoomName.trim(),
        newRoomDescription.trim() || 'No description',
        newRoomPassword.trim(),
        [user.uid]
      );

      setShowCreateDialog(false);
      setNewRoomName('');
      setNewRoomDescription('');
      setNewRoomPassword('');
      
      // Navigate to the new room
      navigate(`/chat/room/${roomId}`);
    } catch (error: any) {
      console.error('Error creating room:', error);
      alert(error.message || 'Failed to create room');
    } finally {
      setCreating(false);
    }
  };

  // Handle share room
  const handleShareRoom = (room: ChatRoomType, e: React.MouseEvent) => {
    e.stopPropagation();
    setShareRoom(room);
    setShowShareDialog(true);
    setCopiedInvite(false);
    setCopiedPassword(false);
  };

  // Copy invite link
  const copyInviteLink = () => {
    if (!shareRoom || !shareRoom.id || !shareRoom.inviteToken) return;
    
    const inviteLink = chatService.getInviteLink(shareRoom.id, shareRoom.inviteToken);
    navigator.clipboard.writeText(inviteLink);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2000);
  };

  // Copy room credentials
  const copyCredentials = () => {
    if (!shareRoom || !shareRoom.id) return;
    
    const credentials = `Room ID: ${shareRoom.id}\nPassword: ${shareRoom.password || 'N/A'}`;
    navigator.clipboard.writeText(credentials);
    setCopiedPassword(true);
    setTimeout(() => setCopiedPassword(false), 2000);
  };

  // Delete room
  const handleDeleteRoom = async (roomId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!confirm('Are you sure you want to delete this room? This action cannot be undone.')) {
      return;
    }

    try {
      await chatService.deleteRoom(roomId);
    } catch (error: any) {
      alert(error.message || 'Failed to delete room');
    }
  };

  // Format timestamp
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading chat rooms...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Chat Rooms</h1>
          <p className="text-muted-foreground">
            Join a conversation or create your own room
          </p>
          {user && (
            <p className="text-sm text-muted-foreground mt-1">
              You have created <span className="font-semibold text-primary">{userCreatedRoomsCount}/5</span> rooms
            </p>
          )}
        </div>
        
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button size="lg" disabled={userCreatedRoomsCount >= 5}>
              <Plus className="h-5 w-5 mr-2" />
              Create Room
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Chat Room</DialogTitle>
              <DialogDescription>
                Create a new password-protected room for your community ({userCreatedRoomsCount}/5 rooms created)
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="roomName">Room Name</Label>
                <Input
                  id="roomName"
                  placeholder="e.g., Travel Planning"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="roomDescription">Description (Optional)</Label>
                <Input
                  id="roomDescription"
                  placeholder="What's this room about?"
                  value={newRoomDescription}
                  onChange={(e) => setNewRoomDescription(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="roomPassword">Room Password</Label>
                <Input
                  id="roomPassword"
                  type="password"
                  placeholder="Enter a secure password"
                  value={newRoomPassword}
                  onChange={(e) => setNewRoomPassword(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  This password will be required to join the room
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={creating}>
                {creating ? 'Creating...' : 'Create Room'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Rooms Grid */}
      {rooms.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <MessageCircle className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Chat Rooms Yet</h3>
            <p className="text-muted-foreground mb-4">
              Be the first to create a chat room!
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Room
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rooms.map((room) => (
            <Card
              key={room.id}
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => navigate(`/chat/room/${room.id}`)}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="h-5 w-5 text-primary" />
                  {room.name}
                  {room.password && <Lock className="h-4 w-4 text-muted-foreground" />}
                </CardTitle>
                <CardDescription>{room.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <span>{room.participants?.length || 0} participants</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <span>Created {formatDate(room.createdAt)}</span>
                  </div>
                </div>
                
                {/* Action buttons for room creator */}
                {user && room.createdBy === user.uid && (
                  <div className="flex gap-2 mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={(e) => handleShareRoom(room, e)}
                    >
                      <Share2 className="h-4 w-4 mr-1" />
                      Share
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={(e) => handleDeleteRoom(room.id!, e)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      
      {/* Share Dialog */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share Room: {shareRoom?.name}</DialogTitle>
            <DialogDescription>
              Share this room with others using an invite link or room credentials
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Invite Link */}
            <div className="space-y-2">
              <Label>Invite Link (No Password Required)</Label>
              <div className="flex gap-2">
                <Input
                  value={shareRoom?.id && shareRoom?.inviteToken ? chatService.getInviteLink(shareRoom.id, shareRoom.inviteToken) : ''}
                  readOnly
                  className="flex-1"
                />
                <Button onClick={copyInviteLink} variant="outline">
                  <Copy className="h-4 w-4 mr-2" />
                  {copiedInvite ? 'Copied!' : 'Copy'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Anyone with this link can join directly without a password
              </p>
            </div>
            
            {/* Room Credentials */}
            <div className="space-y-2">
              <Label>Room Credentials</Label>
              <div className="bg-muted p-3 rounded-md space-y-2">
                <div>
                  <p className="text-xs text-muted-foreground">Room ID</p>
                  <p className="font-mono text-sm">{shareRoom?.id}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Password</p>
                  <p className="font-mono text-sm">{shareRoom?.password}</p>
                </div>
              </div>
              <Button onClick={copyCredentials} variant="outline" className="w-full">
                <Copy className="h-4 w-4 mr-2" />
                {copiedPassword ? 'Copied!' : 'Copy ID & Password'}
              </Button>
              <p className="text-xs text-muted-foreground">
                Share these credentials for manual room access
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/**
 * Main Chat Page with routing
 */
const ChatPage: React.FC = () => {
  const location = useLocation();
  const isInChatRoom = location.pathname.includes('/room/');

  return (
    <div className="min-h-screen bg-background">
      {!isInChatRoom && <Header />}
      <Routes>
        <Route index element={<ChatRoomsList />} />
        <Route path="room/:roomId" element={<ChatRoom />} />
      </Routes>
    </div>
  );
};

export default ChatPage;
