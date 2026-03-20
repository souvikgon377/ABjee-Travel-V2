export type AboutSocialIconName =
  | 'Facebook'
  | 'Instagram'
  | 'Youtube'
  | 'MessageCircle'
  | 'Twitter'
  | 'Github'
  | 'Globe';

export interface AboutHeroContent {
  badge: string;
  titleLine1: string;
  titleHighlight: string;
  subtitle: string;
  primaryButtonLabel: string;
  secondaryButtonLabel: string;
}

export interface AboutFounderStat {
  label: string;
  value: string;
}

export interface AboutFounderContent {
  name: string;
  title: string;
  location: string;
  photoUrl: string;
  quote: string;
  paragraphs: string[];
  finalMessage: string;
  stats: AboutFounderStat[];
  primaryCtaLabel: string;
  primaryCtaHref: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
}

export interface AboutSocialLink {
  name: string;
  icon: AboutSocialIconName;
  href: string;
  gradient: string;
  shadowColor: string;
  followers: string;
  description: string;
}

export interface AboutYoutubeVideo {
  id: string;
}

export interface AboutDeveloper {
  name: string;
  role: string;
  avatar: string;
  bio: string;
  skills: string[];
  github: string;
  email: string;
}

export interface AboutContactContent {
  heading: string;
  description: string;
  primaryButtonLabel: string;
  secondaryButtonLabel: string;
  githubHref: string;
  emailHref: string;
  phone: string;
  emailText: string;
  location: string;
}

export interface AboutPageContent {
  hero: AboutHeroContent;
  founder: AboutFounderContent;
  socialLinks: AboutSocialLink[];
  youtubeVideos: AboutYoutubeVideo[];
  developers: AboutDeveloper[];
  contact: AboutContactContent;
}
