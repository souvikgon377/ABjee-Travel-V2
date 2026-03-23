type AvatarCandidate = {
  photoURL?: unknown;
  photoUrl?: unknown;
  photo_url?: unknown;
  profilePhoto?: unknown;
  avatar?: unknown;
  avatarUrl?: unknown;
  avatarURL?: unknown;
  avatar_url?: unknown;
  profilePicture?: unknown;
  profile_picture?: unknown;
  profileImage?: unknown;
  profile_image?: unknown;
  imageUrl?: unknown;
  imageURL?: unknown;
  image_url?: unknown;
  image?: unknown;
  picture?: unknown;
  user?: AvatarCandidate;
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export const resolveAvatarUrl = (...candidates: Array<AvatarCandidate | null | undefined>): string => {
  for (const candidate of candidates) {
    if (!candidate) continue;

    const avatar = [
      candidate.profilePicture,
      candidate.photoURL,
      candidate.photoUrl,
      candidate.photo_url,
      candidate.profilePhoto,
      candidate.avatar,
      candidate.avatarUrl,
      candidate.avatarURL,
      candidate.avatar_url,
      candidate.profile_picture,
      candidate.profileImage,
      candidate.profile_image,
      candidate.imageUrl,
      candidate.imageURL,
      candidate.image_url,
      candidate.image,
      candidate.picture,
      candidate.user?.profilePicture,
      candidate.user?.photoURL,
      candidate.user?.photoUrl,
      candidate.user?.avatar,
      candidate.user?.avatarUrl,
      candidate.user?.profileImage,
      candidate.user?.imageUrl,
      candidate.user?.image,
      candidate.user?.picture,
    ].find(isNonEmptyString);

    if (avatar) {
      return avatar;
    }
  }

  return '';
};
