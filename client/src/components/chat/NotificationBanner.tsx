import React, { useState, useCallback } from 'react';
import { X, Check, XCircle } from 'lucide-react';

export interface RoomInvitation {
  id: string;
  fromUserId: string;
  toUserId: string;
  type: 'room_invite';
  roomId: string;
  roomName: string;
  status: 'pending' | 'accepted' | 'rejected';
  message: string;
  createdAt: string;
  fromUserName?: string;
}

interface NotificationBannerProps {
  invitation: RoomInvitation;
  onAccept: (invitationId: string) => Promise<void>;
  onReject: (invitationId: string) => Promise<void>;
  onDismiss: (invitationId: string) => void;
}

export const NotificationBanner: React.FC<NotificationBannerProps> = ({
  invitation,
  onAccept,
  onReject,
  onDismiss,
}) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleAccept = useCallback(async () => {
    setIsLoading(true);
    try {
      await onAccept(invitation.id);
    } finally {
      setIsLoading(false);
    }
  }, [invitation.id, onAccept]);

  const handleReject = useCallback(async () => {
    setIsLoading(true);
    try {
      await onReject(invitation.id);
    } finally {
      setIsLoading(false);
    }
  }, [invitation.id, onReject]);

  const handleDismiss = useCallback(() => {
    onDismiss(invitation.id);
  }, [invitation.id, onDismiss]);

  return (
    <div className="bg-linear-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-500 rounded-lg shadow-md p-4 mb-4 flex items-center justify-between gap-4">
      <div className="flex-1">
        <h3 className="font-semibold text-gray-800">
          Community Invitation
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          You've been invited to join the private community{' '}
          <span className="font-medium text-blue-600">"{invitation.roomName}"</span>
          {invitation.fromUserName && (
            <span> by <span className="font-medium">{invitation.fromUserName}</span></span>
          )}
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleAccept}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Accept invitation"
        >
          <Check size={18} />
          Accept
        </button>
        <button
          onClick={handleReject}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Reject invitation"
        >
          <XCircle size={18} />
          Reject
        </button>
        <button
          onClick={handleDismiss}
          disabled={isLoading}
          className="flex items-center justify-center p-2 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          title="Dismiss"
        >
          <X size={20} />
        </button>
      </div>
    </div>
  );
};

interface NotificationContainerProps {
  invitations: RoomInvitation[];
  onAccept: (invitationId: string) => Promise<void>;
  onReject: (invitationId: string) => Promise<void>;
  onDismiss: (invitationId: string) => void;
}

export const NotificationContainer: React.FC<NotificationContainerProps> = ({
  invitations,
  onAccept,
  onReject,
  onDismiss,
}) => {
  if (invitations.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {invitations.map((invitation) => (
        <NotificationBanner
          key={invitation.id}
          invitation={invitation}
          onAccept={onAccept}
          onReject={onReject}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
};
