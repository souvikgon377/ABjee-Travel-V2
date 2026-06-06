"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { CheckCircle2, ImagePlus, Loader2, Mail, Phone, Sparkles, UploadCloud, ChevronsUpDown, Search, X } from 'lucide-react';
import { firestoreDb } from '@/lib/firebaseFirestore';
import { uploadImageToCloudinary } from '@/lib/imageUpload';
import { fetchAdvertisementLocations, type AdvertisementLocationOption } from '@/lib/advertisementLocations';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type AdvertisementStatus = 'pending' | 'approved';

type AdvertisementFormProps = {
  submitLabel: string;
  defaultStatus?: AdvertisementStatus;
  mode?: 'public' | 'admin';
  onSubmitted?: (id: string) => void;
  // Edit mode props
  adId?: string;
  initialValues?: Partial<{ name: string; mobileNumber: string; category: string; country: string; state: string; area: string; description: string; photoUrl?: string }>;
};

const AD_COLLECTION = 'advertisements';

type MultiSelectChecklistProps = {
  label: string;
  placeholder: string;
  options: string[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
};

export function MultiSelectChecklist({ label, placeholder, options, selectedValues, onChange, disabled }: MultiSelectChecklistProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredOptions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return options;
    return options.filter((opt) => opt.toLowerCase().includes(q));
  }, [options, searchQuery]);

  const toggleValue = (value: string) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((v) => v !== value));
    } else {
      if (selectedValues.length >= 10) {
        return;
      }
      onChange([...selectedValues, value]);
    }
  };

  const isMaxReached = selectedValues.length >= 10;

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between rounded-xl bg-background border-input px-3 py-2 text-sm font-normal text-muted-foreground shadow-sm hover:bg-background/80"
          >
            <span className="truncate text-foreground text-left flex-1">
              {selectedValues.length > 0
                ? `${selectedValues.length} selected`
                : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] max-h-72 p-0 bg-popover overflow-hidden flex flex-col z-50">
          <div className="flex items-center border-b px-3 py-2">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              placeholder={`Search ${label}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex h-8 w-full rounded-md bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <div className="overflow-y-auto p-1 max-h-48 flex-1 space-y-1">
            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">No options found.</div>
            ) : (
              filteredOptions.map((opt) => {
                const isChecked = selectedValues.includes(opt);
                const isDisabled = !isChecked && isMaxReached;
                return (
                  <div
                    key={opt}
                    onClick={() => !isDisabled && toggleValue(opt)}
                    className={`flex items-center space-x-2 rounded-lg px-2 py-1.5 text-sm cursor-pointer select-none transition-colors hover:bg-accent hover:text-accent-foreground ${
                      isDisabled ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={isDisabled}
                      readOnly
                      className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-rose-600 focus:ring-rose-500 bg-background"
                    />
                    <span className="flex-1 truncate">{opt}</span>
                  </div>
                );
              })
            )}
          </div>
          <div className="border-t bg-muted/20 px-3 py-1.5 text-center text-xs text-muted-foreground">
            {selectedValues.length} of 10 selected (Max 10)
          </div>
        </PopoverContent>
      </Popover>

      {/* Selected values badges below the trigger */}
      {selectedValues.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {selectedValues.map((val) => (
            <Badge
              key={val}
              variant="secondary"
              className="flex items-center gap-1 rounded-full bg-rose-500/10 text-rose-700 border border-rose-500/20 px-2.5 py-0.5 text-xs font-medium dark:bg-rose-500/20 dark:text-rose-300"
            >
              {val}
              <button
                type="button"
                onClick={() => onChange(selectedValues.filter((v) => v !== val))}
                className="rounded-full outline-none hover:bg-rose-500/20 p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

const emptyState = {
  name: '',
  mobileNumber: '',
  category: '',
  countries: [] as string[],
  states: [] as string[],
  areas: [] as string[],
  description: '',
};

const categoryOptions = [
  'Hostel / Hotel / Homestay',
  'Travel Guide',
  'Bike rental',
  'Car rental',
  'Travel services',
];

export function AdvertisementForm({ submitLabel, defaultStatus = 'pending', mode = 'public', onSubmitted, adId, initialValues }: AdvertisementFormProps) {
  const { currentUser, userProfile } = useAuth();
  const profileEmail = currentUser?.email || userProfile?.email || '';
  const [form, setForm] = useState(emptyState);
  const [locations, setLocations] = useState<AdvertisementLocationOption[]>([]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [idFile, setIdFile] = useState<File | null>(null);
  const [idPreviewName, setIdPreviewName] = useState<string>('');
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


  // Prefill when editing
  useEffect(() => {
    if (!initialValues) return;
    setForm((cur) => ({
      ...cur,
      name: initialValues.name ?? cur.name,
      mobileNumber: initialValues.mobileNumber ?? cur.mobileNumber,
      category: initialValues.category ?? cur.category,
      countries: initialValues.country ? initialValues.country.split(',').map((c: any) => c.trim()).filter(Boolean) : [],
      states: initialValues.state ? initialValues.state.split(',').map((s: any) => s.trim()).filter(Boolean) : [],
      areas: initialValues.area ? initialValues.area.split(',').map((a: any) => a.trim()).filter(Boolean) : [],
      description: initialValues.description ?? cur.description,
    }));

    if (initialValues.photoUrl) {
      setPhotoPreview(initialValues.photoUrl);
    }
    if ((initialValues as any).idProofUrl) {
      setIdPreviewName((initialValues as any).idProofUrl || '');
    }
  }, [initialValues]);

  const countryOptions = useMemo(
    () => Array.from(new Set(locations.map((location) => location.country))).sort((left, right) => left.localeCompare(right)),
    [locations],
  );

  const stateOptions = useMemo(
    () => Array.from(new Set(locations.filter((location) => form.countries.includes(location.country)).map((location) => location.state))).sort((left, right) => left.localeCompare(right)),
    [form.countries, locations],
  );

  const areaOptions = useMemo(
    () => Array.from(new Set(locations.filter((location) => form.countries.includes(location.country) && form.states.includes(location.state)).map((location) => location.area))).sort((left, right) => left.localeCompare(right)),
    [form.countries, form.states, locations],
  );

  const updateCountries = (newCountries: string[]) => {
    setErrorMessage('');
    setSuccessMessage('');
    setForm((current) => {
      const validStates = Array.from(new Set(locations.filter((loc) => newCountries.includes(loc.country)).map((loc) => loc.state)));
      const newSelectedStates = current.states.filter((state) => validStates.includes(state));

      const validAreas = Array.from(new Set(locations.filter((loc) => newCountries.includes(loc.country) && newSelectedStates.includes(loc.state)).map((loc) => loc.area)));
      const newSelectedAreas = current.areas.filter((area) => validAreas.includes(area));

      return {
        ...current,
        countries: newCountries,
        states: newSelectedStates,
        areas: newSelectedAreas,
      };
    });
  };

  const updateStates = (newStates: string[]) => {
    setErrorMessage('');
    setSuccessMessage('');
    setForm((current) => {
      const validAreas = Array.from(new Set(locations.filter((loc) => current.countries.includes(loc.country) && newStates.includes(loc.state)).map((loc) => loc.area)));
      const newSelectedAreas = current.areas.filter((area) => validAreas.includes(area));

      return {
        ...current,
        states: newStates,
        areas: newSelectedAreas,
      };
    });
  };

  const updateAreas = (newAreas: string[]) => {
    setErrorMessage('');
    setSuccessMessage('');
    setForm((current) => ({
      ...current,
      areas: newAreas,
    }));
  };

  const updateField = (key: 'name' | 'mobileNumber' | 'category', value: string) => {
    setErrorMessage('');
    setSuccessMessage('');
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
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

  const handleIdChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setErrorMessage('');
    setSuccessMessage('');

    if (!file) {
      setIdFile(null);
      setIdPreviewName('');
      return;
    }

    setIdFile(file);
    setIdPreviewName(file.name);
  };

  const resetForm = () => {
    if (photoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(photoPreview);
    }

    setForm(emptyState);
    setPhotoFile(null);
    setPhotoPreview('');
    setIdFile(null);
    setIdPreviewName('');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      if (!form.name.trim()) throw new Error('Name is required');
      if (!form.mobileNumber.trim()) throw new Error('Mobile number is required');
      if (!form.category.trim()) throw new Error('Please select a category');
      if (form.countries.length === 0 || form.states.length === 0 || form.areas.length === 0) {
        throw new Error('Please select at least one country, state, and area/locality');
      }
      // In edit mode allow keeping the existing photo
      if (!photoFile && !initialValues?.photoUrl) throw new Error('Please upload one photo');
      // ID proof (PDF or image) is required
      if (!idFile && !(initialValues as any)?.idProofUrl) throw new Error('Please upload ID proof (PDF or image)');

      const countryStr = form.countries.join(', ');
      const stateStr = form.states.join(', ');
      const areaStr = form.areas.join(', ');

      // If editing, update the existing document
      if (adId) {
        const updateFields: Record<string, any> = {
          name: form.name.trim(),
          email: profileEmail || null,
          mobileNumber: form.mobileNumber.trim(),
          category: form.category.trim(),
          description: form.description ? form.description.trim() : '',
          country: countryStr,
          state: stateStr,
          area: areaStr,
          ownerUid: currentUser?.uid || null,
          ownerEmail: profileEmail || null,
          ownerName: currentUser?.displayName || userProfile?.displayName || form.name.trim(),
          ownerPhoneNumber: (currentUser as any)?.phoneNumber || (userProfile as any)?.phoneNumber || null,
          updatedAt: serverTimestamp(),
        };
        // Only mark pending / record editedBy when something actually changed
        const original = initialValues || {};
        const changed =
          (form.name.trim() !== (original.name ?? '').trim()) ||
          (form.mobileNumber.trim() !== (original.mobileNumber ?? '').trim()) ||
          (form.category.trim() !== (original.category ?? '').trim()) ||
          (countryStr !== (original.country ?? '')) ||
          (stateStr !== (original.state ?? '')) ||
          (areaStr !== (original.area ?? '')) ||
          (form.description?.trim() !== (original.description ?? '').trim()) ||
          Boolean(photoFile);

        if (changed) {
          updateFields.approvalStatus = 'pending';
          updateFields.status = 'pending';
          updateFields.approvedAt = null;
          // Record who edited this ad
          updateFields.editedByUid = currentUser?.uid || null;
          updateFields.editedByEmail = profileEmail || null;
          updateFields.editedAt = serverTimestamp();
        }

        if (photoFile) {
          const uploadResult = await uploadImageToCloudinary(photoFile, { folder: 'advertisements' });
          updateFields.photoUrl = uploadResult.url;
          updateFields.photoPublicId = uploadResult.publicId;
          updateFields.photoHash = uploadResult.hash;
        }
        if (idFile) {
          const idUpload = await uploadImageToCloudinary(idFile, { folder: 'advertisements/id-proofs', allowedFormats: ['pdf','jpg','jpeg','png'] });
          updateFields.idProofUrl = idUpload.url;
          updateFields.idProofPublicId = idUpload.publicId;
          updateFields.idProofHash = idUpload.hash;
        }

        await updateDoc(doc(firestoreDb, AD_COLLECTION, adId), updateFields);

        // Trigger real-time Typesense sync
        const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
        await fetch('/api/advertisements/sync', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ id: adId, action: 'upsert' }),
        }).catch((err) => console.error('Failed to trigger sync', err));

        setSuccessMessage('Registration updated successfully.');
        onSubmitted?.(adId);
      } else {
        const photoResult = await uploadImageToCloudinary(photoFile as File, { folder: 'advertisements' });
        let idResult: any = null;
        if (idFile) {
          idResult = await uploadImageToCloudinary(idFile, { folder: 'advertisements/id-proofs', allowedFormats: ['pdf','jpg','jpeg','png'] });
        }

        const documentRef = await addDoc(collection(firestoreDb, AD_COLLECTION), {
          name: form.name.trim(),
          email: profileEmail || null,
          mobileNumber: form.mobileNumber.trim(),
          category: form.category.trim(),
          description: form.description ? form.description.trim() : '',
          country: countryStr,
          state: stateStr,
          area: areaStr,
          ownerUid: currentUser?.uid || null,
          ownerEmail: profileEmail || null,
          ownerName: currentUser?.displayName || userProfile?.displayName || form.name.trim(),
          ownerPhoneNumber: (currentUser as any)?.phoneNumber || (userProfile as any)?.phoneNumber || null,
          photoUrl: photoResult.url,
          photoPublicId: photoResult.publicId,
          photoHash: photoResult.hash,
          idProofUrl: idResult?.url || null,
          idProofPublicId: idResult?.publicId || null,
          idProofHash: idResult?.hash || null,
          status: defaultStatus,
          approvalStatus: defaultStatus,
          source: mode,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          approvedAt: defaultStatus === 'approved' ? serverTimestamp() : null,
        });

        // Trigger real-time Typesense sync
        const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
        await fetch('/api/advertisements/sync', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ id: documentRef.id, action: 'upsert' }),
        }).catch((err) => console.error('Failed to trigger sync', err));

        setSuccessMessage(defaultStatus === 'approved' ? 'Registration saved and marked approved.' : 'Registration submitted for approval.');
        resetForm();
        onSubmitted?.(documentRef.id);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to submit Registration');
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
            Registration Request
          </Badge>
          <Badge variant={defaultStatus === 'approved' ? 'default' : 'outline'} className="rounded-full px-3 py-1">
            {defaultStatus === 'approved' ? 'Admin add' : 'Needs approval'}
          </Badge>
        </div>
        <CardTitle className="text-2xl">Submit your Registration Request</CardTitle>
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

            <div className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium">Email</span>
              <div className="relative min-h-20 rounded-3xl border border-border/70 bg-linear-to-br from-muted/40 to-background px-4 py-4 shadow-sm">
                <div className="pointer-events-none absolute left-4 top-4 text-muted-foreground">
                  <Mail className="h-4 w-4" />
                </div>
                <div className="pl-7 pr-1 text-[13px] font-medium leading-6 tracking-wide wrap-break-word sm:text-sm text-foreground" title={profileEmail}>
                  {profileEmail || 'Email from your profile'}
                </div>
              </div>
              <p className="wrap-break-word text-xs text-muted-foreground">Loaded from your profile and saved with the Registration.</p>
            </div>

            <label className="space-y-2">
              <span className="text-sm font-medium">Short description (optional)</span>
              <textarea
                value={form.description}
                onChange={(e) => setForm((cur) => ({ ...cur, description: e.target.value }))}
                rows={3}
                maxLength={300}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring/30"
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
            <label className="space-y-2 block">
              <span className="text-sm font-medium">Country</span>
              <MultiSelectChecklist
                label="Country"
                placeholder="Select country"
                options={countryOptions}
                selectedValues={form.countries}
                onChange={updateCountries}
                disabled={loadingLocations}
              />
            </label>

            <label className="space-y-2 block">
              <span className="text-sm font-medium">State</span>
              <MultiSelectChecklist
                label="State"
                placeholder="Select state"
                options={stateOptions}
                selectedValues={form.states}
                onChange={updateStates}
                disabled={form.countries.length === 0}
              />
            </label>

            <label className="space-y-2 block">
              <span className="text-sm font-medium">Area / Locality</span>
              <MultiSelectChecklist
                label="Area/Locality"
                placeholder="Select area/locality"
                options={areaOptions}
                selectedValues={form.areas}
                onChange={updateAreas}
                disabled={form.states.length === 0}
              />
            </label>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <label className="space-y-2">
              <span className="text-sm font-medium">Registration Photo</span>
              <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br from-rose-500 to-orange-500 text-white shadow-lg shadow-rose-500/20">
                    <ImagePlus className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Upload one photo</p>
                    <p className="text-xs text-muted-foreground">PNG, JPG, or WEBP. This will be used in the Registration card.</p>
                  </div>
                </div>
                <Input type="file" accept="image/*" onChange={handlePhotoChange} className="mt-4" />
                {photoPreview ? (
                  <img
                    src={photoPreview}
                    alt="Selected Registration preview"
                    className="mt-4 h-44 w-full rounded-xl object-cover"
                  />
                ) : null}
                <div className="mt-4">
                  <label className="space-y-2 block">
                    <span className="text-sm font-medium">ID Proof (required)</span>
                    <p className="text-xs text-muted-foreground">Upload a government ID proof (PDF, JPG, PNG, or JPEG).</p>
                    <Input
                      type="file"
                      accept=".pdf,image/png,image/jpeg,image/jpg"
                      onChange={handleIdChange}
                      className="mt-2"
                    />
                  </label>
                  {idPreviewName ? (
                    <div className="mt-2 text-sm">
                      {idPreviewName.startsWith('http') ? (
                        <a href={idPreviewName} target="_blank" rel="noreferrer" className="underline text-foreground">{idPreviewName}</a>
                      ) : (
                        <span className="text-foreground">{idPreviewName}</span>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            </label>

            <div className="space-y-4 rounded-2xl border border-border/70 bg-background/70 p-4">
              <label className="space-y-2">
                <span className="text-sm font-medium">Category</span>
                <Select value={form.category} onValueChange={(value) => updateField('category', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              <div>
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