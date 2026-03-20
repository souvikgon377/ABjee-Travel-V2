import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { firestoreDb } from '@/lib/firebaseFirestore';
import type {
  AboutContactContent,
  AboutDeveloper,
  AboutFounderContent,
  AboutPageContent,
  AboutSocialLink,
  AboutYoutubeVideo,
} from '@/types/about';

const ABOUT_PAGE_DOC = doc(firestoreDb, 'siteContent', 'aboutPage');

export const DEFAULT_ABOUT_PAGE_CONTENT: AboutPageContent = {
  hero: {
    badge: 'About Us',
    titleLine1: 'Discover the World',
    titleHighlight: 'with Abjee Travel',
    subtitle:
      'From the misty mountains of Darjeeling to the serene valleys of Sikkim - we craft journeys that leave you breathless.',
    primaryButtonLabel: 'Watch Videos',
    secondaryButtonLabel: 'Meet the Team',
  },
  founder: {
    name: 'Anupam Banerjee',
    title: 'Founder & Soul Traveller',
    location: 'Kolkata, West Bengal, India',
    photoUrl: '/logo.jpg',
    quote: 'The more I travel, the more my soul became rich.',
    paragraphs: [
      "Hi, I'm Anupam Banerjee - a passionate world traveller with an insatiable curiosity for cultures, landscapes, and the stories hidden in every corner of this beautiful planet.",
      'My love for travel goes far beyond sightseeing. Every new destination teaches me something profound - a new language, a new flavour, a new perspective on life. The richer my journeys, the richer my soul.',
      'I created Abjee Travel as a digital diary of my travel experiences - a place where I document every adventure, every hidden gem, and every life lesson the road has given me.',
      'My mission is simple: inspire more people to travel. I will try to give you as much information as possible - from budget tips and packing guides to cultural etiquette and off-beat trails.',
    ],
    finalMessage: "Pack your bags, open your mind, and let's explore the world together!",
    stats: [
      { label: 'Countries Visited', value: '20+' },
      { label: 'Souls Inspired', value: '50K+' },
      { label: 'Stories Shared', value: '500+' },
    ],
    primaryCtaLabel: 'Follow the Journey',
    primaryCtaHref: 'http://www.youtube.com/@ABjeeTravel',
    secondaryCtaLabel: 'Say Hello',
    secondaryCtaHref: 'mailto:hello@abjectravels.com',
  },
  socialLinks: [
    {
      name: 'Facebook',
      icon: 'Facebook',
      href: 'https://www.facebook.com/profile.php?id=61551098648104',
      gradient: 'from-blue-600 to-blue-700',
      shadowColor: 'shadow-blue-600/30',
      followers: '12K+',
      description: 'Follow for travel updates',
    },
    {
      name: 'Instagram',
      icon: 'Instagram',
      href: 'https://www.instagram.com/abjeetravel.youtuber/',
      gradient: 'from-pink-500 via-red-500 to-yellow-500',
      shadowColor: 'shadow-pink-500/30',
      followers: '25K+',
      description: 'See our travel photos',
    },
    {
      name: 'YouTube',
      icon: 'Youtube',
      href: 'http://www.youtube.com/@ABjeeTravel',
      gradient: 'from-red-600 to-red-700',
      shadowColor: 'shadow-red-600/30',
      followers: '8K+',
      description: 'Watch travel videos',
    },
    {
      name: 'WhatsApp',
      icon: 'MessageCircle',
      href: 'https://wa.me/919800247262',
      gradient: 'from-green-500 to-green-600',
      shadowColor: 'shadow-green-500/30',
      followers: 'Chat Now',
      description: 'Get in touch directly',
    },
  ],
  youtubeVideos: [
    { id: 'Yf_gy4Xzv8c' },
    { id: 'otwdSd57Q7s' },
    { id: 'GnsXt_B5DMc' },
    { id: 'djzoKT74DN0' },
  ],
  developers: [
    {
      name: 'Rajesh Kumar',
      role: 'Full Stack Developer',
      avatar: 'https://api.dicebear.com/9.x/lorelei/svg?seed=Rajesh',
      bio: 'Crafts seamless full-stack experiences with React and Node.js. Passionate about building products that make travel accessible.',
      skills: ['React', 'Node.js', 'Firebase'],
      github: 'https://github.com',
      email: 'mailto:rajesh@abjectravels.com',
    },
    {
      name: 'Priya Sharma',
      role: 'Frontend Developer',
      avatar: 'https://api.dicebear.com/9.x/lorelei/svg?seed=Priya',
      bio: 'UI/UX enthusiast who transforms complex design systems into beautiful, responsive interfaces with pixel-perfect attention.',
      skills: ['TypeScript', 'Tailwind', 'Framer Motion'],
      github: 'https://github.com',
      email: 'mailto:priya@abjectravels.com',
    },
    {
      name: 'Arjun Das',
      role: 'Backend Developer',
      avatar: 'https://api.dicebear.com/9.x/lorelei/svg?seed=Arjun',
      bio: 'Database architect and API specialist ensuring Abjee Travel runs fast, secure, and reliably at scale.',
      skills: ['MongoDB', 'Express.js', 'Socket.io'],
      github: 'https://github.com',
      email: 'mailto:arjun@abjectravels.com',
    },
    {
      name: 'Sneha Roy',
      role: 'DevOps & Cloud Engineer',
      avatar: 'https://api.dicebear.com/9.x/lorelei/svg?seed=Sneha',
      bio: 'Keeps the infrastructure rock-solid. Expert in CI/CD pipelines, cloud deployments and performance optimization.',
      skills: ['Docker', 'Netlify', 'Render'],
      github: 'https://github.com',
      email: 'mailto:sneha@abjectravels.com',
    },
  ],
  contact: {
    heading: 'Want to reach the team?',
    description:
      "Have feedback, a collaboration idea, or a bug to report? We'd love to hear from you - we reply within 24 hours.",
    primaryButtonLabel: 'Email the Team',
    secondaryButtonLabel: 'View on GitHub',
    githubHref: 'https://github.com/AbjeeTravels',
    emailHref: 'mailto:hello@abjectravels.com',
    phone: '+91 98002 47262',
    emailText: 'hello@abjectravels.com',
    location: 'Kolkata, West Bengal',
  },
};

