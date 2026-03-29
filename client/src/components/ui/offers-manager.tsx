'use client';

import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { firestoreDb } from '@/lib/firebaseFirestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, Save, Sparkles } from 'lucide-react';

type OfferDoc = {
  id: string;
  title: string;
  description: string;
  badge: string;
  ctaText: string;
  ctaHref: string;
  isActive: boolean;
  priority: number;
  updatedAt?: number;
  createdAt?: number;
};

type OfferForm = Omit<OfferDoc, 'id' | 'updatedAt' | 'createdAt'>;

const EMPTY_FORM: OfferForm = {
  title: '',
  description: '',
  badge: 'Limited Offer',
  ctaText: 'Explore Offer',
  ctaHref: '/chat',
  isActive: true,
  priority: 10,
};

export function OffersManager() {
  const [offers, setOffers] = useState<OfferDoc[]>([]);
  const [form, setForm] = useState<OfferForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const offersRef = collection(firestoreDb, 'offers');
    const unsub = onSnapshot(offersRef, (snapshot) => {
      const rows = snapshot.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<OfferDoc, 'id'>) }))
        .sort((a, b) => {
          const pDiff = (a.priority ?? 999) - (b.priority ?? 999);
          if (pDiff !== 0) return pDiff;
          return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
        });
      setOffers(rows);
    });

    return () => unsub();
  }, []);

  const activeCount = useMemo(() => offers.filter((o) => o.isActive).length, [offers]);

  const onField = (key: keyof OfferForm, value: string | number | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const addOffer = async () => {
    if (!form.title.trim()) {
      alert('Offer title is required.');
      return;
    }

    setSaving(true);
    try {
      const now = Date.now();
      await addDoc(collection(firestoreDb, 'offers'), {
        ...form,
        title: form.title.trim(),
        description: form.description.trim(),
        badge: form.badge.trim(),
        ctaText: form.ctaText.trim(),
        ctaHref: form.ctaHref.trim() || '/chat',
        updatedAt: now,
        createdAt: now,
      });
      setForm(EMPTY_FORM);
    } finally {
      setSaving(false);
    }
  };

  const updateOffer = async (id: string, patch: Partial<OfferForm>) => {
    await updateDoc(doc(firestoreDb, 'offers', id), {
      ...patch,
      updatedAt: Date.now(),
    });
  };

  const removeOffer = async (id: string) => {
    if (!confirm('Delete this offer?')) return;
    await deleteDoc(doc(firestoreDb, 'offers', id));
  };

  return (
    <div className="space-y-6">
      <Card className="border border-rose-200/60 bg-linear-to-br from-rose-50 to-orange-50 dark:from-rose-950/30 dark:to-orange-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="h-5 w-5 text-rose-500" />
            Add New Offer
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Offer Title *</Label>
              <Input value={form.title} onChange={(e) => onField('title', e.target.value)} placeholder="Summer Escape 35% Off" />
            </div>
            <div className="space-y-2">
              <Label>Badge</Label>
              <Input value={form.badge} onChange={(e) => onField('badge', e.target.value)} placeholder="Limited Offer" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => onField('description', e.target.value)} placeholder="Book before 15 June and unlock premium perks." rows={3} />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>CTA Text</Label>
              <Input value={form.ctaText} onChange={(e) => onField('ctaText', e.target.value)} placeholder="Grab Deal" />
            </div>
            <div className="space-y-2">
              <Label>CTA Link</Label>
              <Input value={form.ctaHref} onChange={(e) => onField('ctaHref', e.target.value)} placeholder="/pricing" />
            </div>
            <div className="space-y-2">
              <Label>Priority (lower first)</Label>
              <Input
                type="number"
                value={form.priority}
                onChange={(e) => onField('priority', Number(e.target.value || 0))}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={form.isActive} onCheckedChange={(v) => onField('isActive', v)} />
            <span className="text-sm text-muted-foreground">Active on homepage</span>
          </div>

          <Button onClick={addOffer} disabled={saving}>
            <Plus className="mr-2 h-4 w-4" />
            {saving ? 'Saving...' : 'Add Offer'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current Offers ({offers.length})</CardTitle>
          <p className="text-sm text-muted-foreground">{activeCount} active offers visible on the home popup.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {offers.length === 0 && (
            <p className="text-sm text-muted-foreground">No offers yet.</p>
          )}

          {offers.map((offer) => (
            <div key={offer.id} className="rounded-xl border border-border p-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-start">
                <Input
                  className="md:col-span-3"
                  value={offer.title}
                  onChange={(e) => setOffers((prev) => prev.map((o) => (o.id === offer.id ? { ...o, title: e.target.value } : o)))}
                />
                <Input
                  className="md:col-span-2"
                  value={offer.badge}
                  onChange={(e) => setOffers((prev) => prev.map((o) => (o.id === offer.id ? { ...o, badge: e.target.value } : o)))}
                />
                <Input
                  className="md:col-span-2"
                  value={offer.ctaText}
                  onChange={(e) => setOffers((prev) => prev.map((o) => (o.id === offer.id ? { ...o, ctaText: e.target.value } : o)))}
                />
                <Input
                  className="md:col-span-2"
                  value={offer.ctaHref}
                  onChange={(e) => setOffers((prev) => prev.map((o) => (o.id === offer.id ? { ...o, ctaHref: e.target.value } : o)))}
                />
                <Input
                  className="md:col-span-1"
                  type="number"
                  value={offer.priority}
                  onChange={(e) => setOffers((prev) => prev.map((o) => (o.id === offer.id ? { ...o, priority: Number(e.target.value || 0) } : o)))}
                />
                <div className="md:col-span-2 flex items-center gap-2 justify-end">
                  <Switch
                    checked={offer.isActive}
                    onCheckedChange={(value) => setOffers((prev) => prev.map((o) => (o.id === offer.id ? { ...o, isActive: value } : o)))}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      updateOffer(offer.id, {
                        title: offer.title,
                        description: offer.description,
                        badge: offer.badge,
                        ctaText: offer.ctaText,
                        ctaHref: offer.ctaHref,
                        priority: offer.priority,
                        isActive: offer.isActive,
                      })
                    }
                    title="Save"
                  >
                    <Save className="h-4 w-4" />
                  </Button>
                  <Button variant="destructive" size="icon" onClick={() => removeOffer(offer.id)} title="Delete">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <Textarea
                className="mt-3"
                value={offer.description}
                onChange={(e) => setOffers((prev) => prev.map((o) => (o.id === offer.id ? { ...o, description: e.target.value } : o)))}
                rows={2}
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
