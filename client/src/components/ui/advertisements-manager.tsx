"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { CheckCircle2, Clock3, Loader2, Megaphone, PencilLine, RefreshCw, Search, Trash2, XCircle, UploadCloud } from 'lucide-react';
import { firestoreDb } from '@/lib/firebaseFirestore';
import { auth } from '@/lib/firebase';
import { AdvertisementForm } from '@/components/ui/advertisement-form';
import { uploadImageToCloudinary } from '@/lib/imageUpload';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type AdvertisementDoc = {
  id: string;
  name: string;
  mobileNumber: string;
  country: string;
  state: string;
  area: string;
  photoUrl: string;
  idProofUrl?: string | null;
  photoPublicId?: string | null;
  idProofPublicId?: string | null;
  idProofHash?: string | null;
  ownerEmail?: string | null;
  ownerName?: string | null;
  ownerPhoneNumber?: string | null;
  category?: string | null;
  editedByEmail?: string | null;
  editedAt?: any;
  approvedAt?: any;
  status: 'pending' | 'approved' | 'rejected';
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  createdAt?: any;
  updatedAt?: any;
  description?: string;
};

type AdvertisementEditState = {
  id: string;
  name: string;
  mobileNumber: string;
  country: string;
  state: string;
  area: string;
  description: string;
  photoUrl: string;
  idProofUrl?: string | null;
  ownerEmail?: string | null;
  ownerName?: string | null;
  ownerPhoneNumber?: string | null;
  category?: string | null;
};

const AD_COLLECTION = 'advertisements';

const normalizeApprovalStatus = (status: AdvertisementDoc['status']) => {
  if (status === 'approved') return 'approved';
  if (status === 'rejected') return 'rejected';
  return 'pending';
};

const toDate = (value: any) => {
  if (!value) return new Date();
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  return new Date(value);
};

