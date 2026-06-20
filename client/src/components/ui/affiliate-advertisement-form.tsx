"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { BadgeDollarSign, ClipboardPaste, Loader2 } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { fetchAdvertisementLocations, type AdvertisementLocationOption } from '@/lib/advertisementLocations';
import { MultiSelectChecklist } from '@/components/ui/advertisement-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const DEFAULT_WIDGET_HREF = 'https://widget.getyourguide.com/default/activities.frame';

type AffiliateAdvertisementFormProps = {
  onSubmitted?: () => void | Promise<void>;
};

type ImportedEmbedValues = {
  affiliateLink: string;
  widgetHref: string;
  partnerId: string;
  localeCode: string;
  tourIds: string;
  numberOfItems: string;
  suggestedTitle: string;
};

export function parseGetYourGuideEmbedCode(code: string): ImportedEmbedValues {
  const input = code.trim();

  const titleFromUrl = (value: string) => {
    try {
      const slug = new URL(value).pathname.split('/').filter(Boolean).pop() || '';
      return slug
        .replace(/-(?:l|t)\d+.*$/i, '')
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
        .trim();
    } catch {
      return '';
    }
  };

  if (/^https?:\/\//i.test(input)) {
    const affiliateUrl = new URL(input);
    const tourId = affiliateUrl.pathname.match(/-t(\d+)(?:\/|$)/i)?.[1]
      || affiliateUrl.searchParams.get('tour_id')
      || affiliateUrl.searchParams.get('tour_ids')
      || '';
    const partnerId = affiliateUrl.searchParams.get('partner_id') || 'P2598GX';
    if (!tourId) throw new Error('The affiliate URL does not contain a GetYourGuide tour ID.');

    return {
      affiliateLink: affiliateUrl.toString(),
      widgetHref: DEFAULT_WIDGET_HREF,
      partnerId,
      localeCode: affiliateUrl.searchParams.get('locale_code') || 'en-US',
      tourIds: tourId,
      numberOfItems: affiliateUrl.searchParams.get('number_of_items') || '1',
      suggestedTitle: titleFromUrl(affiliateUrl.toString()),
    };
  }

  const parsed = new DOMParser().parseFromString(input, 'text/html');
  const widget = parsed.querySelector<HTMLElement>('[data-gyg-widget]');
  if (!widget) throw new Error('No GetYourGuide widget was found in the pasted code.');

  const affiliateLink = widget.querySelector<HTMLAnchorElement>('a[href]')?.href || '';
  const widgetHref = widget.dataset.gygHref || '';
  const partnerId = widget.dataset.gygPartnerId || '';
  const localeCode = widget.dataset.gygLocaleCode || 'en-US';
  const tourIds = widget.dataset.gygTourIds || widget.dataset.gygTourId || '';
  const numberOfItems = widget.dataset.gygNumberOfItems || '1';

  if (!widgetHref || !partnerId || !tourIds) {
    throw new Error('The embed code is missing its widget URL, partner ID, or tour ID.');
  }
  if (!affiliateLink) {
    throw new Error('The embed code does not contain an affiliate destination link.');
  }

  const suggestedTitle = titleFromUrl(affiliateLink);

  return { affiliateLink, widgetHref, partnerId, localeCode, tourIds, numberOfItems, suggestedTitle };
}

