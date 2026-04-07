"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Crown, Eye, EyeOff, Loader2, Upload, UserCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import Header from '../components/mvpblocks/header-1';
import { usersAPI } from '../lib/api';
import { uploadImageToR2 } from '../lib/r2Upload';
import { resolveAvatarUrl } from '../lib/avatar';
import { getSubscriptionInfo, hasPaidAccess } from '../lib/subscriptionPolicy';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';

type ProfileFormData = {
  firstName: string;
  lastName: string;
  city: string;
  address: string;
  zipCode: string;
  bio: string;
  travelInterestsText: string;
  preferredDestinationsText: string;
  currentPassword: string;
  password: string;
  confirmPassword: string;
};

type SavedProfileDetails = {
  name: string;
  email: string;
  city: string;
  address: string;
  zipCode: string;
  bio: string;
  travelInterests: string;
  preferredDestinations: string;
};

const emptyForm: ProfileFormData = {
  firstName: '',
  lastName: '',
  city: '',
  address: '',
  zipCode: '',
  bio: '',
  travelInterestsText: '',
  preferredDestinationsText: '',
  currentPassword: '',
  password: '',
  confirmPassword: '',
};

const arrayToCsv = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value.filter(Boolean).join(', ');
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  return '';
};

const csvToArray = (value: string): string[] => {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

export default function ProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser, userProfile, loading, updateUserProfile, changePassword } = useAuth();

  const mapSavedDetails = (user: any): SavedProfileDetails => ({
    name:
      `${user?.firstName || ''} ${user?.lastName || ''}`.trim() ||
      user?.displayName ||
      currentUser?.displayName ||
      currentUser?.email ||
      'Traveler',
    email: user?.email || currentUser?.email || 'Not available',
    city: user?.city?.trim() || 'Not added yet',
    address: user?.address?.trim() || 'Not added yet',
    zipCode: user?.zipCode?.trim() || 'Not added yet',
    bio: user?.bio?.trim() || 'Not added yet',
    travelInterests: arrayToCsv(user?.travelInterests) || 'Not added yet',
    preferredDestinations: arrayToCsv(user?.preferredDestinations) || 'Not added yet',
  });

  const [formData, setFormData] = useState<ProfileFormData>(emptyForm);
  const [savedProfileDetails, setSavedProfileDetails] = useState<SavedProfileDetails>(
    mapSavedDetails(userProfile)
  );
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string>('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [subscriptionSourceProfile, setSubscriptionSourceProfile] = useState<any>(userProfile || null);
  const isOnboarding = searchParams.get('onboarding') === '1';

  const derivedNamesFromGoogle = useMemo(() => {
    const sourceName = (currentUser?.displayName || userProfile?.displayName || '').trim();
    if (!sourceName) return { firstName: '', lastName: '' };

    const parts = sourceName.split(/\s+/).filter(Boolean);
    return {
      firstName: parts[0] || '',
      lastName: parts.slice(1).join(' '),
    };
  }, [currentUser?.displayName, userProfile?.displayName]);

  const displayName = useMemo(() => {
    const composed = `${formData.firstName} ${formData.lastName}`.trim();
    if (composed) return composed;
    return userProfile?.displayName || currentUser?.displayName || currentUser?.email || 'Traveler';
  }, [formData.firstName, formData.lastName, userProfile?.displayName, currentUser?.displayName, currentUser?.email]);

  // True only for email+password accounts; Google/OAuth users have no password to verify
  const isEmailPasswordUser = useMemo(
    () => currentUser?.providerData?.some((p: any) => p.providerId === 'password') ?? false,
    [currentUser]
  );

  const profilePhoto = useMemo(() => {
    return imagePreviewUrl || resolveAvatarUrl(userProfile, currentUser as Record<string, unknown> | null | undefined) || '';
  }, [imagePreviewUrl, userProfile, currentUser]);

  const subscriptionInfo = useMemo(() => getSubscriptionInfo(subscriptionSourceProfile), [subscriptionSourceProfile]);
  const isPaidSubscription = useMemo(() => hasPaidAccess(subscriptionInfo), [subscriptionInfo]);

  const subscriptionTypeLabel = useMemo(() => {
    if (!subscriptionInfo.type || subscriptionInfo.type === 'free') {
      return 'Free';
    }

    return subscriptionInfo.type === 'premium' ? 'Premium' : 'Paid';
  }, [subscriptionInfo.type]);

  const subscriptionValidityLabel = useMemo(() => {
    if (!subscriptionInfo.isActive || subscriptionInfo.type === 'free') {
      return 'No active paid subscription';
    }

    if (!subscriptionInfo.endDate) {
      return 'Active';
    }

    return `Valid until ${subscriptionInfo.endDate.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })}`;
  }, [subscriptionInfo.endDate, subscriptionInfo.isActive, subscriptionInfo.type]);

  const subscriptionStartLabel = useMemo(() => {
    if (!subscriptionInfo.startDate) {
      return 'Not available';
    }

    return subscriptionInfo.startDate.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }, [subscriptionInfo.startDate]);

  const subscriptionEndDateLabel = useMemo(() => {
    if (!subscriptionInfo.endDate) {
      return 'Not available';
    }

    return subscriptionInfo.endDate.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }, [subscriptionInfo.endDate]);

  const subscriptionStatusLabel = useMemo(() => {
    if (subscriptionInfo.type === 'free') {
      return 'Free';
    }

    return subscriptionInfo.isActive && hasPaidAccess(subscriptionInfo) ? 'Active' : 'Inactive';
  }, [subscriptionInfo]);

  useEffect(() => {
    if (!loading && !currentUser) {
      router.replace('/auth?redirect=%2Fprofile');
    }
  }, [loading, currentUser, router]);

  useEffect(() => {
    const hydrateForm = (user: any) => {
      setFormData({
        firstName: user?.firstName || derivedNamesFromGoogle.firstName || '',
        lastName: user?.lastName || derivedNamesFromGoogle.lastName || '',
        city: user?.city || '',
        address: user?.address || '',
        zipCode: user?.zipCode || '',
        bio: user?.bio || '',
        travelInterestsText: arrayToCsv(user?.travelInterests),
        preferredDestinationsText: arrayToCsv(user?.preferredDestinations),
        currentPassword: '',
        password: '',
        confirmPassword: '',
      });
    };

    const loadProfile = async () => {
      if (!currentUser) {
        setPageLoading(false);
        return;
      }

      try {
        setPageLoading(true);
        if (userProfile) {
          hydrateForm(userProfile);
          setSavedProfileDetails(mapSavedDetails(userProfile));
          setSubscriptionSourceProfile(userProfile);

          const existingSubscription = (userProfile as any)?.subscription;
          if (existingSubscription && typeof existingSubscription === 'object') {
            return;
          }
        }

        const response = await usersAPI.getProfile();
        const fetchedUser = response?.data?.data?.user || {};
        hydrateForm(fetchedUser);
        setSavedProfileDetails(mapSavedDetails(fetchedUser));
        setSubscriptionSourceProfile(fetchedUser);
      } catch {
        const fallbackUser = {
          firstName: derivedNamesFromGoogle.firstName,
          lastName: derivedNamesFromGoogle.lastName,
          city: userProfile?.city || '',
          address: userProfile?.address || '',
          zipCode: userProfile?.zipCode || '',
          subscription: (userProfile as any)?.subscription,
        };
        hydrateForm(fallbackUser);
        setSavedProfileDetails(mapSavedDetails(fallbackUser));
        setSubscriptionSourceProfile(fallbackUser);
        setError('Unable to load your profile right now. Please refresh and try again.');
      } finally {
        setPageLoading(false);
      }
    };

    loadProfile();
  }, [currentUser, userProfile, derivedNamesFromGoogle.firstName, derivedNamesFromGoogle.lastName]);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleProfileImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (imagePreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreviewUrl);
    }

    setSelectedImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setError(null);

    const effectiveFirstName = formData.firstName.trim() || userProfile?.firstName?.trim() || derivedNamesFromGoogle.firstName;
    const effectiveLastName = formData.lastName.trim() || userProfile?.lastName?.trim() || derivedNamesFromGoogle.lastName;

    if (isOnboarding) {
      const missingLabels: string[] = [];

      if (!effectiveFirstName) missingLabels.push('First Name');
      if (!effectiveLastName) missingLabels.push('Last Name');
      if (!formData.city.trim()) missingLabels.push('City');
      if (!formData.address.trim()) missingLabels.push('Address');
      if (!formData.zipCode.trim()) missingLabels.push('Zip Code');

      if (missingLabels.length > 0) {
        setError(`Please complete required fields: ${missingLabels.join(', ')}`);
        return;
      }
    }

    const hasPasswordInput = formData.password.trim().length > 0 || formData.confirmPassword.trim().length > 0;
    if (hasPasswordInput) {
      // Only require current password for email/password accounts
      if (isEmailPasswordUser && !formData.currentPassword.trim()) {
        setError('Please enter your current password to set a new one.');
        return;
      }

      if (formData.password.length < 6) {
        setError('New password should be at least 6 characters.');
        return;
      }

      if (formData.password !== formData.confirmPassword) {
        setError('Password and confirm password do not match.');
        return;
      }
    }

    try {
      setSaving(true);

      let uploadedPhotoUrl: string | undefined;
      if (selectedImageFile) {
        const uploadResult = await uploadImageToR2(selectedImageFile, {
          folder: 'user-profiles',
          maxSizeBytes: 5 * 1024 * 1024,
        });
        uploadedPhotoUrl = uploadResult.url;
      }

      const trimmedFirstName = formData.firstName.trim();
      const trimmedLastName = formData.lastName.trim();
      const profilePayload: any = {
        city: formData.city.trim(),
        address: formData.address.trim(),
        zipCode: formData.zipCode.trim(),
        bio: formData.bio.trim(),
        travelInterests: csvToArray(formData.travelInterestsText),
        preferredDestinations: csvToArray(formData.preferredDestinationsText),
      };

      if (trimmedFirstName.length >= 2) {
        profilePayload.firstName = trimmedFirstName;
      } else if (isOnboarding && effectiveFirstName.length >= 2) {
        profilePayload.firstName = effectiveFirstName;
      }

      if (trimmedLastName.length >= 2) {
        profilePayload.lastName = trimmedLastName;
      } else if (isOnboarding && effectiveLastName.length >= 2) {
        profilePayload.lastName = effectiveLastName;
      }

      if (uploadedPhotoUrl) {
        profilePayload.photoURL = uploadedPhotoUrl;
        profilePayload.avatar = uploadedPhotoUrl;
        profilePayload.profileImage = uploadedPhotoUrl;
      }

      await updateUserProfile(profilePayload);

      // Show updated values instantly, then revalidate in background.
      setSavedProfileDetails((prev) => ({
        ...prev,
        name:
          `${profilePayload.firstName || ''} ${profilePayload.lastName || ''}`.trim() || prev.name,
        city: profilePayload.city || prev.city,
        address: profilePayload.address || prev.address,
        zipCode: profilePayload.zipCode || prev.zipCode,
        bio: profilePayload.bio || prev.bio,
        travelInterests: arrayToCsv(profilePayload.travelInterests) || prev.travelInterests,
        preferredDestinations: arrayToCsv(profilePayload.preferredDestinations) || prev.preferredDestinations,
      }));

      usersAPI
        .getProfile()
        .then((refreshed) => {
          const refreshedUser = refreshed?.data?.data?.user || {};
          setSavedProfileDetails(mapSavedDetails(refreshedUser));
          setSubscriptionSourceProfile(refreshedUser);
        })
        .catch(() => {
          // Keep optimistic values if refresh fails.
        });

      if (hasPasswordInput) {
        await changePassword(formData.password, formData.currentPassword);
      }

      setFormData((prev) => ({ ...prev, currentPassword: '', password: '', confirmPassword: '' }));
      setSelectedImageFile(null);
      setMessage('Profile updated successfully.');
      router.push('/chat');
    } catch (submitError: any) {
      setError(submitError?.message || 'Failed to update profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || pageLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto flex min-h-[70vh] max-w-6xl items-center justify-center px-4">
          <Loader2 className="h-8 w-8 animate-spin text-rose-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto max-w-5xl px-4 pb-12 pt-28 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <UserCircle2 className="h-8 w-8 text-rose-500" />
          <div>
            <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Your Profile</h1>
            <p className="text-sm text-muted-foreground">
              {isOnboarding
                ? 'Complete your profile to join the community.'
                : 'Manage your public travel profile and preferences.'}
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>{displayName}</span>
              {isPaidSubscription && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  <Crown className="h-3.5 w-3.5" />
                  {subscriptionTypeLabel}
                </span>
              )}
            </CardTitle>
            <CardDescription>{currentUser?.email}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                Subscription Details
              </h2>
              <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                <div>
                  <p className="text-muted-foreground">Subscription Type</p>
                  <p className="font-medium text-foreground">{subscriptionTypeLabel}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <p className="font-medium text-foreground">{subscriptionStatusLabel}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Billing Cycle</p>
                  <p className="font-medium text-foreground">{subscriptionInfo.interval}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Valid From</p>
                  <p className="font-medium text-foreground">{subscriptionStartLabel}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Valid Until</p>
                  <p className="font-medium text-foreground">{subscriptionEndDateLabel}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Validity</p>
                  <p className="font-medium text-foreground">{subscriptionValidityLabel}</p>
                </div>
              </div>
            </div>

            <div className="mb-6 rounded-lg border bg-muted/40 p-4">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Saved Profile Details</h2>
              <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                <div>
                  <p className="text-muted-foreground">Name</p>
                  <p className="font-medium text-foreground">{savedProfileDetails.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Email</p>
                  <p className="font-medium text-foreground">{savedProfileDetails.email}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">City</p>
                  <p className="font-medium text-foreground">{savedProfileDetails.city}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Zip Code</p>
                  <p className="font-medium text-foreground">{savedProfileDetails.zipCode}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-muted-foreground">Address</p>
                  <p className="font-medium text-foreground">{savedProfileDetails.address}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-muted-foreground">Bio</p>
                  <p className="font-medium text-foreground whitespace-pre-wrap">{savedProfileDetails.bio}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-muted-foreground">Travel Interests</p>
                  <p className="font-medium text-foreground">{savedProfileDetails.travelInterests}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-muted-foreground">Preferred Destinations</p>
                  <p className="font-medium text-foreground">{savedProfileDetails.preferredDestinations}</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="profileImage">Profile Picture</Label>
                <div className="flex flex-col items-start gap-4 rounded-lg border p-4 sm:flex-row sm:items-center">
                  {profilePhoto ? (
                    <img src={profilePhoto} alt="Profile preview" className="h-20 w-20 rounded-full border-2 border-rose-500 object-cover" />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-rose-500 text-white">
                      {(displayName || 'U').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="w-full space-y-2">
                    <Input
                      id="profileImage"
                      type="file"
                      accept="image/*"
                      onChange={handleProfileImageChange}
                    />
                    <p className="text-xs text-muted-foreground">Upload JPG, PNG, WEBP, or GIF up to 5MB.</p>
                    {selectedImageFile && (
                      <div className="inline-flex items-center gap-2 text-xs text-rose-600">
                        <Upload className="h-3.5 w-3.5" />
                        {selectedImageFile.name} will be uploaded when you save changes.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input id="firstName" name="firstName" value={formData.firstName} onChange={handleInputChange} maxLength={50} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input id="lastName" name="lastName" value={formData.lastName} onChange={handleInputChange} maxLength={50} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input id="city" name="city" value={formData.city} onChange={handleInputChange} maxLength={80} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="zipCode">Zip Code</Label>
                <Input id="zipCode" name="zipCode" value={formData.zipCode} onChange={handleInputChange} maxLength={20} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="address">Address</Label>
                <Input id="address" name="address" value={formData.address} onChange={handleInputChange} maxLength={200} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea id="bio" name="bio" value={formData.bio} onChange={handleInputChange} maxLength={500} rows={4} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="travelInterestsText">Travel Interests</Label>
                <Input
                  id="travelInterestsText"
                  name="travelInterestsText"
                  value={formData.travelInterestsText}
                  onChange={handleInputChange}
                  placeholder="Hiking, Beaches, Food, Backpacking"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="preferredDestinationsText">Preferred Destinations</Label>
                <Input
                  id="preferredDestinationsText"
                  name="preferredDestinationsText"
                  value={formData.preferredDestinationsText}
                  onChange={handleInputChange}
                  placeholder="Goa, Himachal, Kerala"
                />
              </div>
              <div className="space-y-2 md:col-span-2 mt-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Change Password</p>
                <p className="text-xs text-muted-foreground">
                  {isEmailPasswordUser
                    ? 'Leave all three fields empty to keep your current password.'
                    : 'Leave both fields empty to keep your current password.'}
                </p>
              </div>
              {isEmailPasswordUser && (
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="currentPassword">Current Password</Label>
                <div className="relative">
                  <Input
                    id="currentPassword"
                    name="currentPassword"
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={formData.currentPassword}
                    onChange={handleInputChange}
                    autoComplete="current-password"
                    placeholder="Enter your current password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                    aria-label={showCurrentPassword ? 'Hide current password' : 'Show current password'}
                  >
                    {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={handleInputChange}
                    autoComplete="new-password"
                    minLength={6}
                    placeholder="Enter new password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    autoComplete="new-password"
                    minLength={6}
                    placeholder="Confirm new password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {(message || error) && (
                <div className="md:col-span-2">
                  <p className={message ? 'text-sm text-green-600' : 'text-sm text-red-600'}>{message || error}</p>
                </div>
              )}

              <div className="md:col-span-2 flex justify-end">
                <Button type="submit" className="min-w-32" disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Profile'
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
