import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { chatService } from '../../lib/chatService';
import { type ChatMessage, type ChatRoom as RoomType } from '../../lib/chatService';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card } from '../ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Label } from '../ui/label';
import { Lock, MoreVertical, Trash2, SmilePlus, Pencil, Check, X, ArrowUp } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../ui/popover';
import { ModeToggle } from '../mvpblocks/mode-toggle';

// Emoji list constant (moved outside component for performance)
const EMOJI_LIST = [
  '😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂',
  '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋',
  '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳',
  '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖',
  '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯',
  '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔',
  '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👏', '🙌',
  '👐', '🤲', '🙏', '✍️', '💪', '🦾', '🦵', '🦿', '🦶', '👂',
  '👀', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎',
  '💔', '❤️‍🔥', '❤️‍🩹', '💕', '💞', '💓', '💗', '💖', '💘', '💝',
  '🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '🥈', '🥉', '⭐', '🌟',
  '✨', '💫', '🔥', '💯', '✅', '❌', '⚠️', '🚀', '⚡', '💥'
];

const ChatRoom = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [room, setRoom] = useState<RoomType | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typingUsers, setTypingUsers] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [loading, setLoading] = useState(true);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [joiningRoom, setJoiningRoom] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<ChatMessage | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
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
        if (!roomData) {
          navigate('/chat');
          return;
        }
        
        setRoom(roomData);
        
        // Check if user is already a participant
        const isParticipant = roomData.participants.includes(user.uid);
        
        if (!isParticipant) {
          // Check for invite token in URL
          const inviteToken = searchParams.get('invite');
          
          if (inviteToken) {
            // Try to join with invite token
            try {
              await chatService.joinRoom(roomId, user.uid, undefined, inviteToken);
              // Reload room data after joining
              const updatedRoom = await chatService.getRoom(roomId);
              if (updatedRoom) setRoom(updatedRoom);
            } catch (error: any) {
              alert(error.message || 'Invalid invite link');
              navigate('/chat');
              return;
            }
          } else {
            // Show password dialog
            setShowPasswordDialog(true);
            setLoading(false);
            return; // Don't load messages yet
          }
        }

        // Listen to messages (onChildAdded fires for existing messages first, then new ones)
        const unsubMessages = chatService.listenToMessages(roomId, (newMsg) => {
          setMessages(prev => {
            // Prevent duplicates by checking message ID
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        });

        // Listen to message UPDATES (edits, deletions)
        const unsubUpdates = chatService.listenToMessageUpdates(roomId, (updatedMsg) => {
          setMessages(prev => {
            return prev.map(m => m.id === updatedMsg.id ? updatedMsg : m);
          });
        });

        // Listen to typing indicators
        const unsubTyping = chatService.listenToTyping(roomId, (typing: any[]) => {
          setTypingUsers(typing.filter((t: any) => t.userId !== user.uid));
        });

        setLoading(false);

        return () => {
          // Clean up typing indicator
          if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
          }
          chatService.stopTyping(roomId).catch(() => {});
          
          unsubMessages();
          unsubUpdates();
          unsubTyping();
        };
      } catch (error) {
        console.error('Error initializing chat room:', error);
        setLoading(false);
      }
    };

    init();
  }, [roomId, user, navigate, searchParams]);

  // Handle password submission
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || !roomId || !user) return;

    setJoiningRoom(true);
    setPasswordError('');

    try {
      await chatService.joinRoom(roomId, user.uid, password.trim());
      setShowPasswordDialog(false);
      setPassword('');
      setPasswordError('');
      
      // Reload room data and start listening to messages
      const updatedRoom = await chatService.getRoom(roomId);
      if (updatedRoom) setRoom(updatedRoom);
      setLoading(false);
    } catch (error: any) {
      setPasswordError(error.message || 'Incorrect password');
    } finally {
      setJoiningRoom(false);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !roomId || !user) return;

    const messageText = newMessage.trim();
    
    // Clear input immediately for instant feedback
    setNewMessage('');
    
    // Stop typing indicator (don't await)
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = undefined;
    }
    chatService.stopTyping(roomId).catch(() => {});

    try {
      await chatService.sendMessage(roomId, messageText);
    } catch (error: any) {
      // Restore message on error
      setNewMessage(messageText);
      alert(`Failed to send message: ${error.message || 'Please try again.'}`);
    }
  }, [newMessage, roomId, user]);

  const handleTyping = useCallback(() => {
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
  }, [roomId, user]);

  const handleLeaveRoom = useCallback(async () => {
    if (!roomId) return;
    
    // Clear typing indicator before leaving
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    await chatService.stopTyping(roomId).catch(() => {});
    
    navigate('/chat');
  }, [roomId, navigate]);

  const handleDeleteForMe = useCallback(async (message: ChatMessage) => {
    if (!roomId || !message.id) return;
    try {
      await chatService.deleteMessageForMe(roomId, message.id);
      setMessages(prev => prev.filter(m => m.id !== message.id));
    } catch (error) {
      alert('Failed to delete message');
    }
  }, [roomId]);

  const handleDeleteForEveryone = useCallback(async (message: ChatMessage) => {
    if (!roomId || !message.id) return;
    try {
      await chatService.deleteMessageForEveryone(roomId, message.id);
      setDeleteDialogOpen(false);
      setMessageToDelete(null);
    } catch (error) {
      alert('Failed to delete message for everyone');
    }
  }, [roomId]);

  const openDeleteDialog = useCallback((message: ChatMessage) => {
    setMessageToDelete(message);
    setDeleteDialogOpen(true);
  }, []);

  const startEditing = useCallback((message: ChatMessage) => {
    if (!message.id) return;
    setEditingMessageId(message.id);
    setEditText(message.text);
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingMessageId(null);
    setEditText('');
  }, []);

  const saveEdit = useCallback(async () => {
    if (!roomId || !editingMessageId || !editText.trim()) return;
    try {
      await chatService.editMessage(roomId, editingMessageId, editText.trim());
      cancelEditing();
    } catch (error) {
      alert('Failed to edit message');
    }
  }, [roomId, editingMessageId, editText, cancelEditing]);

  const insertEmoji = useCallback((emoji: string) => {
    setNewMessage(prev => prev + emoji);
    setEmojiPickerOpen(false);
  }, []);

  const isEmojiOnly = useCallback((text: string) => {
    // Regex to match emoji characters and whitespace only
    const emojiRegex = /^[\p{Emoji}\s]+$/u;
    return emojiRegex.test(text.trim());
  }, []);

  const formatTime = useCallback((timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }, []);

  const handleLoadMoreMessages = useCallback(async () => {
    if (!roomId || loadingMore || !hasMoreMessages || messages.length === 0) return;
    
    setLoadingMore(true);
    try {
      // Get the oldest message timestamp
      const oldestTimestamp = Math.min(...messages.map(m => m.timestamp));
      
      // Load previous messages
      const previousMessages = await chatService.loadPreviousMessages(roomId, oldestTimestamp, 50);
      
      if (previousMessages.length === 0) {
        setHasMoreMessages(false);
      } else {
        setMessages(prev => {
          // Merge and deduplicate
          const merged = [...previousMessages, ...prev];
          const unique = merged.filter((msg, index, self) => 
            index === self.findIndex(m => m.id === msg.id)
          );
          return unique.sort((a, b) => a.timestamp - b.timestamp);
        });
      }
    } catch (error) {
      console.error('Error loading more messages:', error);
      alert('Failed to load previous messages');
    } finally {
      setLoadingMore(false);
    }
  }, [roomId, loadingMore, hasMoreMessages, messages]);

  // Filter messages (memoized)
  const filteredMessages = useMemo(() => {
    return messages.filter((message) => {
      // Filter out messages deleted by current user
      if (message.deletedBy && message.deletedBy.includes(user?.uid || '')) {
        return false;
      }
      return true;
    });
  }, [messages, user]);

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
    <>
      {/* Password Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={(open) => {
        if (!open) navigate('/chat'); // Go back if dialog is closed
        setShowPasswordDialog(open);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Password Required
            </DialogTitle>
            <DialogDescription>
              Enter the password to join "{room?.name}"
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Room Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter room password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {passwordError && (
                <p className="text-sm text-destructive">{passwordError}</p>
              )}
            </div>
            
            <div className="flex gap-2">
              <Button 
                type="button" 
                variant="outline" 
                className="flex-1"
                onClick={() => navigate('/chat')}
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={joiningRoom}>
                {joiningRoom ? 'Joining...' : 'Join Room'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Delete Message for Everyone?
            </DialogTitle>
            <DialogDescription>
              This message will be deleted for all participants in this chat. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex gap-2 mt-4">
            <Button 
              type="button" 
              variant="outline" 
              className="flex-1"
              onClick={() => {
                setDeleteDialogOpen(false);
                setMessageToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              className="flex-1"
              onClick={() => messageToDelete && handleDeleteForEveryone(messageToDelete)}
            >
              Delete for Everyone
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Main Chat UI */}
      <div className="flex h-screen bg-background">
        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="border-b p-4 flex items-center justify-between bg-card">
            <div className="flex-1">
              <h2 className="text-xl font-bold">{room.name}</h2>
              {room.description && (
                <p className="text-sm text-muted-foreground">{room.description}</p>
              )}
            </div>
            <div className="flex-1 flex justify-center">
              <ModeToggle />
            </div>
            <div className="flex-1 flex justify-end">
              <Button variant="outline" onClick={handleLeaveRoom}>
                Leave Room
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Load More Button */}
            {hasMoreMessages && messages.length >= 50 && (
              <div className="flex justify-center mb-4">
                <Button
                  variant="outline"
                  onClick={handleLoadMoreMessages}
                  disabled={loadingMore}
                  className="w-full max-w-xs gap-2"
                >
                  {loadingMore ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                      Loading...
                    </>
                  ) : (
                    <>
                      <ArrowUp className="h-4 w-4" />
                      Load Previous Messages
                    </>
                  )}
                </Button>
              </div>
            )}

            {filteredMessages.map((message) => {
                const isOwnMessage = message.userId === user?.uid;
                const isDeleted = message.deletedForEveryone;
                const isOnlyEmoji = isEmojiOnly(message.text);
                
                return (
                  <div
                    key={message.id}
                    className={`flex items-start gap-3 ${isOwnMessage ? 'flex-row-reverse' : ''}`}
                  >
                    <Avatar className="w-8 h-8">
                      <AvatarImage 
                        src={message.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(message.username)}&background=random`}
                        alt={message.username}
                      />
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {message.username.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className={`flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'} max-w-[70%]`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">{message.username}</span>
                        <span className="text-xs text-muted-foreground">{formatTime(message.timestamp)}</span>
                      </div>
                      <div className={`group relative flex items-center gap-2 ${isOwnMessage ? 'flex-row-reverse' : ''}`}>
                        {/* Inline Edit UI */}
                        {editingMessageId === message.id ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  saveEdit();
                                } else if (e.key === 'Escape') {
                                  cancelEditing();
                                }
                              }}
                              className="min-w-[200px]"
                              autoFocus
                            />
                            <Button
                              size="sm"
                              onClick={saveEdit}
                              className="h-8 w-8 p-0"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={cancelEditing}
                              className="h-8 w-8 p-0"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <div className={isOnlyEmoji ? 'text-4xl animate-bounce-in' : `rounded-lg px-4 py-2 ${
                              isDeleted 
                                ? 'bg-muted/50 text-muted-foreground italic'
                                : isOwnMessage 
                                ? 'bg-primary text-primary-foreground' 
                                : 'bg-muted'
                            }`}>
                              {isDeleted ? (
                                <span className="flex items-center gap-2">
                                  <Trash2 className="h-3 w-3" />
                                  This message was deleted
                                </span>
                              ) : (
                                <>
                                  <span className={isOnlyEmoji ? 'inline-block hover:animate-wiggle' : ''}>
                                    {message.text}
                                  </span>
                                  {message.edited && (
                                    <span className="text-xs ml-2 opacity-70">(edited)</span>
                                  )}
                                </>
                              )}
                            </div>
                            
                            {/* Delete Menu - Only show for non-deleted messages */}
                            {!isDeleted && (
                              <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align={isOwnMessage ? 'end' : 'start'}>
                              {isOwnMessage && (
                                <DropdownMenuItem
                                  onClick={() => startEditing(message)}
                                  className="cursor-pointer"
                                >
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Edit message
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={() => handleDeleteForMe(message)}
                                className="text-destructive focus:text-destructive cursor-pointer"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete for me
                              </DropdownMenuItem>
                              {isOwnMessage && (
                                <DropdownMenuItem
                                  onClick={() => openDeleteDialog(message)}
                                  className="text-destructive focus:text-destructive cursor-pointer"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete for everyone
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                          </>
                        )}
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
              <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" size="icon">
                    <SmilePlus className="h-5 w-5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80" align="start">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Pick an emoji</p>
                    <div className="grid grid-cols-10 gap-2 max-h-60 overflow-y-auto">
                      {EMOJI_LIST.map((emoji, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => insertEmoji(emoji)}
                          className="text-2xl p-1 hover:scale-125 hover:animate-wiggle transition-transform cursor-pointer"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
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
    </>
  );
};

export default ChatRoom;
