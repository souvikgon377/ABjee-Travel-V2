type AvatarCandidate = {
  photoURL?: unknown;
  avatar?: unknown;
  profilePicture?: unknown;
  profileImage?: unknown;
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export const resolveAvatarUrl = (...candidates: Array<AvatarCandidate | null | undefined>): string => {
  for (const candidate of candidates) {
    if (!candidate) continue;

    const avatar = [
      candidate.photoURL,
      candidate.avatar,
      candidate.profilePicture,
      candidate.profileImage,
    ].find(isNonEmptyString);

    if (avatar) {
      return avatar;
    }
  }

  return '';
};
