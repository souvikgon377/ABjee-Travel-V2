"use client";

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDocs, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { CheckCircle2, Clock3, Loader2, Megaphone, RefreshCw, XCircle } from 'lucide-react';
import { firestoreDb } from '@/lib/firebaseFirestore';
import { AdvertisementForm } from '@/components/ui/advertisement-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type AdvertisementDoc = {
  id: string;
  name: string;
  mobileNumber: string;
  country: string;
  state: string;
  area: string;
  photoUrl: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt?: any;
  updatedAt?: any;
  description?: string;
};

const AD_COLLECTION = 'advertisements';

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

  const loadItems = async () => {
    setLoading(true);
    setErrorMessage('');

    try {
      const snapshot = await getDocs(query(collection(firestoreDb, AD_COLLECTION), orderBy('createdAt', 'desc')));
      const rows = snapshot.docs.map((document) => {
        const data = document.data() as Record<string, any>;
        return {
          id: document.id,
          name: String(data.name || ''),
          mobileNumber: String(data.mobileNumber || ''),
          country: String(data.country || ''),
          state: String(data.state || ''),
          area: String(data.area || ''),
          description: typeof data.description === 'string' ? data.description : '',
          photoUrl: String(data.photoUrl || ''),
          status: (data.status || 'pending') as AdvertisementDoc['status'],
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        };
      });

      setItems(rows);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load advertisements');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadItems();
  }, []);

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

  const approveItem = async (id: string) => {
    setActionId(id);
    try {
      await updateDoc(doc(firestoreDb, AD_COLLECTION, id), {
        status: 'approved',
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
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
        updatedAt: serverTimestamp(),
      });
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
                        {item.description ? (
                          <div className="mb-2 text-sm text-muted-foreground">{item.description}</div>
                        ) : null}
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Approve submissions and add live ads</h2>
            <p className="mt-2 max-w-2xl text-sm text-white/90 sm:text-base">
              Review public submissions, approve them for publishing, or add a new advertisement directly from admin with the same form.
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
            submitLabel="Add Advertisement"
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
                No pending advertisement submissions right now.
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
              <CardTitle>All advertisement records</CardTitle>
              <CardDescription>Includes pending, approved, and rejected submissions.</CardDescription>
            </div>
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              {rejectedCount} rejected
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
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
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}