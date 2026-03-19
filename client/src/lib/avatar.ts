type AvatarCandidate = {
  photoURL?: unknown;
  photoUrl?: unknown;
  avatar?: unknown;
  avatarUrl?: unknown;
  profilePicture?: unknown;
  profileImage?: unknown;
  imageUrl?: unknown;
  image?: unknown;
  picture?: unknown;
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
      candidate.avatar,
      candidate.avatarUrl,
      candidate.profileImage,
      candidate.imageUrl,
      candidate.image,
      candidate.picture,
    ].find(isNonEmptyString);

    if (avatar) {
      return avatar;
    }
  }

  return '';
};
