import { formatDistanceToNow } from 'date-fns';
import { memo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

import {
  Heart,
  Reply,
  MoreHorizontal,
  Trash,
  Flag,
  Shield,
  Pin,
} from 'lucide-react';
import { resolveAvatarUrl } from '@/lib/avatar';

interface User {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  isOnline?: boolean;
}

interface Message {
  id: string;
  content: string;
  type: 'text' | 'image' | 'file' | 'system' | 'travel_request';
  sender: User;
  createdAt: string;
  reactions?: Array<{
    user: User;
    emoji: string;
    createdAt: string;
  }>;
  replyTo?: {
    id: string;
    content: string;
    sender: User;
  };
}

interface ChatMessageProps {
  message: Message & {
    isModerated?: boolean;
    moderatedBy?: User;
    moderationReason?: string;
    reports?: Array<{
      user: User;
      reason: string;
      description?: string;
    }>;
  };
  currentUserId: string;
  onReply?: (message: Message) => void;
  onReaction?: (messageId: string, emoji: string) => void;
  onDelete?: (message: Message) => void;
  onReport?: (message: Message) => void;
  onModerate?: (message: Message) => void;
  onPin?: (message: Message) => void;
  userRole?: 'user' | 'moderator' | 'admin';
  isPinned?: boolean;
}

const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  currentUserId,
  onReply,
  onReaction,
  onDelete,
  onReport,
  onModerate,
  onPin,
  userRole = 'user',
  isPinned = false
}) => {
  const isOwnMessage = message.sender?.id === currentUserId;
  
  // Safely parse and format the timestamp
  let timeAgo = '';
  try {
    if (message.createdAt) {
      let timestamp: Date;
      
      // Check if it's a Firestore Timestamp object
      if (typeof message.createdAt === 'object' && '_seconds' in message.createdAt) {
        // Convert Firestore Timestamp to JavaScript Date
        const seconds = (message.createdAt as any)._seconds;
        const nanoseconds = (message.createdAt as any)._nanoseconds || 0;
        timestamp = new Date(seconds * 1000 + nanoseconds / 1000000);
      } else {
        // Try to parse as regular date string
        timestamp = new Date(message.createdAt);
      }
      
      if (!isNaN(timestamp.getTime())) {
        timeAgo = formatDistanceToNow(timestamp, { 
          addSuffix: true,
          includeSeconds: true 
        });
      } else {
        if ((process.env.NODE_ENV === "development")) {
          console.warn('Invalid timestamp for message:', message.id, message.createdAt);
        }
        timeAgo = 'just now';
      }
    }
  } catch (error) {
    if ((process.env.NODE_ENV === "development")) {
      console.error('Error formatting timestamp:', error, message.createdAt);
    }
    timeAgo = 'just now';
  }
  
  const isModerator = userRole === 'moderator' || userRole === 'admin';
  const senderAvatar = resolveAvatarUrl(message.sender as Record<string, unknown>);

  const handleReaction = (emoji: string) => {
    if (onReaction) {
      onReaction(message.id, emoji);
    }
  };

  const handleReply = () => {
    if (onReply) {
      onReply(message);
    }
  };

  if (message.type === 'system') {
    return (
      <div className="flex justify-center my-2">
        <div className="bg-muted px-3 py-1 rounded-full text-sm text-muted-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex gap-3 p-3 hover:bg-muted/50 group ${isOwnMessage ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarImage src={senderAvatar || undefined} />
        <AvatarFallback>
          {message.sender?.firstName?.[0] || '?'}{message.sender?.lastName?.[0] || '?'}
        </AvatarFallback>
      </Avatar>

      {/* Message Content */}
      <div className={`flex-1 min-w-0 ${isOwnMessage ? 'text-right' : ''}`}>
        {/* Header */}
        <div className={`flex items-center gap-2 mb-1 ${isOwnMessage ? 'flex-row-reverse' : ''}`}>
          <span className="font-medium text-sm">
            {message.sender?.firstName || 'Unknown'} {message.sender?.lastName || 'User'}
          </span>
          <span className="text-xs text-muted-foreground">
            {timeAgo}
          </span>
          {message.sender?.isOnline && (
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          )}
        </div>

        {/* Reply Reference */}
        {message.replyTo && (
          <div className={`mb-2 p-2 border-l-2 border-primary/20 bg-muted/30 rounded text-sm ${isOwnMessage ? 'text-right border-r-2 border-l-0' : ''}`}>
            <div className="font-medium text-xs text-muted-foreground">
              Replying to {message.replyTo.sender?.firstName || 'Unknown'}
            </div>
            <div className="truncate">
              {message.replyTo.content}
            </div>
          </div>
        )}

        {/* Message Content */}
        <div className={`${isOwnMessage ? 'bg-primary text-black dark:text-primary-foreground' : 'bg-muted text-black dark:text-foreground'} rounded-lg px-3 py-2 inline-block max-w-[70%]`}>
          {message.type === 'travel_request' ? (
            <div className="space-y-2">
              <div className="font-medium">=��� Travel Partner Request</div>
              <div className="text-sm">{message.content}</div>
            </div>
          ) : (
            <div className="whitespace-pre-wrap wrap-break-word">
              {message.content}
            </div>
          )}
        </div>

        {/* Reactions */}
        {message.reactions && message.reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {message.reactions.reduce((acc: any[], reaction) => {
              const existing = acc.find(r => r.emoji === reaction.emoji);
              if (existing) {
                existing.count++;
                existing.users.push(reaction.user);
              } else {
                acc.push({
                  emoji: reaction.emoji,
                  count: 1,
                  users: [reaction.user]
                });
              }
              return acc;
            }, []).map((reaction, index) => (
              <button
                key={index}
                onClick={() => handleReaction(reaction.emoji)}
                className="flex items-center gap-1 px-2 py-1 bg-muted hover:bg-muted/80 rounded-full text-xs"
              >
                <span>{reaction.emoji}</span>
                <span>{reaction.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Message Actions */}
        <div className={`opacity-0 group-hover:opacity-100 transition-opacity mt-1 ${isOwnMessage ? 'text-right' : ''}`}>
          <div className="flex gap-1 text-xs">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleReaction('G��n+�')}
              className="h-6 px-2"
            >
              <Heart className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReply}
              className="h-6 px-2"
            >
              <Reply className="h-3 w-3" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                >
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={isOwnMessage ? 'end' : 'start'}>
                {(isOwnMessage || isModerator) && (
                  <DropdownMenuItem onClick={() => onDelete?.(message)}>
                    <Trash className="h-4 w-4 mr-2" />
                    Delete message
                  </DropdownMenuItem>
                )}
                {!isOwnMessage && (
                  <DropdownMenuItem onClick={() => onReport?.(message)}>
                    <Flag className="h-4 w-4 mr-2" />
                    Report message
                  </DropdownMenuItem>
                )}
                {isModerator && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onModerate?.(message)}>
                      <Shield className="h-4 w-4 mr-2" />
                      Moderate
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onPin?.(message)}>
                      <Pin className="h-4 w-4 mr-2" />
                      {isPinned ? 'Unpin message' : 'Pin message'}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {message.isModerated && (
          <div className="mt-1 text-xs text-muted-foreground italic">
            [Message moderated by {message.moderatedBy?.username}
            {message.moderationReason && `: ${message.moderationReason}`}]
          </div>
        )}
        {isPinned && (
          <Badge variant="outline" className="mt-1">
            <Pin className="h-3 w-3 mr-1" /> Pinned
          </Badge>
        )}
      </div>
    </div>
  );
};

export default memo(ChatMessage);

