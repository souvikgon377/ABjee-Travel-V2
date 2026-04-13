'use client';

import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { firestoreDb } from '@/lib/firebaseFirestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, Save } from 'lucide-react';
import { modernConfirm } from '@/lib/modernDialog';

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

type CouponAppliesTo = 'all' | 'pro' | 'premium';

type CouponDoc = {
  id: string;
  code: string;
  discountPercent: number;
  appliesTo: CouponAppliesTo;
  isActive: boolean;
  validFrom?: number;
  validUntil?: number;
  updatedAt?: number;
  createdAt?: number;
};

type CouponForm = Omit<CouponDoc, 'id' | 'updatedAt' | 'createdAt'>;

const EMPTY_FORM: OfferForm = {
  title: '',
  description: '',
  badge: 'Limited Offer',
  ctaText: 'Explore Offer',
  ctaHref: '/chat',
  isActive: true,
  priority: 10,
};

const EMPTY_COUPON_FORM: CouponForm = {
  code: '',
  discountPercent: 10,
  appliesTo: 'all',
  isActive: true,
  validFrom: undefined,
  validUntil: undefined,
};

const toDateTimeInputValue = (timestamp?: number) => {
  if (!timestamp || !Number.isFinite(timestamp)) return '';
  const date = new Date(timestamp);
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

const fromDateTimeInputValue = (value: string) => {
  if (!value.trim()) return undefined;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
};

export function OffersManager() {
  const [offers, setOffers] = useState<OfferDoc[]>([]);
  const [form, setForm] = useState<OfferForm>(EMPTY_FORM);
  const [coupons, setCoupons] = useState<CouponDoc[]>([]);
  const [couponForm, setCouponForm] = useState<CouponForm>(EMPTY_COUPON_FORM);
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

  useEffect(() => {
    const couponsRef = collection(firestoreDb, 'coupons');
    const unsub = onSnapshot(couponsRef, (snapshot) => {
      const rows = snapshot.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<CouponDoc, 'id'>) }))
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
      setCoupons(rows);
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
    const confirmed = await modernConfirm('Delete this offer?', {
      title: 'Delete Offer',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      destructive: true,
    });
    if (!confirmed) return;
    await deleteDoc(doc(firestoreDb, 'offers', id));
  };

  const addCoupon = async () => {
    const code = couponForm.code.trim().toUpperCase();
    const discountPercent = Number(couponForm.discountPercent);

    if (!code) {
      alert('Coupon code is required.');
      return;
    }

    if (!Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent > 100) {
      alert('Discount percent must be between 1 and 100.');
      return;
    }

    if (couponForm.validFrom && couponForm.validUntil && couponForm.validFrom > couponForm.validUntil) {
      alert('Valid from date cannot be later than valid until date.');
      return;
    }

    setSaving(true);
    try {
      const now = Date.now();
      await setDoc(doc(firestoreDb, 'coupons', code), {
        code,
        discountPercent,
        appliesTo: couponForm.appliesTo,
        isActive: couponForm.isActive,
        validFrom: couponForm.validFrom ?? null,
        validUntil: couponForm.validUntil ?? null,
        createdAt: now,
        updatedAt: now,
      }, { merge: true });

      setCouponForm(EMPTY_COUPON_FORM);
    } finally {
      setSaving(false);
    }
  };

  const updateCoupon = async (id: string, patch: Partial<CouponForm>) => {
    await updateDoc(doc(firestoreDb, 'coupons', id), {
      ...patch,
      updatedAt: Date.now(),
    });
  };

  const removeCoupon = async (id: string) => {
    const confirmed = await modernConfirm('Delete this coupon?', {
      title: 'Delete Coupon',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      destructive: true,
    });
    if (!confirmed) return;
    await deleteDoc(doc(firestoreDb, 'coupons', id));
  };

  return (
    <div className="space-y-6">
      <Card className="border border-rose-200/60 bg-linear-to-br from-rose-50 to-orange-50 dark:from-rose-950/30 dark:to-orange-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
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

      <Card className="border border-emerald-200/60 bg-linear-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20">
        <CardHeader>
          <CardTitle className="text-xl">Add Coupon</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>Coupon Code *</Label>
              <Input
                value={couponForm.code}
                onChange={(e) => setCouponForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
                placeholder="SAVE20"
                className="uppercase"
              />
            </div>
            <div className="space-y-2">
              <Label>Discount % *</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={couponForm.discountPercent}
                onChange={(e) => setCouponForm((prev) => ({ ...prev, discountPercent: Number(e.target.value || 0) }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Applies To</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={couponForm.appliesTo}
                onChange={(e) => setCouponForm((prev) => ({ ...prev, appliesTo: e.target.value as CouponAppliesTo }))}
              >
                <option value="all">All Paid Plans</option>
                <option value="pro">Paid</option>
                <option value="premium">Premium</option>
              </select>
            </div>
            <div className="flex items-end gap-3">
              <Switch
                checked={couponForm.isActive}
                onCheckedChange={(value) => setCouponForm((prev) => ({ ...prev, isActive: value }))}
              />
              <span className="text-sm text-muted-foreground">Active</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Valid From (optional)</Label>
              <Input
                type="datetime-local"
                value={toDateTimeInputValue(couponForm.validFrom)}
                onChange={(e) => setCouponForm((prev) => ({ ...prev, validFrom: fromDateTimeInputValue(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Valid Until (optional)</Label>
              <Input
                type="datetime-local"
                value={toDateTimeInputValue(couponForm.validUntil)}
                onChange={(e) => setCouponForm((prev) => ({ ...prev, validUntil: fromDateTimeInputValue(e.target.value) }))}
              />
            </div>
          </div>

          <Button onClick={addCoupon} disabled={saving}>
            <Plus className="mr-2 h-4 w-4" />
            {saving ? 'Saving...' : 'Add Coupon'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current Coupons ({coupons.length})</CardTitle>
          <p className="text-sm text-muted-foreground">Manage coupon codes and discount percentages used on pricing checkout.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {coupons.length === 0 && <p className="text-sm text-muted-foreground">No coupons yet.</p>}

          {coupons.map((coupon) => (
            <div key={coupon.id} className="rounded-xl border border-border p-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-start">
                <Input
                  className="md:col-span-3 uppercase"
                  value={coupon.code}
                  onChange={(e) => setCoupons((prev) => prev.map((c) => (c.id === coupon.id ? { ...c, code: e.target.value.toUpperCase() } : c)))}
                />
                <Input
                  className="md:col-span-2"
                  type="number"
                  min={1}
                  max={100}
                  value={coupon.discountPercent}
                  onChange={(e) => setCoupons((prev) => prev.map((c) => (c.id === coupon.id ? { ...c, discountPercent: Number(e.target.value || 0) } : c)))}
                />
                <div className="md:col-span-2">
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={coupon.appliesTo || 'all'}
                    onChange={(e) => setCoupons((prev) => prev.map((c) => (c.id === coupon.id ? { ...c, appliesTo: e.target.value as CouponAppliesTo } : c)))}
                  >
                    <option value="all">All Paid Plans</option>
                    <option value="pro">Paid</option>
                    <option value="premium">Premium</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <Input
                    type="datetime-local"
                    value={toDateTimeInputValue(coupon.validUntil)}
                    onChange={(e) => setCoupons((prev) => prev.map((c) => (c.id === coupon.id ? { ...c, validUntil: fromDateTimeInputValue(e.target.value) } : c)))}
                  />
                </div>
                <div className="md:col-span-3 flex items-center justify-end gap-2">
                  <Switch
                    checked={coupon.isActive}
                    onCheckedChange={(value) => setCoupons((prev) => prev.map((c) => (c.id === coupon.id ? { ...c, isActive: value } : c)))}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      updateCoupon(coupon.id, {
                        code: coupon.code.trim().toUpperCase(),
                        discountPercent: Number(coupon.discountPercent || 0),
                        appliesTo: coupon.appliesTo || 'all',
                        isActive: coupon.isActive,
                        validFrom: coupon.validFrom,
                        validUntil: coupon.validUntil,
                      })
                    }
                    title="Save"
                  >
                    <Save className="h-4 w-4" />
                  </Button>
                  <Button variant="destructive" size="icon" onClick={() => removeCoupon(coupon.id)} title="Delete">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
