import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Plus, Save, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  DEFAULT_ABOUT_PAGE_CONTENT,
  loadAboutPageContent,
  saveAboutPageContent,
} from '@/lib/aboutContent';
import type {
  AboutDeveloper,
  AboutPageContent,
  AboutSocialIconName,
  AboutSocialLink,
  AboutYoutubeVideo,
} from '@/types/about';

const SOCIAL_ICONS: AboutSocialIconName[] = [
  'Facebook',
  'Instagram',
  'Youtube',
  'MessageCircle',
  'Twitter',
  'Github',
  'Globe',
];

const EMPTY_SOCIAL_LINK: AboutSocialLink = {
  name: '',
  icon: 'Facebook',
  href: '',
  gradient: 'from-blue-600 to-blue-700',
  shadowColor: 'shadow-blue-600/30',
  followers: '',
  description: '',
};

const EMPTY_VIDEO: AboutYoutubeVideo = { id: '' };

const EMPTY_DEVELOPER: AboutDeveloper = {
  name: '',
  role: '',
  avatar: '',
  bio: '',
  skills: [],
  github: '',
  email: '',
};

const CMS_CARD_CLASS =
  'overflow-hidden border-border/70 bg-card/90 backdrop-blur-sm shadow-lg transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl';

export function AboutPageEditor() {
  const [draft, setDraft] = useState<AboutPageContent>(DEFAULT_ABOUT_PAGE_CONTENT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingFounder, setUploadingFounder] = useState(false);
  const [uploadingDeveloperIndex, setUploadingDeveloperIndex] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      const content = await loadAboutPageContent();
      if (!mounted) return;
      setDraft(content);
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const updateHero = (field: keyof AboutPageContent['hero'], value: string) => {
    setDraft((prev) => ({
      ...prev,
      hero: {
        ...prev.hero,
        [field]: value,
      },
    }));
  };

  const updateFounder = (field: keyof AboutPageContent['founder'], value: string) => {
    setDraft((prev) => ({
      ...prev,
      founder: {
        ...prev.founder,
        [field]: value,
      },
    }));
  };

  const updateFounderStat = (index: number, field: 'label' | 'value', value: string) => {
    setDraft((prev) => ({
      ...prev,
      founder: {
        ...prev.founder,
        stats: prev.founder.stats.map((stat, statIndex) =>
          statIndex === index ? { ...stat, [field]: value } : stat
        ),
      },
    }));
  };

  const addFounderStat = () => {
    setDraft((prev) => ({
      ...prev,
      founder: {
        ...prev.founder,
        stats: [...prev.founder.stats, { label: 'New Metric', value: '0' }],
      },
    }));
  };

  const removeFounderStat = (index: number) => {
    setDraft((prev) => ({
      ...prev,
      founder: {
        ...prev.founder,
        stats: prev.founder.stats.filter((_, statIndex) => statIndex !== index),
      },
    }));
  };

  const updateFounderParagraphs = (value: string) => {
    const paragraphs = value
      .split('\n')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    setDraft((prev) => ({
      ...prev,
      founder: {
        ...prev.founder,
        paragraphs,
      },
    }));
  };

  const updateSocialLink = (index: number, field: keyof AboutSocialLink, value: string) => {
    setDraft((prev) => ({
      ...prev,
      socialLinks: prev.socialLinks.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      ),
    }));
  };

  const addSocialLink = () => {
    setDraft((prev) => ({
      ...prev,
      socialLinks: [...prev.socialLinks, { ...EMPTY_SOCIAL_LINK }],
    }));
  };

  const removeSocialLink = (index: number) => {
    setDraft((prev) => ({
      ...prev,
      socialLinks: prev.socialLinks.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const updateVideo = (index: number, value: string) => {
    setDraft((prev) => ({
      ...prev,
      youtubeVideos: prev.youtubeVideos.map((item, itemIndex) =>
        itemIndex === index ? { ...item, id: value } : item
      ),
    }));
  };

  const addVideo = () => {
    setDraft((prev) => ({
      ...prev,
      youtubeVideos: [...prev.youtubeVideos, { ...EMPTY_VIDEO }],
    }));
  };

  const removeVideo = (index: number) => {
    setDraft((prev) => ({
      ...prev,
      youtubeVideos: prev.youtubeVideos.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const updateDeveloper = (index: number, field: keyof AboutDeveloper, value: string) => {
    setDraft((prev) => ({
      ...prev,
      developers: prev.developers.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        if (field === 'skills') {
          return {
            ...item,
            skills: value
              .split(',')
              .map((skill) => skill.trim())
              .filter((skill) => skill.length > 0),
          };
        }

        return { ...item, [field]: value };
      }),
    }));
  };

  const addDeveloper = () => {
    setDraft((prev) => ({
      ...prev,
      developers: [...prev.developers, { ...EMPTY_DEVELOPER }],
    }));
  };

  const removeDeveloper = (index: number) => {
    setDraft((prev) => ({
      ...prev,
      developers: prev.developers.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const updateContact = (field: keyof AboutPageContent['contact'], value: string) => {
    setDraft((prev) => ({
      ...prev,
      contact: {
        ...prev.contact,
        [field]: value,
      },
    }));
  };

  const uploadImageFile = async (file: File, folder: string): Promise<string> => {
    if (!file.type.startsWith('image/')) {
      throw new Error('Please select a valid image file.');
    }

    const maxFileSize = 5 * 1024 * 1024;
    if (file.size > maxFileSize) {
      throw new Error('Image size should be below 5 MB.');
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', folder);

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.success) {
      throw new Error(payload?.message || 'Image upload failed.');
    }

    const imageUrl = payload?.data?.url;
    if (typeof imageUrl !== 'string' || !imageUrl) {
      throw new Error('Upload succeeded but no image URL was returned.');
    }

    return imageUrl;
  };

  const handleFounderImageUpload = async (file: File) => {
    try {
      setError('');
      setMessage('Uploading founder photo...');
      setUploadingFounder(true);

      const uploadedUrl = await uploadImageFile(file, 'about-page/founder');
      const nextDraft: AboutPageContent = {
        ...draft,
        founder: {
          ...draft.founder,
          photoUrl: uploadedUrl,
        },
      };

      setDraft(nextDraft);
      await saveAboutPageContent(nextDraft);
      setMessage('Founder photo uploaded and saved to database.');
    } catch (uploadError: any) {
      setError(uploadError?.message || 'Failed to upload founder photo.');
      setMessage('');
    } finally {
      setUploadingFounder(false);
    }
  };

  const handleDeveloperImageUpload = async (index: number, file: File) => {
    try {
      setError('');
      setMessage(`Uploading photo for developer ${index + 1}...`);
      setUploadingDeveloperIndex(index);

      const uploadedUrl = await uploadImageFile(file, 'about-page/developers');
      const nextDraft: AboutPageContent = {
        ...draft,
        developers: draft.developers.map((developer, developerIndex) =>
          developerIndex === index ? { ...developer, avatar: uploadedUrl } : developer
        ),
      };

      setDraft(nextDraft);
      await saveAboutPageContent(nextDraft);
      setMessage(`Developer ${index + 1} photo uploaded and saved to database.`);
    } catch (uploadError: any) {
      setError(uploadError?.message || 'Failed to upload developer photo.');
      setMessage('');
    } finally {
      setUploadingDeveloperIndex(null);
    }
  };

  const reloadFromDatabase = async () => {
    setError('');
    setMessage('');
    setLoading(true);
    const content = await loadAboutPageContent();
    setDraft(content);
    setLoading(false);
  };

  const resetToDefaults = () => {
    setDraft(DEFAULT_ABOUT_PAGE_CONTENT);
    setMessage('Loaded default About page values. Click Save to persist.');
    setError('');
  };

  const saveChanges = async () => {
    try {
      setSaving(true);
      setMessage('');
      setError('');
      await saveAboutPageContent(draft);
      setMessage('About page content saved successfully.');
    } catch (saveError) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to save about page content:', saveError);
      }
      setError('Failed to save About page content. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading About page content...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="relative mx-auto max-w-7xl space-y-6 overflow-x-clip rounded-3xl px-2 py-2 sm:px-0">
      <motion.div
        className="pointer-events-none absolute -top-20 -left-20 h-56 w-56 rounded-full bg-rose-500/15 blur-3xl"
        animate={{ x: [0, 25, 0], y: [0, 18, 0], scale: [1, 1.08, 1] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="pointer-events-none absolute -right-16 top-28 h-64 w-64 rounded-full bg-orange-500/15 blur-3xl"
        animate={{ x: [0, -20, 0], y: [0, -24, 0], scale: [1, 1.1, 1] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="pointer-events-none absolute left-1/3 -bottom-16 h-56 w-56 rounded-full bg-cyan-500/15 blur-3xl"
        animate={{ x: [0, 16, 0], y: [0, -22, 0], scale: [1, 1.09, 1] }}
        transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
      />

      <motion.div
        className="relative rounded-2xl border border-border/70 bg-linear-to-r from-rose-500/15 via-orange-500/12 to-amber-500/15 p-5 shadow-lg"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Design Studio Mode
        </div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">About Page CMS</h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          Update About page content with live styling controls and save it directly to Firestore.
        </p>
        <motion.div
          className="mt-3 h-1 w-36 rounded-full bg-linear-to-r from-rose-500 via-orange-500 to-amber-500"
          animate={{ width: ['9rem', '11rem', '9rem'] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.div>

      <div className="relative flex flex-wrap gap-3 px-2 sm:px-0">
        <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}>
          <Button
            onClick={saveChanges}
            disabled={saving}
            className="bg-linear-to-r from-rose-600 via-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/25 hover:from-rose-500 hover:to-amber-400"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save About Page
              </>
            )}
          </Button>
        </motion.div>
        <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}>
          <Button
            variant="outline"
            onClick={reloadFromDatabase}
            disabled={saving}
            className="border-sky-500/30 bg-sky-500/5 shadow-sm hover:bg-sky-500/10"
          >
            Reload From Database
          </Button>
        </motion.div>
        <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}>
          <Button
            variant="secondary"
            onClick={resetToDefaults}
            disabled={saving}
            className="bg-amber-500/15 text-amber-700 shadow-sm hover:bg-amber-500/25 dark:text-amber-300"
          >
            Use Default Values
          </Button>
        </motion.div>
      </div>

      {message ? (
        <motion.div
          className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-700 shadow-sm dark:text-green-300"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {message}
        </motion.div>
      ) : null}

      {error ? (
        <motion.div
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive shadow-sm"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {error}
        </motion.div>
      ) : null}

      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.02 }}>
      <Card className={CMS_CARD_CLASS}>
        <CardHeader className="border-b border-border/60 bg-linear-to-r from-sky-500/10 to-indigo-500/5">
          <CardTitle>Hero Section</CardTitle>
          <CardDescription>Top section text and CTA labels.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Badge</label>
            <Input value={draft.hero.badge} onChange={(e) => updateHero('badge', e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Title Line 1</label>
            <Input value={draft.hero.titleLine1} onChange={(e) => updateHero('titleLine1', e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Title Highlight</label>
            <Input value={draft.hero.titleHighlight} onChange={(e) => updateHero('titleHighlight', e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Primary Button</label>
            <Input
              value={draft.hero.primaryButtonLabel}
              onChange={(e) => updateHero('primaryButtonLabel', e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Secondary Button</label>
            <Input
              value={draft.hero.secondaryButtonLabel}
              onChange={(e) => updateHero('secondaryButtonLabel', e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1.5 block text-sm font-medium">Subtitle</label>
            <Textarea
              value={draft.hero.subtitle}
              onChange={(e) => updateHero('subtitle', e.target.value)}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.06 }}>
      <Card className={CMS_CARD_CLASS}>
        <CardHeader className="border-b border-border/60 bg-linear-to-r from-orange-500/10 to-rose-500/5">
          <CardTitle>Founder Section</CardTitle>
          <CardDescription>Founder profile, story and CTA content.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Founder Name</label>
              <Input value={draft.founder.name} onChange={(e) => updateFounder('name', e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Founder Title</label>
              <Input value={draft.founder.title} onChange={(e) => updateFounder('title', e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Location</label>
              <Input value={draft.founder.location} onChange={(e) => updateFounder('location', e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Photo URL</label>
              <Input value={draft.founder.photoUrl} onChange={(e) => updateFounder('photoUrl', e.target.value)} />
              <label className="mb-1.5 mt-2 block text-xs font-medium text-muted-foreground">Upload Founder Photo</label>
              <Input
                type="file"
                accept="image/*"
                disabled={saving || uploadingFounder}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    void handleFounderImageUpload(file);
                  }
                  e.currentTarget.value = '';
                }}
              />
              {uploadingFounder ? (
                <p className="mt-1 text-xs text-muted-foreground">Uploading founder photo...</p>
              ) : null}
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-medium">Quote</label>
              <Textarea value={draft.founder.quote} onChange={(e) => updateFounder('quote', e.target.value)} rows={2} />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-medium">Final Message</label>
              <Textarea
                value={draft.founder.finalMessage}
                onChange={(e) => updateFounder('finalMessage', e.target.value)}
                rows={2}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Primary CTA Label</label>
              <Input
                value={draft.founder.primaryCtaLabel}
                onChange={(e) => updateFounder('primaryCtaLabel', e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Primary CTA URL</label>
              <Input
                value={draft.founder.primaryCtaHref}
                onChange={(e) => updateFounder('primaryCtaHref', e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Secondary CTA Label</label>
              <Input
                value={draft.founder.secondaryCtaLabel}
                onChange={(e) => updateFounder('secondaryCtaLabel', e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Secondary CTA URL</label>
              <Input
                value={draft.founder.secondaryCtaHref}
                onChange={(e) => updateFounder('secondaryCtaHref', e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Story Paragraphs (one per line)</label>
            <Textarea
              rows={8}
              value={draft.founder.paragraphs.join('\n')}
              onChange={(e) => updateFounderParagraphs(e.target.value)}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Founder Stats</h3>
              <Button size="sm" variant="outline" onClick={addFounderStat}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Stat
              </Button>
            </div>
            {draft.founder.stats.map((stat, index) => (
              <div key={`founder-stat-${index}`} className="grid grid-cols-1 gap-3 rounded-xl border border-border/70 bg-background/55 p-3 md:grid-cols-[1fr_220px_auto]">
                <Input
                  placeholder="Label"
                  value={stat.label}
                  onChange={(e) => updateFounderStat(index, 'label', e.target.value)}
                />
                <Input
                  placeholder="Value"
                  value={stat.value}
                  onChange={(e) => updateFounderStat(index, 'value', e.target.value)}
                />
                <Button type="button" variant="ghost" size="icon" onClick={() => removeFounderStat(index)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.1 }}>
      <Card className={CMS_CARD_CLASS}>
        <CardHeader className="border-b border-border/60 bg-linear-to-r from-emerald-500/10 to-cyan-500/5">
          <CardTitle>Social Links</CardTitle>
          <CardDescription>Cards shown in the Follow Our Journey section.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-end">
            <Button size="sm" variant="outline" onClick={addSocialLink}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add Social Link
            </Button>
          </div>

          {draft.socialLinks.map((link, index) => (
            <div key={`social-${index}`} className="space-y-3 rounded-xl border border-border/70 bg-background/55 p-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Input
                  placeholder="Name"
                  value={link.name}
                  onChange={(e) => updateSocialLink(index, 'name', e.target.value)}
                />
                <Input
                  placeholder="URL"
                  value={link.href}
                  onChange={(e) => updateSocialLink(index, 'href', e.target.value)}
                />
                <Input
                  placeholder="Followers / Label"
                  value={link.followers}
                  onChange={(e) => updateSocialLink(index, 'followers', e.target.value)}
                />
                <Input
                  placeholder="Description"
                  value={link.description}
                  onChange={(e) => updateSocialLink(index, 'description', e.target.value)}
                />
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Icon</label>
                  <select
                    value={link.icon}
                    onChange={(e) => updateSocialLink(index, 'icon', e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm transition-colors focus:border-primary focus:outline-none"
                  >
                    {SOCIAL_ICONS.map((iconName) => (
                      <option key={iconName} value={iconName}>
                        {iconName}
                      </option>
                    ))}
                  </select>
                </div>
                <Input
                  placeholder="Gradient classes"
                  value={link.gradient}
                  onChange={(e) => updateSocialLink(index, 'gradient', e.target.value)}
                />
                <Input
                  placeholder="Shadow classes"
                  value={link.shadowColor}
                  onChange={(e) => updateSocialLink(index, 'shadowColor', e.target.value)}
                />
              </div>
              <div className="flex justify-end">
                <Button type="button" variant="ghost" size="sm" onClick={() => removeSocialLink(index)}>
                  <Trash2 className="mr-1 h-4 w-4" />
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.14 }}>
      <Card className={CMS_CARD_CLASS}>
        <CardHeader className="border-b border-border/60 bg-linear-to-r from-red-500/10 to-pink-500/5">
          <CardTitle>YouTube Videos</CardTitle>
          <CardDescription>Manage embedded YouTube video IDs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-end">
            <Button size="sm" variant="outline" onClick={addVideo}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add Video
            </Button>
          </div>

          {draft.youtubeVideos.map((video, index) => (
            <div key={`video-${index}`} className="grid grid-cols-1 gap-3 rounded-xl border border-border/70 bg-background/55 p-3 md:grid-cols-[1fr_auto]">
              <Input
                placeholder="YouTube video ID"
                value={video.id}
                onChange={(e) => updateVideo(index, e.target.value)}
              />
              <Button type="button" variant="ghost" size="icon" onClick={() => removeVideo(index)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.18 }}>
      <Card className={CMS_CARD_CLASS}>
        <CardHeader className="border-b border-border/60 bg-linear-to-r from-blue-500/10 to-violet-500/5">
          <CardTitle>Developers Section</CardTitle>
          <CardDescription>Control team cards shown on About page.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-end">
            <Button size="sm" variant="outline" onClick={addDeveloper}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add Developer
            </Button>
          </div>

          {draft.developers.map((developer, index) => (
            <div key={`developer-${index}`} className="space-y-3 rounded-xl border border-border/70 bg-background/55 p-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Input
                  placeholder="Name"
                  value={developer.name}
                  onChange={(e) => updateDeveloper(index, 'name', e.target.value)}
                />
                <Input
                  placeholder="Role"
                  value={developer.role}
                  onChange={(e) => updateDeveloper(index, 'role', e.target.value)}
                />
                <Input
                  placeholder="Avatar URL"
                  value={developer.avatar}
                  onChange={(e) => updateDeveloper(index, 'avatar', e.target.value)}
                />
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Upload Developer Photo</label>
                  <Input
                    type="file"
                    accept="image/*"
                    disabled={saving || uploadingDeveloperIndex === index}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        void handleDeveloperImageUpload(index, file);
                      }
                      e.currentTarget.value = '';
                    }}
                  />
                  {uploadingDeveloperIndex === index ? (
                    <p className="mt-1 text-xs text-muted-foreground">Uploading developer photo...</p>
                  ) : null}
                </div>
                <Input
                  placeholder="GitHub URL"
                  value={developer.github}
                  onChange={(e) => updateDeveloper(index, 'github', e.target.value)}
                />
                <Input
                  placeholder="Email link"
                  value={developer.email}
                  onChange={(e) => updateDeveloper(index, 'email', e.target.value)}
                />
                <Input
                  placeholder="Skills (comma separated)"
                  value={developer.skills.join(', ')}
                  onChange={(e) => updateDeveloper(index, 'skills', e.target.value)}
                />
                <div className="md:col-span-2">
                  <Textarea
                    placeholder="Bio"
                    rows={3}
                    value={developer.bio}
                    onChange={(e) => updateDeveloper(index, 'bio', e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="button" variant="ghost" size="sm" onClick={() => removeDeveloper(index)}>
                  <Trash2 className="mr-1 h-4 w-4" />
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.22 }}>
      <Card className={CMS_CARD_CLASS}>
        <CardHeader className="border-b border-border/60 bg-linear-to-r from-teal-500/10 to-emerald-500/5">
          <CardTitle>Contact CTA Section</CardTitle>
          <CardDescription>Bottom call-to-action card details.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Heading</label>
            <Input value={draft.contact.heading} onChange={(e) => updateContact('heading', e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Phone</label>
            <Input value={draft.contact.phone} onChange={(e) => updateContact('phone', e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Email Text</label>
            <Input value={draft.contact.emailText} onChange={(e) => updateContact('emailText', e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Location</label>
            <Input value={draft.contact.location} onChange={(e) => updateContact('location', e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Primary Button Label</label>
            <Input
              value={draft.contact.primaryButtonLabel}
              onChange={(e) => updateContact('primaryButtonLabel', e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Secondary Button Label</label>
            <Input
              value={draft.contact.secondaryButtonLabel}
              onChange={(e) => updateContact('secondaryButtonLabel', e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Email Link</label>
            <Input value={draft.contact.emailHref} onChange={(e) => updateContact('emailHref', e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">GitHub Link</label>
            <Input value={draft.contact.githubHref} onChange={(e) => updateContact('githubHref', e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1.5 block text-sm font-medium">Description</label>
            <Textarea
              rows={3}
              value={draft.contact.description}
              onChange={(e) => updateContact('description', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>
      </motion.div>
    </div>
  );
}
