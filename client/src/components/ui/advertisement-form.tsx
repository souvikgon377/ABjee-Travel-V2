"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { CheckCircle2, ImagePlus, Loader2, Phone, Sparkles, UploadCloud } from 'lucide-react';
import { firestoreDb } from '@/lib/firebaseFirestore';
import { uploadImageToCloudinary } from '@/lib/imageUpload';
import { fetchAdvertisementLocations, type AdvertisementLocationOption } from '@/lib/advertisementLocations';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type AdvertisementStatus = 'pending' | 'approved';

type AdvertisementFormProps = {
  submitLabel: string;
  defaultStatus?: AdvertisementStatus;
  mode?: 'public' | 'admin';
  onSubmitted?: (id: string) => void;
};

const AD_COLLECTION = 'advertisements';

const emptyState = {
  name: '',
  mobileNumber: '',
  country: '',
  state: '',
  area: '',
  description: '',
};

export function AdvertisementForm({ submitLabel, defaultStatus = 'pending', mode = 'public', onSubmitted }: AdvertisementFormProps) {
  const [form, setForm] = useState(emptyState);
  const [locations, setLocations] = useState<AdvertisementLocationOption[]>([]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    let active = true;

    fetchAdvertisementLocations()
      .then((response) => {
        if (!active) return;
        setLocations(response.locations || []);
      })
      .catch((error) => {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load locations');
      })
      .finally(() => {
        if (active) setLoadingLocations(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (photoPreview.startsWith('blob:')) {
        URL.revokeObjectURL(photoPreview);
      }
    };
  }, [photoPreview]);

  const countryOptions = useMemo(
    () => Array.from(new Set(locations.map((location) => location.country))).sort((left, right) => left.localeCompare(right)),
    [locations],
  );

  const stateOptions = useMemo(
    () => Array.from(new Set(locations.filter((location) => location.country === form.country).map((location) => location.state))).sort((left, right) => left.localeCompare(right)),
    [form.country, locations],
  );

  const areaOptions = useMemo(
    () => Array.from(new Set(locations.filter((location) => location.country === form.country && location.state === form.state).map((location) => location.area))).sort((left, right) => left.localeCompare(right)),
    [form.country, form.state, locations],
  );

  const updateField = (key: keyof typeof emptyState, value: string) => {
    setErrorMessage('');
    setSuccessMessage('');

    setForm((current) => {
      if (key === 'country') {
        return { ...current, country: value, state: '', area: '' };
      }

      if (key === 'state') {
        return { ...current, state: value, area: '' };
      }

      return { ...current, [key]: value };
    });
  };

  const handlePhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setErrorMessage('');
    setSuccessMessage('');

    if (photoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(photoPreview);
    }

    if (!file) {
      setPhotoFile(null);
      setPhotoPreview('');
      return;
    }

    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const resetForm = () => {
    if (photoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(photoPreview);
    }

    setForm(emptyState);
    setPhotoFile(null);
    setPhotoPreview('');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      if (!form.name.trim()) throw new Error('Name is required');
      if (!form.mobileNumber.trim()) throw new Error('Mobile number is required');
      if (!form.country || !form.state || !form.area) throw new Error('Please select country, state, and area/locality');
      if (!photoFile) throw new Error('Please upload one photo');

      const uploadResult = await uploadImageToCloudinary(photoFile, { folder: 'advertisements' });

      const documentRef = await addDoc(collection(firestoreDb, AD_COLLECTION), {
        name: form.name.trim(),
        mobileNumber: form.mobileNumber.trim(),
        description: form.description ? form.description.trim() : '',
        country: form.country,
        state: form.state,
        area: form.area,
        photoUrl: uploadResult.url,
        photoPublicId: uploadResult.publicId,
        photoHash: uploadResult.hash,
        status: defaultStatus,
        approvalStatus: defaultStatus,
        source: mode,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        approvedAt: defaultStatus === 'approved' ? serverTimestamp() : null,
      });

      setSuccessMessage(defaultStatus === 'approved' ? 'Advertisement saved and marked approved.' : 'Advertisement submitted for approval.');
      resetForm();
      onSubmitted?.(documentRef.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to submit advertisement');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="border-white/10 bg-white/90 shadow-2xl shadow-rose-500/10 backdrop-blur dark:bg-slate-950/80">
      <CardHeader className="space-y-3 border-b border-border/60 bg-linear-to-r from-rose-500/10 via-orange-500/10 to-amber-500/10">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1 rounded-full px-3 py-1">
            <Sparkles className="h-3.5 w-3.5" />
            Advertisement Request
          </Badge>
          <Badge variant={defaultStatus === 'approved' ? 'default' : 'outline'} className="rounded-full px-3 py-1">
            {defaultStatus === 'approved' ? 'Admin add' : 'Needs approval'}
          </Badge>
        </div>
        <CardTitle className="text-2xl">Submit your advertisement</CardTitle>
        <CardDescription>
          Share your name, mobile number, one photo, and location. We&apos;ll route pending requests to the admin panel for approval.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5 p-5 sm:p-6">
        {loadingLocations ? (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading existing locations from the database...
          </div>
        ) : null}

        {errorMessage ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
            {errorMessage}
          </div>
        ) : null}

        {successMessage ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
            <CheckCircle2 className="mr-2 inline-block h-4 w-4" />
            {successMessage}
          </div>
        ) : null}

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium">Name</span>
              <Input
                value={form.name}
                onChange={(event) => updateField('name', event.target.value)}
                placeholder="Your business or personal name"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium">Short description (optional)</span>
              <textarea
                value={form.description}
                onChange={(e) => setForm((cur) => ({ ...cur, description: e.target.value }))}
                rows={3}
                maxLength={300}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Briefly describe your ad or offer (max 300 chars)"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium">Mobile Number</span>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={form.mobileNumber}
                  onChange={(event) => updateField('mobileNumber', event.target.value)}
                  placeholder="10-digit mobile number"
                  className="pl-9"
                  inputMode="tel"
                />
              </div>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-2">
              <span className="text-sm font-medium">Country</span>
              <Select value={form.country} onValueChange={(value) => updateField('country', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  {countryOptions.map((country) => (
                    <SelectItem key={country} value={country}>
                      {country}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium">State</span>
              <Select value={form.state} onValueChange={(value) => updateField('state', value)} disabled={!form.country}>
                <SelectTrigger>
                  <SelectValue placeholder="Select state" />
                </SelectTrigger>
                <SelectContent>
                  {stateOptions.map((state) => (
                    <SelectItem key={state} value={state}>
                      {state}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium">Area / Locality</span>
              <Select value={form.area} onValueChange={(value) => updateField('area', value)} disabled={!form.state}>
                <SelectTrigger>
                  <SelectValue placeholder="Select area/locality" />
                </SelectTrigger>
                <SelectContent>
                  {areaOptions.map((area) => (
                    <SelectItem key={area} value={area}>
                      {area}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <label className="space-y-2">
              <span className="text-sm font-medium">Advertisement Photo</span>
              <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br from-rose-500 to-orange-500 text-white shadow-lg shadow-rose-500/20">
                    <ImagePlus className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Upload one photo</p>
                    <p className="text-xs text-muted-foreground">PNG, JPG, or WEBP. This will be used in the advertisement card.</p>
                  </div>
                </div>
                <Input type="file" accept="image/*" onChange={handlePhotoChange} className="mt-4" />
                {photoPreview ? (
                  <img
                    src={photoPreview}
                    alt="Selected advertisement preview"
                    className="mt-4 h-44 w-full rounded-xl object-cover"
                  />
                ) : null}
              </div>
            </label>

            <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <UploadCloud className="h-4 w-4 text-rose-500" />
                What happens next
              </div>
              <ul className="mt-3 space-y-3 text-sm text-muted-foreground">
                <li className="flex gap-2"><span className="mt-1 h-2 w-2 rounded-full bg-rose-500" />We upload your photo and store the request in Firestore.</li>
                <li className="flex gap-2"><span className="mt-1 h-2 w-2 rounded-full bg-orange-500" />Pending submissions are reviewed from the admin panel.</li>
                <li className="flex gap-2"><span className="mt-1 h-2 w-2 rounded-full bg-amber-500" />Approved ads can be added live immediately by admin.</li>
              </ul>
            </div>
          </div>

          <Button type="submit" disabled={submitting || loadingLocations} className="w-full gap-2 sm:w-auto">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitLabel}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}