export function AdvertisementsManager() {
  const [items, setItems] = useState<AdvertisementDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingItem, setEditingItem] = useState<AdvertisementEditState | null>(null);
  const [editPhotoFile, setEditPhotoFile] = useState<File | null>(null);
  const [editPhotoPreview, setEditPhotoPreview] = useState('');
  const [editIdFile, setEditIdFile] = useState<File | null>(null);
  const [editIdPreviewName, setEditIdPreviewName] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadItems = async () => {
    setLoading(true);
    setErrorMessage('');

    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      
      // Query advertisements from Typesense via admin API route
      const response = await fetch(`/api/admin/advertisements/list?search=${encodeURIComponent(searchQuery)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) {
        throw new Error(`Failed to load advertisements from search index: ${response.statusText}`);
      }
      const payload = await response.json();
      const rows = (payload.data?.data || []).map((data: any) => {
        const status = (data.status || 'pending') as AdvertisementDoc['status'];
        const candidateEmail = (typeof data.ownerEmail === 'string' && data.ownerEmail) || (typeof data.email === 'string' && data.email) || null;
        const candidateName = (typeof data.ownerName === 'string' && data.ownerName) || (typeof data.name === 'string' && data.name) || null;
        const candidatePhone = (typeof data.ownerPhoneNumber === 'string' && data.ownerPhoneNumber) || (typeof data.mobileNumber === 'string' && data.mobileNumber) || null;
        return {
          id: data.id,
          name: String(data.name || ''),
          mobileNumber: String(data.mobileNumber || ''),
          country: String(data.country || ''),
          state: String(data.state || ''),
          area: String(data.area || ''),
          description: typeof data.description === 'string' ? data.description : '',
          photoUrl: String(data.photoUrl || ''),
          photoPublicId: typeof data.photoPublicId === 'string' ? data.photoPublicId : null,
          idProofUrl: typeof data.idProofUrl === 'string' ? data.idProofUrl : (typeof data.id_proof_url === 'string' ? data.id_proof_url : null),
          idProofPublicId: typeof data.idProofPublicId === 'string' ? data.idProofPublicId : (typeof data.id_proof_public_id === 'string' ? data.id_proof_public_id : null),
          idProofHash: typeof data.idProofHash === 'string' ? data.idProofHash : (typeof data.id_proof_hash === 'string' ? data.id_proof_hash : null),
          ownerEmail: candidateEmail,
          ownerName: candidateName,
          ownerPhoneNumber: candidatePhone,
          category: typeof data.category === 'string' ? data.category : null,
          editedByEmail: typeof data.editedByEmail === 'string' ? data.editedByEmail : null,
          editedAt: data.editedAt || null,
          approvedAt: data.approvedAt || null,
          status,
          approvalStatus: (data.approvalStatus || normalizeApprovalStatus(status)) as AdvertisementDoc['approvalStatus'],
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        };
      });

      setItems(rows);

      const updates = rows.filter((row: any) => row.status !== row.approvalStatus);
      if (updates.length > 0) {
        await Promise.all(
          updates.map(async (row: any) => {
            await updateDoc(doc(firestoreDb, AD_COLLECTION, row.id), {
              approvalStatus: normalizeApprovalStatus(row.status),
              ...(row.status === 'approved' ? { approvedAt: row.updatedAt || serverTimestamp() } : {}),
              updatedAt: serverTimestamp(),
            });
            // Trigger sync for automatically fixed mismatch statuses
            await fetch('/api/advertisements/sync', {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({ id: row.id, action: 'upsert' }),
            }).catch(err => console.warn('Mismatched status sync failed', err));
          })
        );
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load advertisements');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadItems();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const pendingItems = useMemo(
    () => items.filter((item) => item.status === 'pending'),
    [items],
  );

  const approvedCount = useMemo(
    () => items.filter((item) => item.status === 'approved').length,
    [items],
  );

  const rejectedCount = useMemo(
    () => items.filter((item) => item.status === 'rejected').length,
    [items],
  );

  const filteredItems = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return items;

    return items.filter((item) => {
      const haystack = [
        item.name,
        item.mobileNumber,
        item.country,
        item.state,
        item.area,
        item.description,
        item.status,
      ].join(' ').toLowerCase();

      return haystack.includes(term);
    });
  }, [items, searchQuery]);

  const closeEditor = () => {
    if (editPhotoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(editPhotoPreview);
    }
    setEditingItem(null);
    setEditPhotoFile(null);
    setEditPhotoPreview('');
  };

  const startEdit = (item: AdvertisementDoc) => {
    closeEditor();
    setEditingItem({
      id: item.id,
      name: item.name,
      mobileNumber: item.mobileNumber,
      country: item.country,
      state: item.state,
      area: item.area,
      description: item.description || '',
      photoUrl: item.photoUrl,
      idProofUrl: item.idProofUrl || null,
      ownerEmail: item.ownerEmail || null,
      ownerName: item.ownerName || null,
      ownerPhoneNumber: item.ownerPhoneNumber || null,
      category: item.category || null,
    });
    setEditPhotoPreview(item.photoUrl);
    setEditIdPreviewName(item.idProofUrl || '');
  };

  const updateEditField = (key: keyof Omit<AdvertisementEditState, 'id' | 'photoUrl'>, value: string) => {
    setEditingItem((current) => (current ? { ...current, [key]: value } : current));
  };

  const handleEditPhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;

    if (editPhotoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(editPhotoPreview);
    }

    if (!file) {
      setEditPhotoFile(null);
      setEditPhotoPreview(editingItem?.photoUrl || '');
      return;
    }

    setEditPhotoFile(file);
    setEditPhotoPreview(URL.createObjectURL(file));
  };

  const handleEditIdChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;

    if (!file) {
      setEditIdFile(null);
      setEditIdPreviewName(editingItem?.idProofUrl || '');
      return;
    }

    setEditIdFile(file);
    setEditIdPreviewName(file.name);
  };

  const saveEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingItem) return;

    setSavingEdit(true);
    setErrorMessage('');

    try {
      if (!editingItem.name.trim()) throw new Error('Name is required');
      if (!editingItem.mobileNumber.trim()) throw new Error('Mobile number is required');
      if (!editingItem.country || !editingItem.state || !editingItem.area) throw new Error('Please select country, state, and area/locality');

      let photoData: any = {
        photoUrl: editingItem.photoUrl,
      };

      if (editPhotoFile) {
        const uploadResult = await uploadImageToCloudinary(editPhotoFile, { folder: 'advertisements' });
        photoData = { photoUrl: uploadResult.url, photoPublicId: uploadResult.publicId };
      }
      // If admin replaced ID proof
      let idData: Record<string, any> = {};
      if (editIdFile) {
        const idUpload = await uploadImageToCloudinary(editIdFile, { folder: 'advertisements/id-proofs', allowedFormats: ['pdf','jpg','jpeg','png'] });
        idData = { idProofUrl: idUpload.url, idProofPublicId: idUpload.publicId, idProofHash: idUpload.hash };
      }

      await updateDoc(doc(firestoreDb, AD_COLLECTION, editingItem.id), {
        name: editingItem.name.trim(),
        mobileNumber: editingItem.mobileNumber.trim(),
        description: editingItem.description ? editingItem.description.trim() : '',
        country: editingItem.country,
        state: editingItem.state,
        area: editingItem.area,
        ...photoData,
        ...idData,
        approvalStatus: normalizeApprovalStatus((items.find((item) => item.id === editingItem.id)?.status || 'pending') as AdvertisementDoc['status']),
        updatedAt: serverTimestamp(),
      });

      // Trigger real-time Typesense sync
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      await fetch('/api/advertisements/sync', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ id: editingItem.id, action: 'upsert' }),
      }).catch((err) => console.error('Failed to trigger sync', err));

      closeEditor();
      await loadItems();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update Registration');
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteItem = async (id: string) => {
    const confirmed = window.confirm('Delete this Registration permanently?');
    if (!confirmed) return;

    setDeletingId(id);
    setErrorMessage('');

    try {
      await deleteDoc(doc(firestoreDb, AD_COLLECTION, id));

      // Trigger real-time Typesense sync
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      await fetch('/api/advertisements/sync', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ id, action: 'delete' }),
      }).catch((err) => console.error('Failed to trigger delete sync', err));

      if (editingItem?.id === id) {
        closeEditor();
      }
      await loadItems();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete Registration');
    } finally {
      setDeletingId(null);
    }
  };

  const approveItem = async (id: string) => {
    setActionId(id);
    try {
      await updateDoc(doc(firestoreDb, AD_COLLECTION, id), {
        status: 'approved',
        approvalStatus: 'approved',
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Trigger real-time Typesense sync
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      await fetch('/api/advertisements/sync', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ id, action: 'upsert' }),
      }).catch((err) => console.error('Failed to trigger approve sync', err));

      await loadItems();
    } finally {
      setActionId(null);
    }
  };

  const rejectItem = async (id: string) => {
    setActionId(id);
    try {
      await updateDoc(doc(firestoreDb, AD_COLLECTION, id), {
        status: 'rejected',
        approvalStatus: 'rejected',
        updatedAt: serverTimestamp(),
      });

      // Trigger real-time Typesense sync
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      await fetch('/api/advertisements/sync', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ id, action: 'upsert' }),
      }).catch((err) => console.error('Failed to trigger reject sync', err));

      await loadItems();
    } finally {
      setActionId(null);
    }
  };

  const quickAddHandler = async () => {
    await loadItems();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 sm:space-y-6">
      <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-linear-to-br from-rose-500 via-orange-500 to-amber-400 p-6 text-white shadow-2xl shadow-rose-500/20">
            <div className="flex items-center gap-2">
              <Megaphone className="h-5 w-5" />
              <span className="text-xs font-semibold uppercase tracking-[0.24em]">Advertisements</span>
            </div>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Approve submissions and add live ads</h2>
            <p className="mt-2 max-w-2xl text-sm text-white/90 sm:text-base">
              Review public submissions, approve them for publishing, or add a new Registration directly from admin with the same form.
            </p>

            <div className="mt-5 grid grid-cols-3 gap-3 text-center text-sm">
              <div className="rounded-2xl bg-white/15 px-3 py-3 backdrop-blur">
                <div className="text-lg font-bold">{items.length}</div>
                <div className="text-white/80">Total</div>
              </div>
              <div className="rounded-2xl bg-white/15 px-3 py-3 backdrop-blur">
                <div className="text-lg font-bold">{pendingItems.length}</div>
                <div className="text-white/80">Pending</div>
              </div>
              <div className="rounded-2xl bg-white/15 px-3 py-3 backdrop-blur">
                <div className="text-lg font-bold">{approvedCount}</div>
                <div className="text-white/80">Approved</div>
              </div>
            </div>
          </div>

          <AdvertisementForm
            submitLabel="Add Registration"
            defaultStatus="approved"
            mode="admin"
            onSubmitted={quickAddHandler}
          />
        </div>

        <Card className="border-border/70 bg-card/80 shadow-lg">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Pending approvals</CardTitle>
                <CardDescription>Submissions waiting for manual review.</CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => void loadItems()} disabled={loading} className="gap-2">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-border/70 px-4 py-5 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading advertisements...
              </div>
            ) : null}

            {errorMessage ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
                {errorMessage}
              </div>
            ) : null}

            {!loading && pendingItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
                No pending Registration submissions right now.
              </div>
            ) : null}

            <div className="space-y-4">
              {pendingItems.map((item) => (
                <div key={item.id} className="overflow-hidden rounded-2xl border border-border/70 bg-background/80">
                  {item.photoUrl ? (
                    <img src={item.photoUrl} alt={item.name} className="h-44 w-full object-cover" />
                  ) : null}

                  <div className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold">{item.name}</h3>
                        <p className="text-sm text-muted-foreground">{item.mobileNumber}</p>
                      </div>
                      <Badge variant="outline" className="gap-1 rounded-full">
                        <Clock3 className="h-3.5 w-3.5" />
                        Pending
                      </Badge>
                    </div>

                    <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                      <div>Country: {item.country}</div>
                      <div>State: {item.state}</div>
                      <div className="sm:col-span-2">Area / Locality: {item.area}</div>
                    </div>

                    {item.category ? <div className="mt-2 text-sm">Category: <span className="font-medium">{item.category}</span></div> : null}
                    {item.description ? <div className="mt-2 text-sm">Description: <div className="text-sm text-foreground mt-1">{item.description}</div></div> : null}
                    {item.ownerEmail ? <div className="mt-2 text-sm">Owner email: <span className="font-medium">{item.ownerEmail}</span></div> : null}
                    {item.ownerName ? <div className="mt-1 text-sm">Owner name: <span className="font-medium">{item.ownerName}</span></div> : null}
                    {item.ownerPhoneNumber ? <div className="mt-1 text-sm">Owner phone: <span className="font-medium">{item.ownerPhoneNumber}</span></div> : null}
                    <div className="mt-2 text-xs text-muted-foreground">Submitted: {toDate(item.createdAt).toLocaleString()}</div>
                    {item.editedByEmail ? <div className="mt-1 text-xs text-muted-foreground">Last edited by: <span className="font-medium">{item.editedByEmail}</span> at {item.editedAt ? toDate(item.editedAt).toLocaleString() : ''}</div> : null}

                    {item.idProofUrl ? (
                      <div className="mt-2 text-sm">
                        <div className="text-xs text-muted-foreground">ID Proof</div>
                        <a href={item.idProofUrl} target="_blank" rel="noreferrer" className="underline text-foreground">View / Download</a>
                      </div>
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                      <Button type="button" onClick={() => approveItem(item.id)} disabled={actionId === item.id} className="gap-2">
                        <CheckCircle2 className="h-4 w-4" />
                        {actionId === item.id ? 'Updating...' : 'Approve'}
                      </Button>
                      <Button type="button" variant="outline" onClick={() => rejectItem(item.id)} disabled={actionId === item.id} className="gap-2">
                        <XCircle className="h-4 w-4" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 text-xs text-muted-foreground">
              Rejected items stay in the collection for audit history, while approved items can be used immediately in display logic.
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/70 bg-card/80 shadow-lg">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>All Registration records</CardTitle>
              <CardDescription>Includes pending, approved, and rejected submissions.</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="rounded-full px-3 py-1">
                {rejectedCount} rejected
              </Badge>
              <div className="relative w-full min-w-64 sm:w-80">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search Registration"
                  className="pl-9"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {editingItem ? (
            <form onSubmit={saveEdit} className="mb-6 rounded-3xl border border-rose-200/40 bg-rose-500/5 p-4 shadow-sm dark:border-rose-900/30 dark:bg-rose-950/20">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">Edit Registration</h3>
                  <p className="text-sm text-muted-foreground">Update fields and replace the photo if needed.</p>
                </div>
                <Button type="button" variant="outline" onClick={closeEditor}>Cancel</Button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium">Name</span>
                  <Input value={editingItem.name} onChange={(event) => updateEditField('name', event.target.value)} />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium">Mobile Number</span>
                  <Input value={editingItem.mobileNumber} onChange={(event) => updateEditField('mobileNumber', event.target.value)} />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium">Country</span>
                  <Input value={editingItem.country} onChange={(event) => updateEditField('country', event.target.value)} />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium">State</span>
                  <Input value={editingItem.state} onChange={(event) => updateEditField('state', event.target.value)} />
                </label>
                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-medium">Area / Locality</span>
                  <Input value={editingItem.area} onChange={(event) => updateEditField('area', event.target.value)} />
                </label>
                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-medium">Description</span>
                  <textarea
                    value={editingItem.description}
                    onChange={(event) => updateEditField('description', event.target.value)}
                    rows={4}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium">Owner Email</span>
                  <Input value={editingItem.ownerEmail || ''} readOnly />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium">Owner Name</span>
                  <Input value={editingItem.ownerName || ''} readOnly />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium">Category</span>
                  <Input value={editingItem.category || ''} onChange={(e) => updateEditField('category', e.target.value)} />
                </label>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_0.9fr]">
                <label className="space-y-2">
                  <span className="text-sm font-medium">Replace photo</span>
                  <div className="rounded-2xl border border-dashed border-border/70 bg-background/70 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-linear-to-br from-rose-500 to-orange-500 text-white shadow-lg shadow-rose-500/20">
                        <UploadCloud className="h-4 w-4" />
                      </div>
                      <div className="text-sm text-muted-foreground">Choose a new image only if you want to replace the existing Registration photo.</div>
                    </div>
                    <Input type="file" accept="image/*" onChange={handleEditPhotoChange} className="mt-4" />
                    {editPhotoPreview ? <img src={editPhotoPreview} alt="Registration preview" className="mt-4 h-44 w-full rounded-xl object-cover" /> : null}
                  </div>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium">Replace ID proof</span>
                  <div className="rounded-2xl border border-dashed border-border/70 bg-background/70 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-linear-to-br from-rose-500 to-orange-500 text-white shadow-lg shadow-rose-500/20">
                        <UploadCloud className="h-4 w-4" />
                      </div>
                      <div className="text-sm text-muted-foreground">Choose a new ID file only if you want to replace the existing proof (PDF or image).</div>
                    </div>
                    <Input type="file" accept=".pdf,image/png,image/jpeg,image/jpg" onChange={handleEditIdChange} className="mt-4" />
                    {editIdPreviewName ? (
                      <div className="mt-4 text-sm">
                        {editIdPreviewName.startsWith('http') ? (
                          <a href={editIdPreviewName} target="_blank" rel="noreferrer" className="underline text-foreground">{editIdPreviewName}</a>
                        ) : (
                          <span className="text-foreground">{editIdPreviewName}</span>
                        )}
                      </div>
                    ) : null}
                  </div>
                </label>

                <div className="rounded-2xl border border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
                  <div className="font-semibold text-foreground">Current record</div>
                  <div className="mt-2 space-y-1">
                    <div>Status: <span className="capitalize">{items.find((item) => item.id === editingItem.id)?.status || 'unknown'}</span></div>
                    <div>ID: {editingItem.id}</div>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="submit" disabled={savingEdit} className="gap-2">
                  <PencilLine className="h-4 w-4" />
                  {savingEdit ? 'Saving...' : 'Save changes'}
                </Button>
                <Button type="button" variant="outline" onClick={closeEditor} disabled={savingEdit}>Cancel</Button>
              </div>
            </form>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredItems.map((item) => (
              <div key={item.id} className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold">{item.name}</h3>
                  <Badge variant={item.status === 'approved' ? 'default' : item.status === 'rejected' ? 'destructive' : 'outline'} className="rounded-full capitalize">
                    {item.status}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{item.mobileNumber}</p>
                <p className="mt-3 text-sm text-muted-foreground">{item.area}, {item.state}, {item.country}</p>
                {item.photoUrl ? <img src={item.photoUrl} alt={item.name} className="mt-3 h-36 w-full rounded-xl object-cover" /> : null}
                <div className="mt-3 text-xs text-muted-foreground">Created: {toDate(item.createdAt).toLocaleString()}</div>
                <div className="mt-1 text-xs text-muted-foreground">Approval status: <span className="capitalize">{item.approvalStatus || item.status}</span></div>
                {item.ownerEmail ? <div className="mt-2 text-sm">Owner email: <span className="font-medium">{item.ownerEmail}</span></div> : null}
                {item.ownerName ? <div className="mt-1 text-sm">Owner name: <span className="font-medium">{item.ownerName}</span></div> : null}
                {item.category ? <div className="mt-1 text-sm">Category: <span className="font-medium">{item.category}</span></div> : null}
                {item.editedByEmail ? <div className="mt-1 text-sm">Last edited by: <span className="font-medium">{item.editedByEmail}</span> at <span className="font-medium">{item.editedAt ? toDate(item.editedAt).toLocaleString() : ''}</span></div> : null}
                {item.approvedAt ? <div className="mt-1 text-sm">Approved at: <span className="font-medium">{toDate(item.approvedAt).toLocaleString()}</span></div> : null}
                {item.idProofUrl ? (
                  <div className="mt-2 text-sm">
                    <div className="text-xs text-muted-foreground">ID Proof</div>
                    <a href={item.idProofUrl} target="_blank" rel="noreferrer" className="underline text-foreground">View / Download</a>
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => startEdit(item)} className="gap-2">
                    <PencilLine className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button type="button" variant="destructive" size="sm" onClick={() => deleteItem(item.id)} disabled={deletingId === item.id} className="gap-2">
                    <Trash2 className="h-3.5 w-3.5" />
                    {deletingId === item.id ? 'Deleting...' : 'Delete'}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {!loading && filteredItems.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
              No advertisements match your search.
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