export function AffiliateAdvertisementForm({ onSubmitted }: AffiliateAdvertisementFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [embedCode, setEmbedCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [locations, setLocations] = useState<AdvertisementLocationOption[]>([]);
  const [locationSource, setLocationSource] = useState<'typesense' | 'cache' | 'firestore' | null>(null);
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [countries, setCountries] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [areas, setAreas] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    fetchAdvertisementLocations()
      .then((response) => {
        if (!active) return;
        setLocations(response.locations || []);
        setLocationSource(response.source);
      })
      .catch((locationError) => {
        if (active) setError(locationError instanceof Error ? locationError.message : 'Failed to load locations.');
      })
      .finally(() => {
        if (active) setLoadingLocations(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const countryOptions = useMemo(
    () => Array.from(new Set(locations.map((location) => location.country))).sort((a, b) => a.localeCompare(b)),
    [locations],
  );
  const stateOptions = useMemo(
    () => Array.from(new Set(locations.filter((location) => countries.includes(location.country)).map((location) => location.state))).sort((a, b) => a.localeCompare(b)),
    [countries, locations],
  );
  const areaOptions = useMemo(
    () => Array.from(new Set(locations.filter((location) => countries.includes(location.country) && states.includes(location.state)).map((location) => location.area))).sort((a, b) => a.localeCompare(b)),
    [countries, locations, states],
  );

  const updateCountries = (nextCountries: string[]) => {
    const validStates = new Set(locations.filter((location) => nextCountries.includes(location.country)).map((location) => location.state));
    const nextStates = states.filter((state) => validStates.has(state));
    const validAreas = new Set(locations.filter((location) => nextCountries.includes(location.country) && nextStates.includes(location.state)).map((location) => location.area));
    setCountries(nextCountries);
    setStates(nextStates);
    setAreas((current) => current.filter((area) => validAreas.has(area)));
  };

  const updateStates = (nextStates: string[]) => {
    const validAreas = new Set(locations.filter((location) => countries.includes(location.country) && nextStates.includes(location.state)).map((location) => location.area));
    setStates(nextStates);
    setAreas((current) => current.filter((area) => validAreas.has(area)));
  };

  const importEmbedCode = () => {
    setError('');
    setMessage('');
    try {
      const values = parseGetYourGuideEmbedCode(embedCode);
      const setFormValue = (name: string, value: string) => {
        const field = formRef.current?.elements.namedItem(name);
        if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return;
        field.value = value;
      };

      setFormValue('affiliateLink', values.affiliateLink);
      setFormValue('widgetHref', values.widgetHref);
      setFormValue('partnerId', values.partnerId);
      setFormValue('localeCode', values.localeCode);
      setFormValue('tourIds', values.tourIds);
      setFormValue('numberOfItems', values.numberOfItems);
      if (values.suggestedTitle) setFormValue('name', values.suggestedTitle);
      setMessage('Embed code imported. Review the populated details before publishing.');
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Failed to import the embed code.');
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    setSubmitting(true);
    setMessage('');
    setError('');

    try {
      const form = new FormData(formElement);
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const response = await fetch('/api/admin/advertisements/affiliate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Failed to publish affiliate advertisement.');

      formElement.reset();
      setEmbedCode('');
      setCountries([]);
      setStates([]);
      setAreas([]);
      setMessage('Affiliate advertisement published to the ad strip.');
      await onSubmitted?.();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to publish affiliate advertisement.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="border-amber-300/60 bg-card/80 shadow-lg">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-amber-500 p-2 text-white">
            <BadgeDollarSign className="h-5 w-5" />
          </div>
          <div>
            <CardTitle>Add affiliate advertisement</CardTitle>
            <CardDescription>
              Publish a GetYourGuide activity widget directly in the public advertisement strip.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form ref={formRef} onSubmit={submit} className="space-y-4">
          <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-4">
            <label className="space-y-2">
              <span className="text-sm font-semibold">Import embed code or affiliate URL</span>
              <textarea
                value={embedCode}
                onChange={(event) => setEmbedCode(event.target.value)}
                rows={6}
                spellCheck={false}
                placeholder={'Paste a GetYourGuide affiliate URL or <div data-gyg-widget="activities" ...> embed code'}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs leading-5"
              />
            </label>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Paste a full affiliate URL or embed snippet to fill the widget URL, affiliate link, partner ID, locale, item count, and tour IDs.
              </p>
              <Button type="button" variant="outline" onClick={importEmbedCode} disabled={!embedCode.trim()} className="gap-2">
                <ClipboardPaste className="h-4 w-4" />
                Import details
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 sm:col-span-2">
              <span className="text-sm font-medium">Advertisement title</span>
              <Input name="name" required placeholder="Ao Nang activities" />
            </label>
            <label className="space-y-2 sm:col-span-2">
              <span className="text-sm font-medium">Affiliate link</span>
              <Input name="affiliateLink" type="url" required placeholder="https://www.getyourguide.com/ao-nang-l89867/" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Tour ID(s)</span>
              <Input name="tourIds" required defaultValue="752564" placeholder="752564" />
              <span className="block text-xs text-muted-foreground">Use commas for multiple IDs.</span>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Partner ID</span>
              <Input name="partnerId" required defaultValue="P2598GX" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Locale</span>
              <Input name="localeCode" required defaultValue="en-US" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Number of items</span>
              <Input name="numberOfItems" type="number" min="1" max="4" required defaultValue="1" />
            </label>
            <label className="space-y-2 sm:col-span-2">
              <span className="text-sm font-medium">Widget URL</span>
              <Input name="widgetHref" type="url" required defaultValue={DEFAULT_WIDGET_HREF} />
            </label>
            <label className="space-y-2 sm:col-span-2">
              <span className="text-sm font-medium">Description (optional)</span>
              <textarea name="description" rows={3} maxLength={1000} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Short internal description or targeting context" />
            </label>
          </div>

          <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Optional location targeting</div>
            <div className="grid gap-3 sm:grid-cols-3">
              <MultiSelectChecklist
                label="Country"
                placeholder={loadingLocations ? 'Loading countries...' : 'Select country'}
                options={countryOptions}
                selectedValues={countries}
                onChange={updateCountries}
                disabled={loadingLocations}
              />
              <MultiSelectChecklist
                label="State"
                placeholder="Select state"
                options={stateOptions}
                selectedValues={states}
                onChange={updateStates}
                disabled={loadingLocations || countries.length === 0}
              />
              <MultiSelectChecklist
                label="Area / city"
                placeholder="Select area / city"
                options={areaOptions}
                selectedValues={areas}
                onChange={setAreas}
                disabled={loadingLocations || states.length === 0}
              />
              <input type="hidden" name="country" value={countries.join(', ')} />
              <input type="hidden" name="state" value={states.join(', ')} />
              <input type="hidden" name="area" value={areas.join(', ')} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {loadingLocations
                ? 'Loading locations from Typesense...'
                : `${locations.length} locations loaded from ${locationSource === 'typesense' ? 'Typesense' : locationSource || 'the location database'}.`}
            </p>
          </div>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          {message ? <p className="text-sm text-emerald-600">{message}</p> : null}

          <Button type="submit" disabled={submitting} className="gap-2 bg-amber-500 text-slate-950 hover:bg-amber-400">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeDollarSign className="h-4 w-4" />}
            {submitting ? 'Publishing...' : 'Publish affiliate ad'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
