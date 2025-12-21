import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { chatService } from '../../lib/chatService';
import { type ChatMessage, type ChatRoom as RoomType } from '../../lib/chatService';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card } from '../ui/card';
import { Avatar } from '../ui/avatar';

const ChatRoom = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [room, setRoom] = useState<RoomType | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typingUsers, setTypingUsers] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  useEffect(() => {
    if (!roomId || !user) {
      navigate('/chat');
      return;
    }

    const init = async () => {
      try {
        // Get room details
        const roomData = await chatService.getRoom(roomId);
        if (roomData) {
          setRoom(roomData);
          
          // Auto-join room if user is not already a participant
          if (!roomData.participants.includes(user.uid)) {
            await chatService.joinRoom(roomId, user.uid);
          }
        }

        // Load initial message history
        const history = await chatService.loadMessageHistory(roomId, 50);
        setMessages(history);

        // Get timestamp of last loaded message to avoid duplicates
        const lastTimestamp = history.length > 0 ? history[history.length - 1].timestamp : 0;

        // Listen to NEW messages only (optimized)
        const unsubMessages = chatService.listenToMessages(roomId, (newMsg) => {
          // Only add if message is newer than our last loaded message
          if (newMsg.timestamp > lastTimestamp) {
            setMessages(prev => {
              // Double-check to prevent duplicates
              if (prev.some(m => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
          }
        });

        // Listen to typing indicators
        const unsubTyping = chatService.listenToTyping(roomId, (typing: any[]) => {
          setTypingUsers(typing.filter((t: any) => t.userId !== user.uid));
        });

        setLoading(false);

        return () => {
          unsubMessages();
          unsubTyping();
        };
      } catch (error) {
        console.error('Error initializing chat room:', error);
        setLoading(false);
      }
    };

    init();
  }, [roomId, user, navigate]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !roomId || !user) return;

    try {
      await chatService.sendMessage(roomId, newMessage.trim());
      setNewMessage('');
      
      // Stop typing indicator
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      await chatService.stopTyping(roomId);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleTyping = () => {
    if (!roomId || !user) return;

    // Start typing
    chatService.startTyping(roomId);

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Stop typing after 3 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      chatService.stopTyping(roomId);
    }, 3000);
  };

  const handleLeaveRoom = () => {
    if (!roomId) return;
    navigate('/chat');
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading chat room...</p>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="p-6">
          <p className="text-muted-foreground">Room not found</p>
          <Button onClick={() => navigate('/chat')} className="mt-4">
            Back to Chat
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b p-4 flex items-center justify-between bg-card">
          <div>
            <h2 className="text-xl font-bold">{room.name}</h2>
            {room.description && (
              <p className="text-sm text-muted-foreground">{room.description}</p>
            )}
          </div>
          <Button variant="outline" onClick={handleLeaveRoom}>
            Leave Room
          </Button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message) => {
            const isOwnMessage = message.userId === user?.uid;
            return (
              <div
                key={message.id}
                className={`flex items-start gap-3 ${isOwnMessage ? 'flex-row-reverse' : ''}`}
              >
                <Avatar className="w-8 h-8">
                  <div className="bg-primary text-primary-foreground flex items-center justify-center w-full h-full">
                    {message.username.charAt(0).toUpperCase()}
                  </div>
                </Avatar>
                <div className={`flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'} max-w-[70%]`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">{message.username}</span>
                    <span className="text-xs text-muted-foreground">{formatTime(message.timestamp)}</span>
                  </div>
                  <div className={`rounded-lg px-4 py-2 ${
                    isOwnMessage 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-muted'
                  }`}>
                    {message.text}
                  </div>
                </div>
              </div>
            );
          })}
          
          {/* Typing Indicator */}
          {typingUsers.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </div>
              <span>
                {typingUsers.length === 1
                  ? `${typingUsers[0].username} is typing...`
                  : typingUsers.length === 2
                  ? `${typingUsers[0].username} and ${typingUsers[1].username} are typing...`
                  : `${typingUsers.length} people are typing...`}
              </span>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input */}
        <form onSubmit={handleSendMessage} className="border-t p-4 bg-card">
          <div className="flex gap-2">
            <Input
              value={newMessage}
              onChange={(e) => {
                setNewMessage(e.target.value);
                handleTyping();
              }}
              placeholder="Type a message..."
              className="flex-1"
            />
            <Button type="submit" disabled={!newMessage.trim()}>
              Send
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChatRoom;
