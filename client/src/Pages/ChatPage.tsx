import React, { useState, useEffect } from 'react';
import { useNavigate, Routes, Route } from 'react-router-dom';
import { Plus, MessageCircle, Users, Clock } from 'lucide-react';
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
  const [creating, setCreating] = useState(false);

  // Load chat rooms
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const unsubscribe = chatService.listenToUserRooms((loadedRooms: ChatRoomType[]) => {
        setRooms(loadedRooms);
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
    
    if (!newRoomName.trim() || !user) return;

    setCreating(true);
    try {
      const roomId = await chatService.createGroupRoom(
        newRoomName.trim(),
        newRoomDescription.trim() || 'No description',
        [user.uid]
      );

      setShowCreateDialog(false);
      setNewRoomName('');
      setNewRoomDescription('');
      
      // Navigate to the new room
      navigate(`/chat/room/${roomId}`);
    } catch (error) {
      console.error('Error creating room:', error);
    } finally {
      setCreating(false);
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
        </div>
        
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button size="lg">
              <Plus className="h-5 w-5 mr-2" />
              Create Room
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Chat Room</DialogTitle>
              <DialogDescription>
                Create a new room for your community to chat
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Main Chat Page with routing
 */
const ChatPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <Routes>
        <Route index element={<ChatRoomsList />} />
        <Route path="room/:roomId" element={<ChatRoom />} />
      </Routes>
    </div>
  );
};

export default ChatPage;
