import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { chatService, type MessageAttachment } from '../../lib/chatService';
import { type ChatMessage, type ChatRoom as RoomType } from '../../lib/chatService';
import { useAuth } from '../../contexts/AuthContext';
import { uploadImageToR2, createImagePreview, revokeImagePreview } from '../../lib/r2Upload';
import { uploadFileToR2, VoiceRecorder, compressImageFile, formatFileSize, formatDuration, getFileIcon } from '../../lib/r2FileUpload';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card } from '../ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Label } from '../ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Lock, MoreVertical, Trash2, SmilePlus, Pencil, Check, X, ArrowUp, Settings, Paperclip, Mic, FileText, File, XCircle, Pause, Download, UserPlus, Search, Loader2, ArrowLeft } from 'lucide-react';
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
import { usersAPI } from '../../lib/api';
import { doc, onSnapshot } from 'firebase/firestore';
import { firestoreDb } from '../../lib/firebaseFirestore';
import { resolveAvatarUrl } from '../../lib/avatar';
import { getPrivateRoomParticipationAllowance } from '../../lib/subscriptionPolicy';
import { modernConfirm } from '../../lib/modernDialog';

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

const isGeneralCommunityRoom = (room: RoomType | null): boolean => {
  return typeof room?.name === 'string' && room.name.trim().toLowerCase() === 'general community chat';
};

type JoinRequestUser = {
  id: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  email?: string;
  avatar?: string;
  avatarUrl?: string;
  photoURL?: string;
  profileImage?: string;
  profilePicture?: string;
  imageUrl?: string;
};

