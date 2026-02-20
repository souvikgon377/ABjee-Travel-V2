import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { chatService, type MessageAttachment } from '../../lib/chatService';
import { type ChatMessage, type ChatRoom as RoomType } from '../../lib/chatService';
import { useAuth } from '../../contexts/AuthContext';
import { uploadImageToCloudinary, createImagePreview, revokeImagePreview } from '../../lib/imageUpload';
import { uploadFileToCloudinary, VoiceRecorder, formatFileSize, formatDuration, getFileIcon } from '../../lib/fileUpload';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card } from '../ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Label } from '../ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Lock, MoreVertical, Trash2, SmilePlus, Pencil, Check, X, ArrowUp, Settings, Paperclip, Mic, FileText, Image as ImageIcon, File, XCircle, Play, Pause, Download } from 'lucide-react';
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

// Helper functions (moved outside component for performance)
const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s * 100, l * 100];
};

const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  h /= 360; s /= 100; l /= 100;
  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
};

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};

const isEmojiOnly = (text: string): boolean => {
  const emojiRegex = /^[\p{Emoji}\s]+$/u;
  return emojiRegex.test(text.trim());
};

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
  const [imageColors, setImageColors] = useState<{primary: string; secondary: string; accent: string} | null>(null);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [uploadingBackground, setUploadingBackground] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [backgroundPreview, setBackgroundPreview] = useState<string | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [backgroundImageTab, setBackgroundImageTab] = useState<'upload' | 'history'>('upload');
  const [iconImageTab, setIconImageTab] = useState<'upload' | 'history'>('upload');
  const [selectedBackgroundImage, setSelectedBackgroundImage] = useState<any>(null);
  const [selectedIconImage, setSelectedIconImage] = useState<any>(null);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [voiceRecorder] = useState(() => new VoiceRecorder());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Extract colors from background image - memoized for performance
  const extractColorsFromImage = useCallback((imageUrl: string) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = imageUrl;
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Resize for performance
      canvas.width = 100;
      canvas.height = 100;
      ctx.drawImage(img, 0, 0, 100, 100);

      const imageData = ctx.getImageData(0, 0, 100, 100);
      const data = imageData.data;
      const colorMap: {[key: string]: number} = {};

      // Sample colors
      for (let i = 0; i < data.length; i += 16) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const key = `${Math.floor(r/10)*10},${Math.floor(g/10)*10},${Math.floor(b/10)*10}`;
        colorMap[key] = (colorMap[key] || 0) + 1;
      }

      // Get top colors
      const sortedColors = Object.entries(colorMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([color]) => {
          const [r, g, b] = color.split(',').map(Number);
          // Enhance saturation for better visibility
          const hsl = rgbToHsl(r, g, b);
          hsl[1] = Math.min(hsl[1] * 1.3, 100); // Increase saturation
          hsl[2] = Math.max(Math.min(hsl[2], 60), 35); // Adjust lightness for readability
          const rgb = hslToRgb(hsl[0], hsl[1], hsl[2]);
          return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
        });

      setImageColors({
        primary: sortedColors[0] || 'rgb(244, 63, 94)',
        secondary: sortedColors[1] || 'rgb(236, 72, 153)',
        accent: sortedColors[2] || 'rgb(219, 39, 119)'
      });
    };
  }, []);

  // Extract colors when room background changes
  useEffect(() => {
    if (room?.backgroundImage?.url) {
      extractColorsFromImage(room.backgroundImage.url);
    }
  }, [room?.backgroundImage?.url, extractColorsFromImage]);

  // Initialize staged selections when settings dialog opens
  useEffect(() => {
    if (settingsDialogOpen && room) {
      // Initialize with current room images
      setSelectedBackgroundImage(room.backgroundImage || null);
      setSelectedIconImage(room.iconImage || null);
    }
  }, [settingsDialogOpen, room]);

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
              // Room listener will update the state automatically
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

        // Listen to room updates (for background/icon changes)
        const unsubRoom = chatService.listenToRoom(roomId, (updatedRoom) => {
          if (updatedRoom) {
            setRoom(updatedRoom);
          }
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
          
          // Clean up recording
          if (recordingIntervalRef.current) {
            clearInterval(recordingIntervalRef.current);
          }
          if (isRecording) {
            voiceRecorder.cancelRecording();
          }
          
          unsubMessages();
          unsubUpdates();
          unsubRoom();
          unsubTyping();
        };
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Error initializing chat room:', error);
        }
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
      
      // Room listener will update the state automatically
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
    if ((!newMessage.trim() && !attachmentFile) || !roomId || !user) return;

    const messageText = newMessage.trim();
    const fileToSend = attachmentFile;
    
    // Clear input immediately for instant feedback
    setNewMessage('');
    setAttachmentFile(null);
    setAttachmentPreview(null);
    
    // Stop typing indicator (don't await)
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = undefined;
    }
    chatService.stopTyping(roomId).catch(() => {});

    try {
      let attachment: MessageAttachment | undefined;
      
      // Upload attachment if present
      if (fileToSend) {
        setUploadingAttachment(true);
        const isVoiceMessage = fileToSend.name.startsWith('voice-message-');
        attachment = await uploadFileToCloudinary(fileToSend, { isVoiceMessage });
        setUploadingAttachment(false);
      }
      
      await chatService.sendMessage(roomId, messageText || '', attachment);
    } catch (error: any) {
      // Restore message on error
      setNewMessage(messageText);
      if (fileToSend) {
        setAttachmentFile(fileToSend);
      }
      setUploadingAttachment(false);
      alert(`Failed to send message: ${error.message || 'Please try again.'}`);
    }
  }, [newMessage, attachmentFile, roomId, user]);

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

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    setAttachmentFile(file);
    
    // Create preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => setAttachmentPreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setAttachmentPreview(null);
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleClearAttachment = useCallback(() => {
    setAttachmentFile(null);
    setAttachmentPreview(null);
  }, []);

  const handleStartRecording = useCallback(async () => {
    try {
      await voiceRecorder.startRecording();
      setIsRecording(true);
      setRecordingTime(0);
      
      // Start timer
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error: any) {
      alert(error.message || 'Failed to start recording');
    }
  }, [voiceRecorder]);

  const handleStopRecording = useCallback(async () => {
    try {
      const audioFile = await voiceRecorder.stopRecording();
      
      // Clear timer
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = undefined;
      }
      
      setIsRecording(false);
      setRecordingTime(0);
      setAttachmentFile(audioFile);
      setAttachmentPreview(null);
    } catch (error: any) {
      alert(error.message || 'Failed to stop recording');
      setIsRecording(false);
      setRecordingTime(0);
    }
  }, [voiceRecorder]);

  const handleCancelRecording = useCallback(() => {
    voiceRecorder.cancelRecording();
    
    // Clear timer
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = undefined;
    }
    
    setIsRecording(false);
    setRecordingTime(0);
  }, [voiceRecorder]);

  const handleBackgroundImageChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Show preview
      const preview = createImagePreview(file);
      setBackgroundPreview(preview);
      
      // Upload to Cloudinary (but don't apply yet)
      setUploadingBackground(true);
      const result = await uploadImageToCloudinary(file, {
        folder: 'chat-rooms/backgrounds',
      });

      // Stage the uploaded image
      setSelectedBackgroundImage(result);
      
      // Reset file input
      if (backgroundInputRef.current) {
        backgroundInputRef.current.value = '';
      }
      
    } catch (error: any) {
      alert(error.message || 'Failed to upload background image');
      if (backgroundPreview) {
        revokeImagePreview(backgroundPreview);
        setBackgroundPreview(null);
      }
    } finally {
      setUploadingBackground(false);
    }
  }, [backgroundPreview]);

  const handleIconImageChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Show preview
      const preview = createImagePreview(file);
      setIconPreview(preview);
      
      // Upload to Cloudinary (but don't apply yet)
      setUploadingIcon(true);
      const result = await uploadImageToCloudinary(file, {
        folder: 'chat-rooms/icons',
      });

      // Stage the uploaded image
      setSelectedIconImage(result);
      
      // Reset file input
      if (iconInputRef.current) {
        iconInputRef.current.value = '';
      }
      
    } catch (error: any) {
      alert(error.message || 'Failed to upload icon image');
      if (iconPreview) {
        revokeImagePreview(iconPreview);
        setIconPreview(null);
      }
    } finally {
      setUploadingIcon(false);
    }
  }, [iconPreview]);

  const handleSelectBackgroundFromHistory = useCallback((image: any) => {
    // Stage the selected image from history
    setSelectedBackgroundImage(image);
  }, []);

  const handleSelectIconFromHistory = useCallback((image: any) => {
    // Stage the selected image from history
    setSelectedIconImage(image);
  }, []);

  const handleApplySettings = useCallback(async () => {
    if (!roomId || !room) return;
    
    try {
      // Check if there are actual changes
      const currentBgHash = room.backgroundImage?.hash || null;
      const selectedBgHash = selectedBackgroundImage?.hash || null;
      const backgroundChanged = selectedBgHash !== currentBgHash;
      
      const currentIconHash = room.iconImage?.hash || null;
      const selectedIconHash = selectedIconImage?.hash || null;
      const iconChanged = selectedIconHash !== currentIconHash;
      
      // Apply changes if any
      if (backgroundChanged || iconChanged) {
        await chatService.updateRoomImages(
          roomId, 
          backgroundChanged ? selectedBackgroundImage || undefined : undefined, 
          iconChanged ? selectedIconImage || undefined : undefined
        );
        // Room listener will automatically update the state
      }
      
      // Clean up
      if (backgroundPreview) {
        revokeImagePreview(backgroundPreview);
      }
      if (iconPreview) {
        revokeImagePreview(iconPreview);
      }
      
      // Reset state
      setBackgroundPreview(null);
      setIconPreview(null);
      setSelectedBackgroundImage(null);
      setSelectedIconImage(null);
      setBackgroundImageTab('upload');
      setIconImageTab('upload');
      
      // Reset file inputs
      if (backgroundInputRef.current) {
        backgroundInputRef.current.value = '';
      }
      if (iconInputRef.current) {
        iconInputRef.current.value = '';
      }
      
      setSettingsDialogOpen(false);
      
    } catch (error: any) {
      alert(error.message || 'Failed to apply settings');
    }
  }, [roomId, room, selectedBackgroundImage, selectedIconImage, backgroundPreview, iconPreview]);

  const handleCloseSettings = useCallback(() => {
    // Clean up previews when closing without applying
    if (backgroundPreview) {
      revokeImagePreview(backgroundPreview);
    }
    if (iconPreview) {
      revokeImagePreview(iconPreview);
    }
    
    // Reset state
    setBackgroundPreview(null);
    setIconPreview(null);
    setSelectedBackgroundImage(null);
    setSelectedIconImage(null);
    setBackgroundImageTab('upload');
    setIconImageTab('upload');
    
    // Reset file inputs
    if (backgroundInputRef.current) {
      backgroundInputRef.current.value = '';
    }
    if (iconInputRef.current) {
      iconInputRef.current.value = '';
    }
    
    setSettingsDialogOpen(false);
  }, [backgroundPreview, iconPreview]);

  const insertEmoji = useCallback((emoji: string) => {
    setNewMessage(prev => prev + emoji);
    setEmojiPickerOpen(false);
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
      if (import.meta.env.DEV) {
        console.error('Error loading more messages:', error);
      }
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

      {/* Settings Dialog */}
      <Dialog open={settingsDialogOpen} onOpenChange={(open) => !open && handleCloseSettings()}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Room Settings
            </DialogTitle>
            <DialogDescription>
              Customize the appearance of your chat room by uploading new images or selecting from previous uploads.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 mt-4">
            {/* Background Image Section */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Background Image</Label>
              
              <Tabs value={backgroundImageTab} onValueChange={(v) => setBackgroundImageTab(v as 'upload' | 'history')}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="upload">Upload New</TabsTrigger>
                  <TabsTrigger value="history">
                    Previous ({room.backgroundImageHistory?.length || 0})
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="upload" className="space-y-3 mt-4">
                  <div className="flex items-center gap-3">
                    {backgroundPreview || selectedBackgroundImage || room.backgroundImage ? (
                      <div className="w-20 h-20 rounded-lg border-2 border-border overflow-hidden">
                        <img 
                          src={backgroundPreview || selectedBackgroundImage?.url || room.backgroundImage?.url} 
                          alt="Background preview" 
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <div className="w-20 h-20 rounded-lg border-2 border-dashed border-border flex items-center justify-center bg-muted">
                        <span className="text-xs text-muted-foreground">No image</span>
                      </div>
                    )}
                    <div className="flex-1">
                      <Input
                        ref={backgroundInputRef}
                        id="background-image"
                        type="file"
                        accept="image/*"
                        onChange={handleBackgroundImageChange}
                        disabled={uploadingBackground}
                        className="cursor-pointer"
                      />
                      {uploadingBackground && (
                        <p className="text-xs text-muted-foreground mt-1">Uploading...</p>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Recommended: 1920x1080px or larger. Max 5MB.
                  </p>
                </TabsContent>
                
                <TabsContent value="history" className="mt-4">
                  {room.backgroundImageHistory && room.backgroundImageHistory.length > 0 ? (
                    <div className="grid grid-cols-3 gap-3">
                      {room.backgroundImageHistory.map((image, index) => (
                        <div 
                          key={`bg-${index}-${image.hash}`}
                          className={`relative rounded-lg overflow-hidden border-2 cursor-pointer transition-all hover:scale-105 ${
                            selectedBackgroundImage?.hash === image.hash
                              ? 'border-primary ring-2 ring-primary' 
                              : 'border-border hover:border-primary'
                          }`}
                          onClick={() => handleSelectBackgroundFromHistory(image)}
                        >
                          <img 
                            src={image.url} 
                            alt={`Background ${index + 1}`}
                            className="w-full h-24 object-cover"
                            loading="lazy"
                          />
                          {selectedBackgroundImage?.hash === image.hash && (
                            <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-1">
                              <Check className="h-3 w-3" />
                            </div>
                          )}
                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-1 text-center">
                            {new Date(image.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No previous background images</p>
                      <p className="text-xs mt-1">Upload an image to start building your history</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>

            {/* Icon Image Section */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Room Icon</Label>
              
              <Tabs value={iconImageTab} onValueChange={(v) => setIconImageTab(v as 'upload' | 'history')}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="upload">Upload New</TabsTrigger>
                  <TabsTrigger value="history">
                    Previous ({room.iconImageHistory?.length || 0})
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="upload" className="space-y-3 mt-4">
                  <div className="flex items-center gap-3">
                    {iconPreview || selectedIconImage || room.iconImage ? (
                      <div className="w-20 h-20 rounded-full border-2 border-border overflow-hidden">
                        <img 
                          src={iconPreview || selectedIconImage?.url || room.iconImage?.url} 
                          alt="Icon preview" 
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <div className="w-20 h-20 rounded-full border-2 border-dashed border-border flex items-center justify-center bg-muted">
                        <Lock className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1">
                      <Input
                        ref={iconInputRef}
                        id="icon-image"
                        type="file"
                        accept="image/*"
                        onChange={handleIconImageChange}
                        disabled={uploadingIcon}
                        className="cursor-pointer"
                      />
                      {uploadingIcon && (
                        <p className="text-xs text-muted-foreground mt-1">Uploading...</p>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Recommended: Square image, 512x512px or larger. Max 5MB.
                  </p>
                </TabsContent>
                
                <TabsContent value="history" className="mt-4">
                  {room.iconImageHistory && room.iconImageHistory.length > 0 ? (
                    <div className="grid grid-cols-4 gap-3">
                      {room.iconImageHistory.map((image, index) => (
                        <div 
                          key={`icon-${index}-${image.hash}`}
                          className={`relative rounded-full overflow-hidden border-2 cursor-pointer transition-all hover:scale-105 ${
                            selectedIconImage?.hash === image.hash
                              ? 'border-primary ring-2 ring-primary' 
                              : 'border-border hover:border-primary'
                          }`}
                          onClick={() => handleSelectIconFromHistory(image)}
                        >
                          <img 
                            src={image.url} 
                            alt={`Icon ${index + 1}`}
                            className="w-full h-20 object-cover"
                            loading="lazy"
                          />
                          {selectedIconImage?.hash === image.hash && (
                            <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-1">
                              <Check className="h-3 w-3" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No previous icon images</p>
                      <p className="text-xs mt-1">Upload an icon to start building your history</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" onClick={handleCloseSettings}>
              Cancel
            </Button>
            <Button 
              onClick={handleApplySettings}
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Main Chat UI */}
      <div className="flex h-screen bg-background">
        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div 
            className="border-b p-4 flex items-center justify-between backdrop-blur-md shadow-sm"
            style={imageColors ? {
              backgroundColor: `${imageColors.accent}20`,
              borderBottomColor: `${imageColors.primary}40`
            } : { backgroundColor: 'hsl(var(--card) / 0.8)' }}
          >
            <div className="flex-1 flex items-center gap-3">
              {/* Room Icon */}
              {room.iconImage ? (
                <Avatar 
                  className="h-12 w-12 border-2"
                  style={imageColors ? {
                    borderColor: `${imageColors.primary}60`
                  } : { borderColor: 'hsl(var(--primary) / 0.2)' }}
                >
                  <AvatarImage src={room.iconImage.url} alt={room.name} />
                  <AvatarFallback>{room.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
              ) : (
                <div 
                  className="p-2 rounded-xl shadow-md"
                  style={imageColors ? {
                    background: `linear-gradient(135deg, ${imageColors.primary} 0%, ${imageColors.accent} 100%)`
                  } : undefined}
                >
                  <Lock className="h-6 w-6 text-white" />
                </div>
              )}
              <div>
                <h2 className="text-xl font-bold">{room.name}</h2>
                {room.description && (
                  <p className="text-sm text-muted-foreground">{room.description}</p>
                )}
              </div>
            </div>
            <div className="flex-1 flex justify-center">
              <ModeToggle />
            </div>
            <div className="flex-1 flex justify-end gap-2">
              {/* Settings button - only for room creator */}
              {user && room.createdBy === user.uid && (
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => setSettingsDialogOpen(true)}
                  title="Room Settings"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              )}
              <Button variant="outline" onClick={handleLeaveRoom}>
                Leave Room
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div 
            className="flex-1 overflow-y-auto p-4 space-y-4 relative"
            style={room.backgroundImage ? {
              backgroundImage: `url(${room.backgroundImage.url})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundAttachment: 'fixed'
            } : undefined}
          >
            {/* Messages content with higher z-index */}
            <div className="relative z-10 space-y-4">
            {/* Load More Button */}
            {hasMoreMessages && messages.length >= 50 && (
              <div className="flex justify-center mb-4">
                <Button
                  variant="outline"
                  onClick={handleLoadMoreMessages}
                  disabled={loadingMore}
                  className="w-full max-w-xs gap-2 backdrop-blur-sm shadow-md"
                  style={imageColors ? {
                    backgroundColor: `${imageColors.secondary}40`,
                    borderColor: `${imageColors.primary}60`,
                    color: 'white'
                  } : { backgroundColor: 'hsl(var(--card) / 0.9)' }}
                >
                  {loadingMore ? (
                    <>
                      <div 
                        className="animate-spin rounded-full h-4 w-4 border-b-2"
                        style={imageColors ? { borderBottomColor: imageColors.accent } : { borderBottomColor: 'hsl(var(--primary))' }}
                      ></div>
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
                              className="min-w-[200px] bg-card/90 backdrop-blur-sm"
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
                            <div 
                              className={isOnlyEmoji ? 'text-4xl animate-bounce-in' : `rounded-lg px-4 py-2 backdrop-blur-sm shadow-md ${
                                isDeleted 
                                  ? 'bg-muted/70 text-muted-foreground italic'
                                  : isOwnMessage 
                                  ? 'text-white' 
                                  : ''
                              }`}
                              style={!isDeleted && !isOnlyEmoji && isOwnMessage && imageColors ? {
                                background: `linear-gradient(135deg, ${imageColors.primary} 0%, ${imageColors.accent} 100%)`,
                                opacity: 0.95
                              } : !isDeleted && !isOnlyEmoji && !isOwnMessage && imageColors ? {
                                background: `linear-gradient(135deg, ${imageColors.secondary}DD 0%, ${imageColors.accent}CC 100%)`,
                                color: '#ffffff',
                                opacity: 0.9
                              } : !isDeleted && !isOnlyEmoji && !isOwnMessage ? {
                                backgroundColor: 'hsl(var(--card) / 0.9)'
                              } : undefined}
                            >
                              {isDeleted ? (
                                <span className="flex items-center gap-2">
                                  <Trash2 className="h-3 w-3" />
                                  This message was deleted
                                </span>
                              ) : (
                                <>
                                  {/* Attachment Rendering */}
                                  {message.attachment && (
                                    <div className="mb-2">
                                      {message.attachment.type === 'image' ? (
                                        <img 
                                          src={message.attachment.url} 
                                          alt={message.attachment.name}
                                          className="max-w-sm max-h-64 rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                                          onClick={() => window.open(message.attachment!.url, '_blank')}
                                          loading="lazy"
                                        />
                                      ) : message.attachment.type === 'voice' ? (
                                        <div className="flex items-center gap-3 bg-black/10 rounded-lg p-3 min-w-[250px]">
                                          <Mic className="h-5 w-5 flex-shrink-0" />
                                          <audio 
                                            controls 
                                            className="flex-1" 
                                            src={message.attachment.url}
                                            style={{ height: '32px' }}
                                          >
                                            Your browser does not support the audio element.
                                          </audio>
                                          <a 
                                            href={message.attachment.url} 
                                            download={message.attachment.name}
                                            className="flex-shrink-0 hover:opacity-70 transition-opacity"
                                          >
                                            <Download className="h-4 w-4" />
                                          </a>
                                        </div>
                                      ) : message.attachment.type === 'video' ? (
                                        <video 
                                          controls 
                                          className="max-w-sm max-h-64 rounded-lg"
                                          src={message.attachment.url}
                                        >
                                          Your browser does not support the video element.
                                        </video>
                                      ) : message.attachment.type === 'audio' ? (
                                        <div className="flex items-center gap-3 bg-black/10 rounded-lg p-3 min-w-[250px]">
                                          <FileText className="h-5 w-5 flex-shrink-0" />
                                          <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium truncate">{message.attachment.name}</div>
                                            <div className="text-xs opacity-70">{formatFileSize(message.attachment.size)}</div>
                                          </div>
                                          <audio 
                                            controls 
                                            className="flex-1 max-w-[150px]" 
                                            src={message.attachment.url}
                                            style={{ height: '32px' }}
                                          />
                                          <a 
                                            href={message.attachment.url} 
                                            download={message.attachment.name}
                                            className="flex-shrink-0 hover:opacity-70 transition-opacity"
                                          >
                                            <Download className="h-4 w-4" />
                                          </a>
                                        </div>
                                      ) : (
                                        <a 
                                          href={message.attachment.url} 
                                          download={message.attachment.name}
                                          className="flex items-center gap-3 bg-black/10 hover:bg-black/20 rounded-lg p-3 transition-colors min-w-[250px]"
                                        >
                                          <span className="text-2xl flex-shrink-0">{getFileIcon(message.attachment.mimeType)}</span>
                                          <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium truncate">{message.attachment.name}</div>
                                            <div className="text-xs opacity-70">{formatFileSize(message.attachment.size)}</div>
                                          </div>
                                          <Download className="h-4 w-4 flex-shrink-0" />
                                        </a>
                                      )}
                                    </div>
                                  )}

                                  {message.text && (
                                    <span className={isOnlyEmoji ? 'inline-block hover:animate-wiggle' : ''}>
                                      {message.text}
                                    </span>
                                  )}
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
              <div 
                className="flex items-center gap-2 text-sm"
                style={imageColors ? { color: imageColors.primary } : { color: 'hsl(var(--muted-foreground))' }}
              >
                <div className="flex gap-1">
                  <span 
                    className="w-2 h-2 rounded-full animate-bounce" 
                    style={imageColors ? { 
                      backgroundColor: imageColors.primary,
                      animationDelay: '0ms' 
                    } : { 
                      backgroundColor: 'hsl(var(--muted-foreground))',
                      animationDelay: '0ms'  
                    }}
                  ></span>
                  <span 
                    className="w-2 h-2 rounded-full animate-bounce" 
                    style={imageColors ? { 
                      backgroundColor: imageColors.secondary,
                      animationDelay: '150ms' 
                    } : { 
                      backgroundColor: 'hsl(var(--muted-foreground))',
                      animationDelay: '150ms'  
                    }}
                  ></span>
                  <span 
                    className="w-2 h-2 rounded-full animate-bounce" 
                    style={imageColors ? { 
                      backgroundColor: imageColors.accent,
                      animationDelay: '300ms' 
                    } : { 
                      backgroundColor: 'hsl(var(--muted-foreground))',
                      animationDelay: '300ms'  
                    }}
                  ></span>
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
          </div>

          {/* Message Input */}
          <form 
            onSubmit={handleSendMessage} 
            className="border-t p-4 backdrop-blur-md shadow-sm"
            style={imageColors ? {
              backgroundColor: `${imageColors.accent}20`,
              borderTopColor: `${imageColors.primary}40`
            } : { backgroundColor: 'hsl(var(--card) / 0.8)' }}
          >
            {/* Attachment Preview */}
            {(attachmentFile || isRecording) && (
              <div className="mb-3 p-3 rounded-lg border" style={imageColors ? {
                backgroundColor: `${imageColors.primary}15`,
                borderColor: `${imageColors.accent}40`
              } : { backgroundColor: 'hsl(var(--muted))' }}>
                {isRecording ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Mic className="h-5 w-5 text-red-500 animate-pulse" />
                        <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-ping" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">Recording voice message...</span>
                        <span className="text-xs opacity-70">{formatDuration(recordingTime)}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={handleStopRecording}>
                        <Pause className="h-4 w-4 mr-1" />
                        Stop
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={handleCancelRecording}>
                        <XCircle className="h-4 w-4 mr-1" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : attachmentFile && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {attachmentPreview ? (
                        <img src={attachmentPreview} alt="Preview" className="w-12 h-12 object-cover rounded" loading="lazy" />
                      ) : (
                        <div className="text-2xl">{getFileIcon(attachmentFile.type)}</div>
                      )}
                      <div className="flex flex-col">
                        <span className="text-sm font-medium truncate max-w-xs">{attachmentFile.name}</span>
                        <span className="text-xs opacity-70">{formatFileSize(attachmentFile.size)}</span>
                      </div>
                    </div>
                    <Button type="button" size="sm" variant="ghost" onClick={handleClearAttachment}>
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}

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

              {/* File Attachment Button */}
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                className="hidden"
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
              />
              <Button 
                type="button" 
                variant="outline" 
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={isRecording || uploadingAttachment}
              >
                <Paperclip className="h-5 w-5" />
              </Button>

              {/* Voice Recording Button */}
              <Button 
                type="button" 
                variant="outline" 
                size="icon"
                onClick={isRecording ? handleStopRecording : handleStartRecording}
                disabled={!!attachmentFile || uploadingAttachment}
                className={isRecording ? 'bg-red-50 border-red-300' : ''}
              >
                <Mic className={`h-5 w-5 ${isRecording ? 'text-red-500' : ''}`} />
              </Button>

              <Input
                value={newMessage}
                onChange={(e) => {
                  setNewMessage(e.target.value);
                  handleTyping();
                }}
                placeholder="Type a message..."
                className="flex-1"
              />
              <Button 
                type="submit" 
                disabled={(!newMessage.trim() && !attachmentFile) || uploadingAttachment || isRecording}
                className="hover:shadow-lg transition-all"
                style={imageColors ? {
                  background: `linear-gradient(135deg, ${imageColors.primary} 0%, ${imageColors.accent} 100%)`,
                  color: 'white'
                } : undefined}
              >
                {uploadingAttachment ? 'Uploading...' : 'Send'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

export default memo(ChatRoom);