function sanitizeFounder(value: unknown): AboutFounderContent {
  const incoming = (value ?? {}) as Partial<AboutFounderContent>;
  const base = DEFAULT_ABOUT_PAGE_CONTENT.founder;

  return {
    ...base,
    ...incoming,
    paragraphs: Array.isArray(incoming.paragraphs)
      ? incoming.paragraphs.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : base.paragraphs,
    stats: Array.isArray(incoming.stats)
      ? incoming.stats
          .filter((item) => typeof item === 'object' && item !== null)
          .map((item) => {
            const source = item as Partial<{ label: string; value: string }>;
            return {
              label: typeof source.label === 'string' && source.label.trim().length > 0 ? source.label : 'Metric',
              value: typeof source.value === 'string' && source.value.trim().length > 0 ? source.value : '0',
            };
          })
      : base.stats,
  };
}

function sanitizeSocialLinks(value: unknown): AboutSocialLink[] {
  const base = DEFAULT_ABOUT_PAGE_CONTENT.socialLinks;
  if (!Array.isArray(value)) return base;

  return value
    .filter((item): item is Partial<AboutSocialLink> => typeof item === 'object' && item !== null)
    .map((item) => ({
      name: item.name ?? 'Social',
      icon: item.icon ?? 'Globe',
      href: item.href ?? '#',
      gradient: item.gradient ?? 'from-blue-600 to-blue-700',
      shadowColor: item.shadowColor ?? 'shadow-blue-600/30',
      followers: item.followers ?? '',
      description: item.description ?? '',
    }))
    .filter((item) => item.name.trim().length > 0);
}

function sanitizeYoutubeVideos(value: unknown): AboutYoutubeVideo[] {
  const base = DEFAULT_ABOUT_PAGE_CONTENT.youtubeVideos;
  if (!Array.isArray(value)) return base;

  return value
    .filter((item): item is Partial<AboutYoutubeVideo> => typeof item === 'object' && item !== null)
    .map((item) => ({ id: typeof item.id === 'string' ? item.id.trim() : '' }))
    .filter((item) => item.id.length > 0);
}

function sanitizeDevelopers(value: unknown): AboutDeveloper[] {
  const base = DEFAULT_ABOUT_PAGE_CONTENT.developers;
  if (!Array.isArray(value)) return base;

  return value
    .filter((item): item is Partial<AboutDeveloper> => typeof item === 'object' && item !== null)
    .map((item) => ({
      name: item.name ?? 'Developer',
      role: item.role ?? 'Team Member',
      avatar: item.avatar ?? '',
      bio: item.bio ?? '',
      skills: Array.isArray(item.skills)
        ? item.skills.filter((skill): skill is string => typeof skill === 'string' && skill.trim().length > 0)
        : [],
      github: item.github ?? 'https://github.com',
      email: item.email ?? '',
    }))
    .filter((item) => item.name.trim().length > 0);
}

function sanitizeContact(value: unknown): AboutContactContent {
  const incoming = (value ?? {}) as Partial<AboutContactContent>;
  return {
    ...DEFAULT_ABOUT_PAGE_CONTENT.contact,
    ...incoming,
  };
}

function normalizeAboutPageContent(value: unknown): AboutPageContent {
  const incoming = (value ?? {}) as Partial<AboutPageContent>;

  return {
    hero: {
      ...DEFAULT_ABOUT_PAGE_CONTENT.hero,
      ...(incoming.hero ?? {}),
    },
    founder: sanitizeFounder(incoming.founder),
    socialLinks: sanitizeSocialLinks(incoming.socialLinks),
    youtubeVideos: sanitizeYoutubeVideos(incoming.youtubeVideos),
    developers: sanitizeDevelopers(incoming.developers),
    contact: sanitizeContact(incoming.contact),
  };
}

export async function loadAboutPageContent(): Promise<AboutPageContent> {
  try {
    const snapshot = await getDoc(ABOUT_PAGE_DOC);
    if (!snapshot.exists()) {
      return DEFAULT_ABOUT_PAGE_CONTENT;
    }

    return normalizeAboutPageContent(snapshot.data());
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Failed to load about page content:', error);
    }
    return DEFAULT_ABOUT_PAGE_CONTENT;
  }
}

export async function saveAboutPageContent(content: AboutPageContent): Promise<void> {
  const payload = normalizeAboutPageContent(content);
  await setDoc(
    ABOUT_PAGE_DOC,
    {
      ...payload,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