const ChatRoom = () => {
  const params = useParams();
  const roomId = params.roomId as string;
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, userProfile } = useAuth();
  const [room, setRoom] = useState<RoomType | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userAvatarMap, setUserAvatarMap] = useState<Record<string, string>>({});
  const [typingUsers, setTypingUsers] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [loading, setLoading] = useState(true);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [joiningRoom, setJoiningRoom] = useState(false);
  const [showJoinRequestDialog, setShowJoinRequestDialog] = useState(false);
  const [joinRequestPending, setJoinRequestPending] = useState(false);
  const [requestingJoin, setRequestingJoin] = useState(false);
  const [joinRequestError, setJoinRequestError] = useState('');
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
  const [processingJoinRequestUserId, setProcessingJoinRequestUserId] = useState<string | null>(null);
  const [joinRequestUsersMap, setJoinRequestUsersMap] = useState<Record<string, JoinRequestUser>>({});
  const [voiceRecorder] = useState(() => new VoiceRecorder());
  const privateRoomAllowance = useMemo(
    () => getPrivateRoomParticipationAllowance(userProfile, 0),
    [userProfile]
  );
  const isAdminOrOwner = useMemo(() => {
    const role = typeof userProfile?.role === 'string' ? userProfile.role.toLowerCase() : '';
    return role === 'admin' || role === 'owner';
  }, [userProfile?.role]);
  const canManageCurrentCommunity = Boolean(
    user && room && ((room.isPublic && isAdminOrOwner) || (!room.isPublic && room.createdBy === user.uid))
  );
  const hasMessageAccess = useMemo(() => {
    if (!user || !room) return false;
    if (room.isPublic || isGeneralCommunityRoom(room)) return true;

    const participants = Array.isArray(room.participants) ? room.participants : [];
    return room.createdBy === user.uid || participants.includes(user.uid);
  }, [room, user]);

  // Add Members dialog state
  const [addMembersDialogOpen, setAddMembersDialogOpen] = useState(false);
  const [addMemberSearchQuery, setAddMemberSearchQuery] = useState('');
  const [addMemberAllUsers, setAddMemberAllUsers] = useState<any[]>([]);
  const [addMemberSearchResults, setAddMemberSearchResults] = useState<any[]>([]);
  const [addMemberLoading, setAddMemberLoading] = useState(false);
  const [addingMemberId, setAddingMemberId] = useState<string | null>(null);
  const [addMemberSuccess, setAddMemberSuccess] = useState<string | null>(null);
  const [invitedMemberIds, setInvitedMemberIds] = useState<Set<string>>(new Set());
  const [existingMemberIds, setExistingMemberIds] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // Extract colors from background image - memoized for performance
  const extractColorsFromImage = useCallback((imageUrl: string) => {
    if (!imageUrl || typeof window === 'undefined') return;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(imageUrl, window.location.origin);
    } catch {
      return;
    }

    // Canvas color extraction on cross-origin images requires ACAO headers.
    // Skip extraction to avoid noisy CORS failures and keep default theme colors.
    if (parsedUrl.origin !== window.location.origin) {
      return;
    }

    const img = new Image();
    img.src = parsedUrl.href;

    img.onload = () => {
      try {
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
      } catch {
        // If image analysis fails for any reason, keep existing/default colors.
      }
    };

    img.onerror = () => {
      // Ignore image read failures; UI can continue with fallback colors.
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
      router.push('/chat');
      return;
    }

    const init = async () => {
      try {
        setMessages([]);
        setHasMoreMessages(true);

        // Get room details
        const roomData = await chatService.getRoom(roomId);
        if (!roomData) {
          router.push('/chat');
          return;
        }
        
        setRoom(roomData);
        const generalCommunity = isGeneralCommunityRoom(roomData);
        const participants = Array.isArray(roomData.participants) ? roomData.participants : [];
        
        // Check if user is already a participant
        const isParticipant = participants.includes(user.uid);
        
        if (!isParticipant) {
          if (!roomData.isPublic && !generalCommunity) {
            const privateRoomCount = await chatService.getUserPrivateRoomMembershipCount(user.uid);
            const allowance = getPrivateRoomParticipationAllowance(userProfile, privateRoomCount);

            if (!allowance.allowed) {
              alert(allowance.reason || privateRoomAllowance.reason);
              router.push('/chat');
              return;
            }
          }

          // Check for invite token in URL
          const inviteToken = searchParams.get('invite');
          
          if (inviteToken) {
            // Try to join with invite token
            try {
              await chatService.joinRoom(roomId, user.uid, undefined, inviteToken);
              // Room listener will update the state automatically
            } catch (error: any) {
              alert(error.message || 'Invalid invite link');
              router.push('/chat');
              return;
            }
          } else if (roomData.isPublic || generalCommunity) {
            // For public rooms, join automatically without password
            try {
              await chatService.joinRoom(roomId, user.uid);
              // Room listener will update the state automatically
            } catch (error: any) {
              alert(error.message || 'Failed to join room');
              router.push('/chat');
              return;
            }
          } else {
            // For private rooms, exposed rooms use join requests, hidden rooms are invite-only
            if (roomData.visibility === 'exposed') {
              const alreadyRequested = (roomData.joinRequests || []).includes(user.uid);
              setJoinRequestPending(alreadyRequested);
              setShowJoinRequestDialog(true);
              setMessages([]);
            } else {
              alert('This private community is invite-only. Ask the admin for an invite link.');
              router.push('/chat');
              return;
            }
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
        if ((process.env.NODE_ENV === "development")) {
          console.error('Error initializing chat community:', error);
        }
        setLoading(false);
      }
    };

    init();
  }, [roomId, user, userProfile, router, searchParams, privateRoomAllowance.reason]);

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

  const handleJoinRequestSubmit = async () => {
    if (!roomId || !user || !room) return;

    setJoinRequestError('');
    setRequestingJoin(true);

    try {
      await chatService.requestToJoinRoom(roomId, user.uid);

      try {
        const token = localStorage.getItem('token') || await user.getIdToken();
        if (token) {
          const response = await fetch('/api/notifications/send-join-request', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              roomId,
              requesterName:
                userProfile?.displayName || user.displayName || user.email || 'A user',
              requesterEmail: userProfile?.email || user.email || '',
            }),
          });

          if (!response.ok) {
            const json = await response.json().catch(() => null);
            throw new Error(json?.message || 'Failed to send join request notification');
          }
        }
      } catch (notifyError) {
        if ((process.env.NODE_ENV === 'development')) {
          console.warn('Join request notification failed:', notifyError);
        }
      }

      setJoinRequestPending(true);
      setRoom((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          joinRequests: Array.from(new Set([...(prev.joinRequests || []), user.uid])),
        };
      });
    } catch (error: any) {
      setJoinRequestError(error.message || 'Failed to send join request');
    } finally {
      setRequestingJoin(false);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && !attachmentFile) || !roomId || !user) return;
    if (!hasMessageAccess) {
      alert('You can send messages only after your join request is approved.');
      return;
    }

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
        const isImage = fileToSend.type.startsWith('image/');
        attachment = await uploadFileToR2(fileToSend, {
          isVoiceMessage,
          maxSizeBytes: isImage ? 1024 * 1024 : undefined,
        });
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
  }, [newMessage, attachmentFile, roomId, user, hasMessageAccess]);

  const handleTyping = useCallback(() => {
    if (!roomId || !user || !hasMessageAccess) return;

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
  }, [roomId, user, hasMessageAccess]);

  const handleLeaveRoom = useCallback(async () => {
    if (!roomId) return;
    
    // Clear typing indicator before leaving
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    await chatService.stopTyping(roomId).catch(() => {});

    try {
      // For private communities, perform an actual membership exit.
      if (room && !room.isPublic && user?.uid) {
        const confirmed = await modernConfirm(`Exit private community "${room.name}"?`, {
          title: 'Exit Community',
          confirmText: 'Exit',
          cancelText: 'Stay',
          destructive: true,
        });
        if (!confirmed) {
          return;
        }
        await chatService.leaveRoom(roomId, user.uid);
      }

      router.push('/chat');
    } catch (error: any) {
      alert(error?.message || 'Failed to exit community');
    }
  }, [roomId, room, user, router]);

  const handleBackToChat = useCallback(() => {
    router.push('/chat');
  }, [router]);

  const handleDeleteForMe = useCallback(async (message: ChatMessage) => {
    if (!roomId || !message.id) return;
    try {
      await chatService.deleteMessageForMe(roomId, message.id);
      setMessages(prev => prev.filter(m => m.id !== message.id));
    } catch {
      alert('Failed to delete message');
    }
  }, [roomId]);

  const handleDeleteForEveryone = useCallback(async (message: ChatMessage) => {
    if (!roomId || !message.id) return;
    try {
      await chatService.deleteMessageForEveryone(roomId, message.id);
      setDeleteDialogOpen(false);
      setMessageToDelete(null);
    } catch {
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
    } catch (error: any) {
      alert(error?.message || 'Failed to edit message');
    }
  }, [roomId, editingMessageId, editText, cancelEditing]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    let preparedFile = file;

    // Public room image: compress and enforce 1MB.
    if (room?.isPublic && file.type.startsWith('image/')) {
      preparedFile = await compressImageFile(file, { maxSizeBytes: 1024 * 1024, maxDimension: 1600 });
      if (preparedFile.size > 1024 * 1024) {
        alert('Image must be 1MB or less in public rooms. Please choose a smaller image.');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }
    } else if (file.size > 10 * 1024 * 1024) {
      // Generic max size for non-public-image files.
      alert('File size must be less than 10MB');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    setAttachmentFile(preparedFile);
    
    // Create preview for images
    if (preparedFile.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => setAttachmentPreview(reader.result as string);
      reader.readAsDataURL(preparedFile);
    } else {
      setAttachmentPreview(null);
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [room?.isPublic]);

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
      const result = await uploadImageToR2(file, {
        folder: 'chat-rooms/backgrounds',
        convertToWebP: true,
        webpQuality: 0.82,
        maxImageDimension: 1920,
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
      const result = await uploadImageToR2(file, {
        folder: 'chat-rooms/icons',
        convertToWebP: true,
        webpQuality: 0.8,
        maxImageDimension: 512,
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
    if (!roomId || !hasMessageAccess || loadingMore || !hasMoreMessages || messages.length === 0) return;
    
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
      if ((process.env.NODE_ENV === "development")) {
        console.error('Error loading more messages:', error);
      }
      alert('Failed to load previous messages');
    } finally {
      setLoadingMore(false);
    }
  }, [roomId, hasMessageAccess, loadingMore, hasMoreMessages, messages]);

  const handleApproveJoinRequest = useCallback(async (requestUserId: string) => {
    if (!roomId || !user || !room || room.createdBy !== user.uid) return;

    setProcessingJoinRequestUserId(requestUserId);
    try {
      await (chatService as any).acceptJoinRequest(roomId, requestUserId, user.uid);
      setRoom(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          joinRequests: (prev.joinRequests || []).filter(uid => uid !== requestUserId),
          participants: Array.from(new Set([...(prev.participants || []), requestUserId]))
        };
      });
    } catch (error: any) {
      alert(error.message || 'Failed to approve join request');
    } finally {
      setProcessingJoinRequestUserId(null);
    }
  }, [roomId, user, room]);

  const handleRejectJoinRequest = useCallback(async (requestUserId: string) => {
    if (!roomId || !user || !room || room.createdBy !== user.uid) return;

    setProcessingJoinRequestUserId(requestUserId);
    try {
      await (chatService as any).rejectJoinRequest(roomId, requestUserId, user.uid);
      setRoom(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          joinRequests: (prev.joinRequests || []).filter(uid => uid !== requestUserId)
        };
      });
    } catch (error: any) {
      alert(error.message || 'Failed to reject join request');
    } finally {
      setProcessingJoinRequestUserId(null);
    }
  }, [roomId, user, room]);

  // Load all users when Add Members dialog opens
  const loadAllUsersForRoom = useCallback(async () => {
    setAddMemberLoading(true);
    try {
      const response = await usersAPI.searchUsers({ q: '' });
      const users = (response.data?.data?.users || []).map((u: any) => ({
        ...u,
        id: u._id || u.id
      }));

      // Safely normalize participants: RTDB may return an object {0:'uid',1:'uid'} or an array
      const rawParticipants = room?.participants;
      const participantIds: string[] = Array.isArray(rawParticipants)
        ? rawParticipants
        : rawParticipants && typeof rawParticipants === 'object'
          ? Object.values(rawParticipants as Record<string, string>)
          : [];

      // Track existing members for badge display (do NOT hide them)
      setExistingMemberIds(new Set(participantIds));

      // Show ALL users except the current user themselves
      const allOtherUsers = users.filter((u: any) => u.id !== user?.uid);
      setAddMemberAllUsers(allOtherUsers);
    } catch (err) {
      console.error('[AddMembers] Failed to load users:', err);
      setAddMemberAllUsers([]);
    } finally {
      setAddMemberLoading(false);
    }
  }, [room?.participants, user?.uid]);

  const loadJoinRequestUsers = useCallback(async () => {
    const joinRequestIds = Array.isArray(room?.joinRequests) ? room.joinRequests : [];
    if (joinRequestIds.length === 0) {
      setJoinRequestUsersMap({});
      return;
    }

    try {
      const response = await usersAPI.searchUsers({ q: '', limit: 500 });
      const users = response.data?.data?.users || [];
      const nextMap: Record<string, JoinRequestUser> = {};

      for (const rawUser of users) {
        const userId = String(rawUser?._id || rawUser?.id || '').trim();
        if (!userId || !joinRequestIds.includes(userId)) continue;

        nextMap[userId] = {
          id: userId,
          displayName: typeof rawUser?.displayName === 'string' ? rawUser.displayName : '',
          firstName: typeof rawUser?.firstName === 'string' ? rawUser.firstName : '',
          lastName: typeof rawUser?.lastName === 'string' ? rawUser.lastName : '',
          username: typeof rawUser?.username === 'string' ? rawUser.username : '',
          email: typeof rawUser?.email === 'string' ? rawUser.email : '',
          avatar: rawUser?.avatar,
          avatarUrl: rawUser?.avatarUrl,
          photoURL: rawUser?.photoURL,
          profileImage: rawUser?.profileImage,
          profilePicture: rawUser?.profilePicture,
          imageUrl: rawUser?.imageUrl,
        };
      }

      setJoinRequestUsersMap(nextMap);
    } catch {
      // Keep UID-only fallback view if requester details cannot be loaded.
    }
  }, [room?.joinRequests]);

  // Auto-load all users when dialog opens
  useEffect(() => {
    if (addMembersDialogOpen) {
      loadAllUsersForRoom();
    }
  }, [addMembersDialogOpen, loadAllUsersForRoom]);

  useEffect(() => {
    if (!settingsDialogOpen) return;
    if (!room || !user || room.createdBy !== user.uid) return;
    if (room.isPublic || room.visibility !== 'exposed') return;

    void loadJoinRequestUsers();
  }, [settingsDialogOpen, room, user, loadJoinRequestUsers]);

  // Client-side filter as user types
  const searchUsersForRoom = useCallback((query: string) => {
    if (!query.trim()) {
      setAddMemberSearchResults([]);
      return;
    }
    const q = query.toLowerCase();
    const filtered = addMemberAllUsers.filter((u: any) =>
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
      (u.username || '').toLowerCase().includes(q)
    );
    setAddMemberSearchResults(filtered);
  }, [addMemberAllUsers]);

  // Invite a user to the room
  const handleInviteMember = useCallback(async (member: any) => {
    if (!roomId || !room || !user) return;
    setAddingMemberId(member.id);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/notifications/send-invitations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        signal: controller.signal,
        body: JSON.stringify({
          roomId,
          roomName: room.name,
          inviteToken: room.inviteToken,
          memberIds: [member.id],
          inviterName: userProfile?.displayName || user.displayName || user.email || 'Community admin',
          inviterEmail: userProfile?.email || user.email || '',
        })
      });

      if (!response.ok) {
        let message = 'Failed to send invitation';
        try {
          const payload = await response.json();
          if (payload?.error && typeof payload.error === 'string') {
            message = payload.error;
          }
        } catch {
          // Ignore JSON parse errors and use default message.
        }
        throw new Error(message);
      }

      setInvitedMemberIds(prev => new Set([...prev, member.id]));
      setAddMemberSuccess(`Invitation sent to ${member.firstName} ${member.lastName}`);
      setTimeout(() => setAddMemberSuccess(null), 1000);
    } catch (error: any) {
      const isTimeout = error?.name === 'AbortError';
      alert(isTimeout ? 'Invite request timed out. Please try again.' : (error?.message || 'Failed to send invitation'));
    } finally {
      clearTimeout(timeoutId);
      setAddingMemberId(null);
    }
  }, [roomId, room, user]);

  // Filter on search query change (client-side, instant)
  useEffect(() => {
    searchUsersForRoom(addMemberSearchQuery);
  }, [addMemberSearchQuery, searchUsersForRoom]);

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

  useEffect(() => {
    const candidateUserIds = Array.from(
      new Set(
        messages
          .map((message) => message.userId)
          .filter((userId): userId is string => typeof userId === 'string' && userId.length > 0)
      )
    );

    if (candidateUserIds.length === 0) return;

    const unsubscribers = candidateUserIds.map((userId) => {
      const userRef = doc(firestoreDb, 'users', userId);

      return onSnapshot(userRef, (snapshot) => {
        const avatarUrl = snapshot.exists() ? resolveAvatarUrl(snapshot.data() as Record<string, unknown>) : '';

        setUserAvatarMap((prev) => {
          if (avatarUrl && prev[userId] === avatarUrl) return prev;
          if (!avatarUrl && !prev[userId]) return prev;

          const next = { ...prev };
          if (avatarUrl) {
            next[userId] = avatarUrl;
          } else {
            delete next[userId];
          }

          return next;
        });
      });
    });

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [messages]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading community...</p>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="p-6">
          <p className="text-muted-foreground">Community not found</p>
          <Button onClick={() => router.push('/chat')} className="mt-4">
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
        if (!open) router.push('/chat'); // Go back if dialog is closed
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
              <Label htmlFor="password">Community Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter community password"
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
                onClick={() => router.push('/chat')}
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={joiningRoom}>
                {joiningRoom ? 'Joining...' : 'Join Community'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Exposed Private Room Join Request Dialog */}
      <Dialog open={showJoinRequestDialog} onOpenChange={(open) => {
        if (!open) router.push('/chat');
        setShowJoinRequestDialog(open);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Request Access
            </DialogTitle>
            <DialogDescription>
              This is an exposed private community. Send a join request to the community admin for "{room?.name}".
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {joinRequestError && <p className="text-sm text-destructive">{joinRequestError}</p>}
            {joinRequestPending && (
              <p className="text-sm text-muted-foreground">
                Join request already sent. Please wait for admin approval.
              </p>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => router.push('/chat')}
              >
                Back
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={joinRequestPending || requestingJoin}
                onClick={handleJoinRequestSubmit}
              >
                {requestingJoin ? 'Sending...' : joinRequestPending ? 'Request Sent' : 'Send Request'}
              </Button>
            </div>
          </div>
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

      {/* Add Members Dialog */}
      <Dialog open={addMembersDialogOpen} onOpenChange={(open) => {
        setAddMembersDialogOpen(open);
        if (!open) {
          setAddMemberSearchQuery('');
          setAddMemberSearchResults([]);
          setAddMemberAllUsers([]);
          setAddMemberSuccess(null);
          setInvitedMemberIds(new Set());
          setExistingMemberIds(new Set());
        }
      }}>
        <DialogContent className="sm:max-w-md w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-blue-600" />
              Add Members
            </DialogTitle>
            <DialogDescription>
              Invite users to join <strong>{room.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 mt-2">
            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filter by name or username..."
                value={addMemberSearchQuery}
                onChange={(e) => setAddMemberSearchQuery(e.target.value)}
                className="pl-9 h-10"
                autoFocus
              />
              {addMemberSearchQuery && (
                <button
                  type="button"
                  onClick={() => setAddMemberSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* User list */}
            {addMemberLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading users...
              </div>
            ) : (() => {
              const displayList = addMemberSearchQuery.trim() ? addMemberSearchResults : addMemberAllUsers;
              return displayList.length > 0 ? (
                <div className="border rounded-xl divide-y max-h-72 overflow-y-auto">
                  {addMemberSearchQuery.trim() && (
                    <div className="px-3 py-1.5 bg-muted/40 text-xs text-muted-foreground">
                      {displayList.length} result{displayList.length !== 1 ? 's' : ''} for "{addMemberSearchQuery}"
                    </div>
                  )}
                  {!addMemberSearchQuery.trim() && (
                    <div className="px-3 py-1.5 bg-muted/40 text-xs text-muted-foreground">
                      {displayList.length} user{displayList.length !== 1 ? 's' : ''} available
                    </div>
                  )}
                  {displayList.map((result) => {
                    const isInvited = invitedMemberIds.has(result.id);
                    const isInviting = addingMemberId === result.id;
                    const isAlreadyMember = existingMemberIds.has(result.id);
                    const avatarSrc =
                      resolveAvatarUrl(result as Record<string, unknown>) ||
                      userAvatarMap[result.id] ||
                      '';
                    const fallbackInitial = (result.firstName?.[0] || result.username?.[0] || '?').toUpperCase();
                    return (
                      <div
                        key={result.id}
                        className="flex items-center justify-between px-3 py-2.5 hover:bg-muted/40 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarImage src={avatarSrc || undefined} alt={`${result.firstName || ''} ${result.lastName || ''}`.trim() || result.username || 'User'} />
                            <AvatarFallback className="bg-linear-to-br from-blue-400 to-indigo-500 text-white text-xs font-semibold">
                              {fallbackInitial}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{result.firstName} {result.lastName}</p>
                            <p className="text-xs text-muted-foreground truncate">@{result.username}</p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant={isAlreadyMember || isInvited ? 'ghost' : 'outline'}
                          className={`h-8 px-3 text-xs shrink-0 ml-2 ${
                            isAlreadyMember
                              ? 'text-slate-500 border-slate-200 bg-slate-50 cursor-default'
                              : isInvited
                              ? 'text-green-600 border-green-200 bg-green-50 cursor-default'
                              : 'text-blue-600 border-blue-300 hover:bg-blue-50'
                          }`}
                          onClick={() => !isAlreadyMember && !isInvited && handleInviteMember(result)}
                          disabled={isInviting || isInvited || isAlreadyMember}
                        >
                          {isInviting ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : isAlreadyMember ? (
                            'In Community'
                          ) : isInvited ? (
                            <><Check className="h-3.5 w-3.5 mr-1" />Invited</>
                          ) : (
                            'Invite'
                          )}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : addMemberSearchQuery.trim() ? (
                <p className="text-center text-sm text-muted-foreground py-8">No users match "{addMemberSearchQuery}"</p>
              ) : (
                <p className="text-center text-sm text-muted-foreground py-8">No users available to add</p>
              );
            })()}

            {/* Success banner */}
            {addMemberSuccess && (
              <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
                <Check className="h-4 w-4 shrink-0" />
                {addMemberSuccess}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={settingsDialogOpen} onOpenChange={(open) => !open && handleCloseSettings()}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Settings className="h-4 w-4 sm:h-5 sm:w-5" />
              Community Settings
            </DialogTitle>
            <DialogDescription>
              Customize the appearance of your chat community by uploading new images or selecting from previous uploads.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 sm:space-y-6 mt-4">
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
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    {backgroundPreview || selectedBackgroundImage || room.backgroundImage ? (
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg border-2 border-border overflow-hidden">
                        <img 
                          src={backgroundPreview || selectedBackgroundImage?.url || room.backgroundImage?.url} 
                          alt="Background preview" 
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg border-2 border-dashed border-border flex items-center justify-center bg-muted">
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
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
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
              <Label className="text-sm font-medium">Community Icon</Label>
              
              <Tabs value={iconImageTab} onValueChange={(v) => setIconImageTab(v as 'upload' | 'history')}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="upload">Upload New</TabsTrigger>
                  <TabsTrigger value="history">
                    Previous ({room.iconImageHistory?.length || 0})
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="upload" className="space-y-3 mt-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    {iconPreview || selectedIconImage || room.iconImage ? (
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-border overflow-hidden">
                        <img 
                          src={iconPreview || selectedIconImage?.url || room.iconImage?.url} 
                          alt="Icon preview" 
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-dashed border-border flex items-center justify-center bg-muted">
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
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-3">
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
                            className="w-full h-16 sm:h-20 object-cover"
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

            {/* Join Requests Section (Admin only for exposed private rooms) */}
            {user && room.createdBy === user.uid && !room.isPublic && room.visibility === 'exposed' && (
              <div className="space-y-3">
                <Label className="text-sm font-medium">Join Requests ({room.joinRequests?.length || 0})</Label>

                {room.joinRequests && room.joinRequests.length > 0 ? (
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {room.joinRequests.map((requestUserId) => (
                      (() => {
                        const requester = joinRequestUsersMap[requestUserId];
                        const requesterDisplayName =
                          requester?.displayName?.trim() ||
                          `${requester?.firstName || ''} ${requester?.lastName || ''}`.trim() ||
                          requester?.username?.trim() ||
                          requester?.email?.trim() ||
                          requestUserId;
                        const requesterAvatar = resolveAvatarUrl(requester);

                        return (
                      <div
                        key={requestUserId}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2"
                      >
                        <div className="min-w-0 flex items-start gap-3">
                          <Avatar className="h-9 w-9 shrink-0 border border-border/70">
                            {requesterAvatar ? (
                              <AvatarImage src={requesterAvatar} alt={requesterDisplayName} />
                            ) : null}
                            <AvatarFallback>
                              {requesterDisplayName.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 space-y-0.5">
                            <p className="text-sm font-medium truncate">{requesterDisplayName}</p>
                            {requester?.username && (
                              <p className="text-xs text-muted-foreground truncate">Username: {requester.username}</p>
                            )}
                            {requester?.email && (
                              <p className="text-xs text-muted-foreground truncate">Email: {requester.email}</p>
                            )}
                            <p className="text-xs text-muted-foreground truncate">User ID: {requestUserId}</p>
                            <p className="text-xs text-muted-foreground">Requested access to this room</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={processingJoinRequestUserId === requestUserId}
                            onClick={() => handleRejectJoinRequest(requestUserId)}
                            className="h-8"
                          >
                            <X className="h-3.5 w-3.5 mr-1" />
                            Reject
                          </Button>
                          <Button
                            type="button"
                            title="Community Settings"
                            disabled={processingJoinRequestUserId === requestUserId}
                            onClick={() => handleApproveJoinRequest(requestUserId)}
                            className="h-8"
                          >
                            <Check className="h-3.5 w-3.5 mr-1" />
                            Approve
                          </Button>
                        </div>
                      </div>
                        );
                      })()
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                    No pending join requests.
                  </div>
                )}
              </div>
            )}
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
      <div className="flex h-dvh bg-background overflow-hidden">
        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Header */}
          <div 
            className="border-b p-2 sm:p-3 md:p-4 flex flex-nowrap items-center gap-2 sm:gap-3 backdrop-blur-md shadow-sm shrink-0"
            style={imageColors ? {
              backgroundColor: `${imageColors.accent}20`,
              borderBottomColor: `${imageColors.primary}40`
            } : { backgroundColor: 'hsl(var(--card) / 0.8)' }}
          >
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBackToChat}
              title="Back to chats"
              className="group h-8 w-8 sm:h-9 sm:w-9 shrink-0"
            >
              <ArrowLeft className="h-4 w-4 transition-transform duration-200 ease-out group-hover:-translate-x-0.5 group-active:scale-90" />
            </Button>
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 overflow-hidden pr-1">
              {/* Room Icon */}
              {room.iconImage ? (
                <Avatar 
                  className="h-8 w-8 sm:h-10 md:h-12 sm:w-10 md:w-12 border-2 shrink-0"
                  style={imageColors ? {
                    borderColor: `${imageColors.primary}60`
                  } : { borderColor: 'hsl(var(--primary) / 0.2)' }}
                >
                  <AvatarImage src={room.iconImage.url} alt={room.name} />
                  <AvatarFallback>{room.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
              ) : (
                <div 
                  className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl shadow-md shrink-0"
                  style={imageColors ? {
                    background: `linear-gradient(135deg, ${imageColors.primary} 0%, ${imageColors.accent} 100%)`
                  } : undefined}
                >
                  <Lock className="h-4 w-4 sm:h-5 md:h-6 sm:w-5 md:w-6 text-white" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="text-xs sm:text-base md:text-lg lg:text-xl font-bold truncate leading-tight">{room.name}</h2>
                {room.description && (
                  <p className="hidden sm:block text-[10px] sm:text-xs md:text-sm text-muted-foreground truncate">{room.description}</p>
                )}
              </div>
            </div>
            <div className="ml-auto flex w-auto items-center justify-end gap-1 sm:gap-1.5 md:gap-2 shrink-0">
              <div className="shrink-0 max-[340px]:hidden">
                <ModeToggle />
              </div>
              {canManageCurrentCommunity && (
                <>
                  <div className="hidden sm:flex items-center gap-1 sm:gap-1.5 md:gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setAddMembersDialogOpen(true)}
                      title="Add Members"
                      className="h-8 w-8 sm:h-9 sm:w-9 shrink-0"
                    >
                      <UserPlus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setSettingsDialogOpen(true)}
                      title="Community Settings"
                      className="h-8 w-8 sm:h-9 sm:w-9 shrink-0"
                    >
                      <Settings className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </Button>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild className="sm:hidden">
                      <Button
                        variant="outline"
                        size="icon"
                        title="Community Actions"
                        className="h-8 w-8 shrink-0"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => setAddMembersDialogOpen(true)}>
                        <UserPlus className="mr-2 h-4 w-4" />
                        Add Members
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setSettingsDialogOpen(true)}>
                        <Settings className="mr-2 h-4 w-4" />
                        Community Settings
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleLeaveRoom}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        {room.isPublic ? 'Leave Room' : 'Exit Community'}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
              <Button 
                variant="outline" 
                onClick={handleLeaveRoom}
                className="hidden sm:inline-flex h-8 sm:h-9 px-2 sm:px-3 md:px-4 shrink-0"
              >
                <span className="text-[10px] sm:text-xs md:text-sm font-medium">
                  <span className="hidden sm:inline">{room.isPublic ? 'Leave Room' : 'Exit Community'}</span>
                  <span className="sm:hidden">Leave</span>
                </span>
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div 
            data-lenis-prevent
            className="flex-1 overflow-y-auto p-2 sm:p-3 md:p-4 space-y-3 sm:space-y-4 relative min-h-0"
            style={room.backgroundImage ? {
              backgroundImage: `url(${room.backgroundImage.url})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundAttachment: 'fixed'
            } : undefined}
          >
            {/* Messages content with higher z-index */}
            <div className="relative z-10 space-y-3 sm:space-y-4">
            {!hasMessageAccess && (
              <div className="mx-auto max-w-lg rounded-xl border border-border bg-card/90 p-4 text-center shadow-sm">
                <p className="text-sm font-semibold">Join request pending approval</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  You cannot view or send messages in this community until the admin approves your request.
                </p>
              </div>
            )}
            {/* Load More Button */}
            {hasMessageAccess && hasMoreMessages && messages.length >= 50 && (
              <div className="flex justify-center mb-3 sm:mb-4">
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

            {(hasMessageAccess ? filteredMessages : []).map((message) => {
                const isOwnMessage = message.userId === user?.uid;
                const isDeleted = message.deletedForEveryone;
                const isOnlyEmoji = isEmojiOnly(message.text);
                const messageAvatarUrl =
                  userAvatarMap[message.userId] ||
                  resolveAvatarUrl(message as Record<string, unknown>) ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(message.username)}&background=random`;
                
                return (
                  <div
                    key={message.id}
                    className={`flex items-start gap-2 sm:gap-3 ${isOwnMessage ? 'flex-row-reverse' : ''}`}
                  >
                    <Avatar className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 shrink-0">
                      <AvatarImage 
                        src={messageAvatarUrl}
                        alt={message.username}
                      />
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {message.username.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className={`flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'} max-w-[85%] sm:max-w-[80%] md:max-w-[70%]`}>
                      <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                        <span className="text-xs sm:text-sm font-medium">{message.username}</span>
                        <span className="text-[10px] sm:text-xs text-muted-foreground">{formatTime(message.timestamp)}</span>
                      </div>
                      <div className={`group relative flex items-center gap-2 ${isOwnMessage ? 'flex-row-reverse' : ''}`}>
                        {/* Inline Edit UI */}
                        {editingMessageId === message.id ? (
                          <div className="flex items-center gap-1.5 sm:gap-2">
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
                              className="w-full min-w-0 sm:min-w-50 bg-card/90 backdrop-blur-sm text-sm"
                              autoFocus
                            />
                            <Button
                              size="sm"
                              onClick={saveEdit}
                              className="h-7 w-7 sm:h-8 sm:w-8 p-0"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={cancelEditing}
                              className="h-7 w-7 sm:h-8 sm:w-8 p-0"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <div 
                              className={isOnlyEmoji ? 'text-2xl sm:text-3xl md:text-4xl animate-bounce-in' : `rounded-lg px-2.5 py-1.5 sm:px-3 sm:py-2 md:px-4 md:py-2 backdrop-blur-sm shadow-md ${
                                isDeleted 
                                  ? 'bg-muted/70 text-muted-foreground italic'
                                  : 'text-black dark:text-white'
                              }`}
                              style={!isDeleted && !isOnlyEmoji && isOwnMessage && imageColors ? {
                                background: `linear-gradient(135deg, ${imageColors.primary} 0%, ${imageColors.accent} 100%)`,
                                opacity: 0.95
                              } : !isDeleted && !isOnlyEmoji && !isOwnMessage && imageColors ? {
                                background: `linear-gradient(135deg, ${imageColors.secondary}DD 0%, ${imageColors.accent}CC 100%)`,
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
                                    <div className="mb-1.5 sm:mb-2">
                                      {message.attachment.type === 'image' ? (
                                        <img 
                                          src={message.attachment.url} 
                                          alt={message.attachment.name}
                                          className="max-w-50 sm:max-w-70 md:max-w-sm max-h-40 sm:max-h-48 md:max-h-64 rounded-lg cursor-pointer hover:opacity-90 transition-opacity w-full object-cover"
                                          onClick={() => window.open(message.attachment!.url, '_blank')}
                                          loading="lazy"
                                        />
                                      ) : message.attachment.type === 'voice' ? (
                                        <div className="flex w-full min-w-0 items-center gap-1.5 sm:gap-2 md:gap-3 bg-black/10 rounded-lg p-1.5 sm:p-2 md:p-3 sm:min-w-55 md:min-w-62.5">
                                          <Mic className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
                                          <audio 
                                            controls 
                                            className="flex-1" 
                                            src={message.attachment.url}
                                            style={{ height: '28px' }}
                                          >
                                            Your browser does not support the audio element.
                                          </audio>
                                          <a 
                                            href={message.attachment.url} 
                                            download={message.attachment.name}
                                            className="shrink-0 hover:opacity-70 transition-opacity p-1"
                                          >
                                            <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                          </a>
                                        </div>
                                      ) : message.attachment.type === 'video' ? (
                                        <video 
                                          controls 
                                          className="max-w-50 sm:max-w-70 md:max-w-sm max-h-40 sm:max-h-48 md:max-h-64 rounded-lg w-full"
                                          src={message.attachment.url}
                                          controlsList="nodownload"
                                          playsInline
                                        >
                                          Your browser does not support the video element.
                                        </video>
                                      ) : message.attachment.type === 'audio' ? (
                                        <div className="flex w-full min-w-0 flex-col gap-1.5 sm:gap-2 bg-black/10 rounded-lg p-1.5 sm:p-2 md:p-3 sm:min-w-55 md:min-w-62.5">
                                          <div className="flex items-center gap-1.5 sm:gap-2">
                                            <FileText className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
                                            <div className="flex-1 min-w-0">
                                              <div className="text-xs sm:text-sm font-medium truncate">{message.attachment.name}</div>
                                              <div className="text-[10px] sm:text-xs opacity-70">{formatFileSize(message.attachment.size)}</div>
                                            </div>
                                            <a 
                                              href={message.attachment.url} 
                                              download={message.attachment.name}
                                              className="shrink-0 hover:opacity-70 transition-opacity p-1"
                                            >
                                              <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                            </a>
                                          </div>
                                          <audio 
                                            controls 
                                            className="w-full" 
                                            src={message.attachment.url}
                                            style={{ height: '28px' }}
                                          />
                                        </div>
                                      ) : (
                                        <a 
                                          href={message.attachment.url} 
                                          download={message.attachment.name}
                                          className="flex w-full min-w-0 items-center gap-1.5 sm:gap-2 md:gap-3 bg-black/10 hover:bg-black/20 rounded-lg p-1.5 sm:p-2 md:p-3 transition-colors sm:min-w-55 md:min-w-62.5"
                                        >
                                          <span className="text-xl sm:text-2xl shrink-0">{getFileIcon(message.attachment.mimeType)}</span>
                                          <div className="flex-1 min-w-0">
                                            <div className="text-xs sm:text-sm font-medium truncate">{message.attachment.name}</div>
                                            <div className="text-[10px] sm:text-xs opacity-70">{formatFileSize(message.attachment.size)}</div>
                                          </div>
                                          <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                                        </a>
                                      )}
                                    </div>
                                  )}

                                  {message.text && (
                                    <span className={isOnlyEmoji ? 'inline-block hover:animate-wiggle' : 'text-xs sm:text-sm wrap-break-word'}>
                                      {message.text}
                                    </span>
                                  )}
                                  {message.edited && (
                                    <span className="text-[10px] sm:text-xs ml-1.5 sm:ml-2 opacity-70">(edited)</span>
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
                                className="h-6 w-6 p-0 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity"
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
            {hasMessageAccess && typingUsers.length > 0 && (
              <div 
                className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm"
                style={imageColors ? { color: imageColors.primary } : { color: 'hsl(var(--muted-foreground))' }}
              >
                <div className="flex gap-1">
                  <span 
                    className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full animate-bounce" 
                    style={imageColors ? { 
                      backgroundColor: imageColors.primary,
                      animationDelay: '0ms' 
                    } : { 
                      backgroundColor: 'hsl(var(--muted-foreground))',
                      animationDelay: '0ms'  
                    }}
                  ></span>
                  <span 
                    className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full animate-bounce" 
                    style={imageColors ? { 
                      backgroundColor: imageColors.secondary,
                      animationDelay: '150ms' 
                    } : { 
                      backgroundColor: 'hsl(var(--muted-foreground))',
                      animationDelay: '150ms'  
                    }}
                  ></span>
                  <span 
                    className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full animate-bounce" 
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
            className="border-t p-2 sm:p-3 md:p-4 backdrop-blur-md shadow-sm shrink-0"
            style={imageColors ? {
              backgroundColor: `${imageColors.accent}20`,
              borderTopColor: `${imageColors.primary}40`
            } : { backgroundColor: 'hsl(var(--card) / 0.8)' }}
          >
            {/* Attachment Preview */}
            {(attachmentFile || isRecording) && (
              <div className="mb-2 sm:mb-3 p-2 sm:p-3 rounded-lg border" style={imageColors ? {
                backgroundColor: `${imageColors.primary}15`,
                borderColor: `${imageColors.accent}40`
              } : { backgroundColor: 'hsl(var(--muted))' }}>
                {isRecording ? (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="relative">
                        <Mic className="h-5 w-5 text-red-500 animate-pulse" />
                        <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-ping" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs sm:text-sm font-medium">Recording voice message...</span>
                        <span className="text-[10px] sm:text-xs opacity-70">{formatDuration(recordingTime)}</span>
                      </div>
                    </div>
                    <div className="flex gap-1.5 sm:gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={handleStopRecording} className="text-xs">
                        <Pause className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                        <span className="hidden sm:inline">Stop</span>
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={handleCancelRecording} className="text-xs">
                        <XCircle className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                        <span className="hidden sm:inline">Cancel</span>
                      </Button>
                    </div>
                  </div>
                ) : attachmentFile && (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                      {attachmentPreview ? (
                        <img src={attachmentPreview} alt="Preview" className="w-12 h-12 object-cover rounded" loading="lazy" />
                      ) : (
                        <div className="text-2xl">{getFileIcon(attachmentFile.type)}</div>
                      )}
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-xs sm:text-sm font-medium truncate">{attachmentFile.name}</span>
                        <span className="text-[10px] sm:text-xs opacity-70">{formatFileSize(attachmentFile.size)}</span>
                      </div>
                    </div>
                    <Button type="button" size="sm" variant="ghost" onClick={handleClearAttachment} className="shrink-0">
                      <XCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-1.5 sm:gap-2">
              <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" size="icon" className="h-8 w-8 sm:h-9 sm:w-9 shrink-0">
                    <SmilePlus className="h-4 w-4 sm:h-5 sm:w-5" />
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
                disabled={!hasMessageAccess || isRecording || uploadingAttachment}
                className="h-8 w-8 sm:h-9 sm:w-9 shrink-0"
              >
                <Paperclip className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>

              {/* Voice Recording Button */}
              <Button 
                type="button" 
                variant="outline" 
                size="icon"
                onClick={isRecording ? handleStopRecording : handleStartRecording}
                disabled={!hasMessageAccess || !!attachmentFile || uploadingAttachment}
                className={`h-8 w-8 sm:h-9 sm:w-9 shrink-0 ${isRecording ? 'bg-red-50 border-red-300' : ''}`}
              >
                <Mic className={`h-4 w-4 sm:h-5 sm:w-5 ${isRecording ? 'text-red-500' : ''}`} />
              </Button>

              <Input
                value={newMessage}
                onChange={(e) => {
                  setNewMessage(e.target.value);
                  handleTyping();
                }}
                placeholder={hasMessageAccess ? 'Type a message...' : 'Waiting for admin approval...'}
                disabled={!hasMessageAccess}
                className="flex-1 min-w-0 text-sm sm:text-base h-8 sm:h-9"
              />
              <Button 
                type="submit" 
                disabled={!hasMessageAccess || (!newMessage.trim() && !attachmentFile) || uploadingAttachment || isRecording}
                className="hover:shadow-lg transition-all text-xs sm:text-sm px-2 sm:px-4 h-8 sm:h-9 shrink-0"
                style={imageColors ? {
                  background: `linear-gradient(135deg, ${imageColors.primary} 0%, ${imageColors.accent} 100%)`,
                  color: 'white'
                } : undefined}
              >
                <span className="hidden sm:inline">{uploadingAttachment ? 'Uploading...' : 'Send'}</span>
                <span className="sm:hidden">
                  {uploadingAttachment ? '...' : <ArrowUp className="h-4 w-4" />}
                </span>
              </Button>
            </div>

            {!hasMessageAccess && !room.isPublic && (
              <p className="mt-2 text-[11px] sm:text-xs text-muted-foreground">
                Access is granted only after the admin approves your join request.
              </p>
            )}

            {room.isPublic && (
              <p className="mt-2 text-[11px] sm:text-xs text-amber-700 dark:text-amber-400">
                Public room rules: no phone/email/links. Image limit per day - Free: 5, Trial/Monthly Paid: 50, Yearly Paid: 200. Images are compressed and capped at 1MB.
              </p>
            )}
          </form>
        </div>
      </div>
    </>
  );
};

export default memo(ChatRoom);



