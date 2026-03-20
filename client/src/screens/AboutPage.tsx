import { useRef, useState } from 'react';
import { motion, useInView, type Variants } from 'framer-motion';
import {
  Facebook,
  Instagram,
  Twitter,
  Youtube,
  MessageCircle,
  Github,
  Mail,
  ExternalLink,
  MapPin,
  Phone,
  Quote,
  Camera,
  Globe,
  Heart,
} from 'lucide-react';
import Header1 from '@/components/mvpblocks/header-1';
import Footer4Col from '@/components/mvpblocks/footer-4col';

// ─── Animation Variants ───────────────────────────────────────────────────────

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 50 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.12, ease: 'easeOut' as const },
  }),
};

const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.85 },
  visible: (i: number = 0) => ({
    opacity: 1,
    scale: 1,
    transition: { duration: 0.5, delay: i * 0.1, ease: 'easeOut' as const },
  }),
};

// ─── Scroll-triggered section wrapper ─────────────────────────────────────────

function AnimatedSection({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─── Founder Section ──────────────────────────────────────────────────────────

function FounderSection() {
  const [photo, setPhoto] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => setPhoto(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  const founderRef = useRef(null);
  const isInView = useInView(founderRef, { once: true, margin: '-80px' });

  const stats = [
    { icon: Globe, label: 'Countries Visited', value: '20+' },
    { icon: Heart,  label: 'Souls Inspired',   value: '50K+' },
    { icon: Camera, label: 'Stories Shared',   value: '500+' },
  ];

  return (
    <section className="py-14 px-4 relative overflow-hidden bg-muted/25">
      {/* Decorative blobs */}
      <div className="pointer-events-none absolute -top-32 -left-32 w-96 h-96 bg-primary/20 rounded-full blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 w-96 h-96 bg-primary/15 rounded-full blur-3xl" />

      <motion.div
        ref={founderRef}
        initial="hidden"
        animate={isInView ? 'visible' : 'hidden'}
        className="max-w-6xl mx-auto"
      >
        {/* Header */}
        <motion.div variants={fadeUp} className="text-center mb-10">
          <span className="inline-flex items-center gap-2 text-primary text-xs sm:text-sm font-bold tracking-[0.2em] uppercase mb-4">
            <span className="w-8 h-px bg-primary" />
            The Story Behind
            <span className="w-8 h-px bg-primary" />
          </span>
          <h2 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight mt-3 mb-5 leading-none">
            Meet the
            <span className="block bg-gradient-to-r from-primary via-rose-500 to-orange-400 bg-clip-text text-transparent">
              Founder
            </span>
          </h2>
          <div className="w-20 h-1.5 bg-gradient-to-r from-primary to-rose-400 rounded-full mx-auto" />
        </motion.div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

          {/* ── Left: Photo upload card ── */}
          <motion.div variants={scaleIn} custom={0} className="flex flex-col items-center gap-6">
            {/* Photo frame */}
            <div className="relative group">
              {/* Spinning gradient ring */}
              <motion.div
                className="absolute -inset-1.5 rounded-full bg-gradient-to-tr from-primary via-rose-400 to-orange-400 opacity-70"
                animate={{ rotate: 360 }}
                transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
              />
              <div
                className="relative w-56 h-56 sm:w-72 sm:h-72 rounded-full overflow-hidden border-4 border-background bg-secondary cursor-pointer"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file) handleFile(file);
                }}
              >
                {photo ? (
                  <img
                    src={photo}
                    alt="Anupam Banerjee – Founder"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center w-full h-full gap-3 text-muted-foreground group-hover:text-primary transition-colors">
                    <Camera className="w-12 h-12" />
                    <span className="text-sm font-medium text-center px-4 leading-snug">
                      Click or drag &amp; drop<br />to upload photo
                    </span>
                  </div>
                )}
              </div>

              {/* Camera badge */}
              <button
                onClick={() => inputRef.current?.click()}
                title="Upload founder photo"
                className="absolute bottom-2 right-2 p-2.5 bg-primary text-white rounded-full shadow-lg hover:bg-primary/90 hover:scale-105 transition-all"
              >
                <Camera className="w-4 h-4" />
              </button>
            </div>

            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />

            <div className="text-center">
              <h3 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight">Anupam Banerjee</h3>
              <p className="bg-gradient-to-r from-primary to-rose-500 bg-clip-text text-transparent font-bold text-sm sm:text-base mt-2 tracking-widest uppercase">
                Founder &amp; Soul Traveller
              </p>
              <p className="text-muted-foreground text-xs sm:text-sm mt-2 flex items-center justify-center gap-1">
                <MapPin className="w-3.5 h-3.5" /> Kolkata, West Bengal, India
              </p>
            </div>

            {/* Stats row */}
            <div className="flex gap-6 sm:gap-10">
              {stats.map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex flex-col items-center gap-1.5">
                  <div className="p-2.5 rounded-2xl bg-primary/10">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-xl sm:text-2xl font-black leading-none">{value}</span>
                  <span className="text-[10px] sm:text-xs text-muted-foreground text-center leading-tight max-w-[64px]">{label}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* ── Right: Story ── */}
          <motion.div variants={fadeUp} custom={1} className="flex flex-col gap-8">
            {/* Pull quote */}
            <div className="relative pl-6 sm:pl-8 border-l-4 border-primary rounded-r-xl py-2">
              <Quote className="absolute -top-2 -left-3.5 w-7 h-7 text-primary bg-background" />
              <p className="text-xl sm:text-2xl md:text-3xl font-black italic leading-snug bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent">
                &ldquo;The more I travel,<br className="hidden sm:block" /> the more my Soul became rich.&rdquo;
              </p>
            </div>

            {/* Bio paragraphs */}
            <div className="flex flex-col gap-5 sm:gap-6 text-sm sm:text-base md:text-lg text-muted-foreground leading-relaxed">
              <p>
                Hi, I&apos;m{' '}
                <span className="font-black text-foreground text-base sm:text-lg md:text-xl">Anupam Banerjee</span>
                {' '}— a passionate world traveller with an insatiable curiosity for cultures,
                landscapes, and the stories hidden in every corner of this beautiful planet.
              </p>
              <p>
                My love for travel goes far beyond sightseeing. Every new destination teaches me something
                profound — a new language, a new flavour, a new perspective on life.
                <span className="font-semibold text-foreground"> The richer my journeys, the richer my soul.</span>
              </p>
              <p>
                I created{' '}
                <span className="font-black text-foreground">Abjee Travel</span>{' '}as a
                <em className="text-primary font-semibold not-italic"> digital diary of my travel experiences</em>
                {' '}— a place where I document every adventure, every hidden gem, and every life lesson the road has
                given me, so that <em className="font-bold text-foreground not-italic">you</em> too can experience the same
                joy without leaving your screen.
              </p>
              <p>
                My mission is simple:{' '}
                <span className="font-black text-foreground text-base sm:text-lg">inspire more people to travel</span>.
                {' '}I will try to give you as much information as possible — from budget tips and packing guides
                to cultural etiquette and off-beat trails.
              </p>
              <p className="text-base sm:text-lg md:text-xl font-black text-foreground">
                🌍 Pack your bags, open your mind, and let&apos;s explore the world together!
              </p>
            </div>

            {/* CTAs */}
            <div className="flex gap-3 flex-wrap">
              <a
                href="http://www.youtube.com/@ABjeeTravel"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-pink-500 to-orange-400 text-white rounded-full text-sm font-semibold hover:opacity-90 hover:scale-105 transition-all shadow-lg shadow-pink-500/25"
              >
                <Instagram className="w-4 h-4" /> Follow the Journey
              </a>
              <a
                href="mailto:hello@abjectravels.com"
                className="inline-flex items-center gap-2 px-5 py-2.5 border border-border bg-secondary text-foreground rounded-full text-sm font-semibold hover:border-primary/40 hover:scale-105 transition-all"
              >
                <Mail className="w-4 h-4" /> Say Hello
              </a>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const socialLinks = [
  {
    name: 'Facebook',
    icon: Facebook,
    href: 'https://www.facebook.com/profile.php?id=61551098648104',
    gradient: 'from-blue-600 to-blue-700',
    shadowColor: 'shadow-blue-600/30',
    followers: '12K+',
    description: 'Follow for travel updates',
  },
  {
    name: 'Instagram',
    icon: Instagram,
    href: 'https://www.instagram.com/abjeetravel.youtuber/',
    gradient: 'from-pink-500 via-red-500 to-yellow-500',
    shadowColor: 'shadow-pink-500/30',
    followers: '25K+',
    description: 'See our travel photos',
  },
  {
    name: 'YouTube',
    icon: Youtube,
    href: 'http://www.youtube.com/@ABjeeTravel',
    gradient: 'from-red-600 to-red-700',
    shadowColor: 'shadow-red-600/30',
    followers: '8K+',
    description: 'Watch travel videos',
  },
  // {
  //   name: 'Twitter / X',
  //   icon: Twitter,
  //   href: 'https://twitter.com/AbjeeTravels',
  //   gradient: 'from-sky-500 to-sky-600',
  //   shadowColor: 'shadow-sky-500/30',
  //   followers: '5K+',
  //   description: 'Join the conversation',
  // },
  {
    name: 'WhatsApp',
    icon: MessageCircle,
    href: 'https://wa.me/919800247262',
    gradient: 'from-green-500 to-green-600',
    shadowColor: 'shadow-green-500/30',
    followers: 'Chat Now',
    description: 'Get in touch directly',
  },
  // {
  //   name: 'GitHub',
  //   icon: Github,
  //   href: 'https://github.com/AbjeeTravels',
  //   gradient: 'from-gray-700 to-gray-900',
  //   shadowColor: 'shadow-gray-700/30',
  //   followers: 'Open Source',
  //   description: 'Explore the code',
  // },
];

const youtubeVideos = [
  { id: 'Yf_gy4Xzv8c' },
  { id: 'otwdSd57Q7s' },
  { id: 'GnsXt_B5DMc' },
  { id: 'djzoKT74DN0' },
];

const developers = [
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
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Header1 />

      {/* ══════════════════════════════════════════
          HERO  –  Dynamic animated background
         ══════════════════════════════════════════ */}
      <section className="relative w-full h-screen flex items-center justify-center overflow-hidden">

        {/* ── Base gradient — light: warm rose/violet, dark: deep slate/rose ── */}
        <div className="absolute inset-0 bg-gradient-to-br from-rose-50 via-violet-50/70 to-orange-50 dark:from-slate-950 dark:via-rose-950/60 dark:to-slate-900" />

        {/* ── Aurora blobs ── */}
        <motion.div
          className="absolute -top-48 -left-48 w-[700px] h-[700px] rounded-full bg-rose-400/30 dark:bg-rose-500/25 blur-[130px] pointer-events-none"
          animate={{ x: [0, 70, 20, 0], y: [0, 50, -20, 0], scale: [1, 1.12, 0.96, 1] }}
          transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute top-1/4 -right-40 w-[600px] h-[600px] rounded-full bg-violet-400/25 dark:bg-violet-600/20 blur-[110px] pointer-events-none"
          animate={{ x: [0, -55, 10, 0], y: [0, 65, -25, 0], scale: [1, 1.15, 0.92, 1] }}
          transition={{ duration: 24, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
        />
        <motion.div
          className="absolute -bottom-24 left-1/4 w-[520px] h-[520px] rounded-full bg-orange-400/25 dark:bg-orange-500/20 blur-[110px] pointer-events-none"
          animate={{ x: [0, 45, -15, 0], y: [0, -35, 15, 0], scale: [1, 1.08, 1.04, 1] }}
          transition={{ duration: 17, repeat: Infinity, ease: 'easeInOut', delay: 6 }}
        />
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[380px] h-[380px] rounded-full bg-pink-400/20 dark:bg-pink-600/15 blur-[90px] pointer-events-none"
          animate={{ scale: [1, 1.35, 1], opacity: [0.5, 0.9, 0.5] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        />

        {/* ── Subtle dot-mesh texture ── */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.035] dark:opacity-[0.055]"
          style={{
            backgroundImage:
              'radial-gradient(circle, currentColor 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        {/* ══════════════════════════════════════════
             ── Travel-themed background animations ──
            ══════════════════════════════════════════ */}

        {/* ── Flying planes (left → right) ── */}
        {[
          { top: '10%', duration: 24, delay: 0,  size: 30, color: 'rgba(244,63,94,0.30)',  tilt: '-12deg' },
          { top: '38%', duration: 34, delay: 11, size: 22, color: 'rgba(168,85,247,0.25)', tilt: '-8deg'  },
          { top: '63%', duration: 28, delay: 19, size: 25, color: 'rgba(251,146,60,0.28)', tilt: '-10deg' },
        ].map((p, i) => (
          <motion.div
            key={`plane-${i}`}
            className="absolute pointer-events-none"
            style={{ top: p.top, left: 0, color: p.color }}
            animate={{ x: [-180, 2200] }}
            transition={{ duration: p.duration, repeat: Infinity, delay: p.delay, ease: 'linear', repeatDelay: (i * 3 + 2) }}
          >
            {/* airplane silhouette pointing right */}
            <svg xmlns="http://www.w3.org/2000/svg" width={p.size} height={p.size} viewBox="0 0 24 24" fill="currentColor"
              style={{ transform: `rotate(${p.tilt})`, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))' }}>
              <path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />
            </svg>
          </motion.div>
        ))}

        {/* ── Drifting clouds (right → left, very slow) ── */}
        {[
          { top: '6%',  duration: 60, delay: 0,  scale: 1.1,  opacity: 0.13 },
          { top: '23%', duration: 75, delay: 18, scale: 0.75, opacity: 0.10 },
          { top: '52%', duration: 50, delay: 7,  scale: 0.55, opacity: 0.11 },
          { top: '74%', duration: 68, delay: 28, scale: 0.85, opacity: 0.09 },
        ].map((c, i) => (
          <motion.div
            key={`cloud-${i}`}
            className="absolute pointer-events-none"
            style={{ top: c.top, left: 0 }}
            animate={{ x: [2300, -450] }}
            transition={{ duration: c.duration, repeat: Infinity, delay: c.delay, ease: 'linear' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg"
              width={130 * c.scale} height={75 * c.scale}
              viewBox="0 0 130 75"
              style={{ opacity: c.opacity }}
              fill="currentColor"
              className="text-blue-400 dark:text-slate-300"
            >
              <path d="M100 54Q108 54 108 46Q108 36 98 35Q97 20 84 18Q74 10 63 16Q55 7 42 11Q29 12 26 24Q14 22 10 32Q4 42 14 50Q16 60 28 58L92 58Q102 60 100 54Z" />
            </svg>
          </motion.div>
        ))}

        {/* ── Floating hot air balloon ── */}
        <motion.div
          className="absolute pointer-events-none"
          style={{ top: '12%', right: '10%', opacity: 0.22 }}
          animate={{ y: [0, -28, 0], rotate: [-2, 2, -2] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="64" height="88" viewBox="0 0 64 88" fill="none">
            {/* balloon body */}
            <ellipse cx="32" cy="34" rx="24" ry="30" fill="rgba(244,63,94,0.50)" />
            {/* stripe top */}
            <path d="M8 34 Q32 4 56 34" stroke="rgba(251,146,60,0.65)" strokeWidth="2.5" fill="none" />
            {/* stripe mid */}
            <path d="M13 22 Q32 2 51 22" stroke="rgba(168,85,247,0.55)" strokeWidth="2" fill="none" />
            {/* bottom highlight */}
            <ellipse cx="32" cy="58" rx="10" ry="5" fill="rgba(244,63,94,0.25)" />
            {/* basket strings */}
            <line x1="22" y1="62" x2="26" y2="73" stroke="rgba(80,60,30,0.45)" strokeWidth="1.5" />
            <line x1="42" y1="62" x2="38" y2="73" stroke="rgba(80,60,30,0.45)" strokeWidth="1.5" />
            {/* basket */}
            <rect x="24" y="73" width="16" height="11" rx="3" fill="rgba(180,120,60,0.55)" />
          </svg>
        </motion.div>

        {/* ── Rotating compass ── */}
        <motion.div
          className="absolute pointer-events-none"
          style={{ bottom: '28%', left: '7%', opacity: 0.18 }}
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 22, repeat: Infinity, ease: 'linear' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 52 52" fill="none">
            <circle cx="26" cy="26" r="23" stroke="rgba(99,102,241,0.65)" strokeWidth="2" fill="none" />
            <circle cx="26" cy="26" r="3.5" fill="rgba(244,63,94,0.8)" />
            {/* North needle */}
            <polygon points="26,5 29.5,24 26,22 22.5,24" fill="rgba(244,63,94,0.8)" />
            {/* South needle */}
            <polygon points="26,47 22.5,28 26,30 29.5,28" fill="rgba(120,120,150,0.55)" />
            {/* East */}
            <polygon points="47,26 28,22.5 30,26 28,29.5" fill="rgba(99,102,241,0.65)" />
            {/* West */}
            <polygon points="5,26 24,29.5 22,26 24,22.5" fill="rgba(120,120,150,0.55)" />
          </svg>
        </motion.div>

        {/* ── Bouncing map pins ── */}
        {[
          { top: '18%', left: '72%', delay: 0,   size: 18, color: 'rgba(244,63,94,0.38)'  },
          { top: '52%', left: '16%', delay: 2.5, size: 15, color: 'rgba(168,85,247,0.32)' },
          { top: '68%', left: '60%', delay: 5,   size: 20, color: 'rgba(251,146,60,0.35)' },
          { top: '30%', left: '42%', delay: 3.5, size: 14, color: 'rgba(99,102,241,0.30)' },
        ].map((pin, i) => (
          <motion.div
            key={`pin-${i}`}
            className="absolute pointer-events-none"
            style={{ top: pin.top, left: pin.left, color: pin.color }}
            animate={{ y: [0, -14, 0], opacity: [0.45, 1, 0.45] }}
            transition={{ duration: 2.5 + i * 0.7, repeat: Infinity, delay: pin.delay, ease: 'easeInOut' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width={pin.size} height={pin.size} viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
          </motion.div>
        ))}

        {/* ── Rolling suitcase / luggage (left → right, ground level) ── */}
        <motion.div
          className="absolute pointer-events-none"
          style={{ bottom: '15%', left: 0, opacity: 0.18 }}
          animate={{ x: [-80, 2200] }}
          transition={{ duration: 44, repeat: Infinity, delay: 6, ease: 'linear' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="rgba(99,102,241,0.75)">
            <path d="M20 6h-2.18c.07-.44.18-.88.18-1.34C18 3 16.77 2 15.27 2H8.73C7.23 2 6 3 6 4.66c0 .46.11.9.18 1.34H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zM8.73 4h6.54c.41 0 .73.3.73.66 0 .38-.1.74-.18 1.1l-.08.24H8.26l-.08-.24C8.1 5.4 8 5.04 8 4.66 8 4.3 8.32 4 8.73 4z" />
          </svg>
        </motion.div>

        {/* ── Bottom page blend ── */}
        <div className="absolute bottom-0 left-0 right-0 h-72 bg-gradient-to-t from-background via-background/60 to-transparent pointer-events-none" />

        {/* ── Floating micro-particles (layer 1 — slow drifters) ── */}
        {[...Array(80)].map((_, i) => (
          <motion.div
            key={`slow-${i}`}
            className="absolute rounded-full pointer-events-none"
            style={{
              width: `${1.5 + (i % 5)}px`,
              height: `${1.5 + (i % 5)}px`,
              left: `${(i * 1.23 + 1) % 97}%`,
              top: `${(i * 2.47 + 3) % 93}%`,
              background: i % 6 === 0 ? 'rgba(244,63,94,0.6)'
                : i % 6 === 1 ? 'rgba(168,85,247,0.5)'
                : i % 6 === 2 ? 'rgba(251,146,60,0.55)'
                : i % 6 === 3 ? 'rgba(236,72,153,0.45)'
                : i % 6 === 4 ? 'rgba(99,102,241,0.5)'
                : 'rgba(20,184,166,0.45)',  // teal accent
            }}
            animate={{
              y: [0, -(18 + (i % 22)), 0],
              x: [0, (i % 2 === 0 ? 9 : -9) + (i % 6) - 3, 0],
              opacity: [0.08, 0.65, 0.08],
              scale: [1, 1.5, 1],
            }}
            transition={{
              duration: 4 + (i % 7),
              repeat: Infinity,
              delay: (i * 0.13) % 6,
              ease: 'easeInOut',
            }}
          />
        ))}

        {/* ── Floating micro-particles (layer 2 — fast twinklers) ── */}
        {[...Array(70)].map((_, i) => (
          <motion.div
            key={`fast-${i}`}
            className="absolute rounded-full pointer-events-none"
            style={{
              width: `${1 + (i % 3)}px`,
              height: `${1 + (i % 3)}px`,
              left: `${(i * 1.41 + 2.5) % 95}%`,
              top: `${(i * 3.73 + 6) % 88}%`,
              background: i % 4 === 0 ? 'rgba(251,207,232,0.8)'   // pink-200
                : i % 4 === 1 ? 'rgba(221,214,254,0.75)'           // violet-200
                : i % 4 === 2 ? 'rgba(254,215,170,0.8)'            // orange-200
                : 'rgba(255,255,255,0.7)',
            }}
            animate={{
              y: [0, -(10 + (i % 14)), 0],
              opacity: [0.15, 1, 0.15],
              scale: [0.8, 1.6, 0.8],
            }}
            transition={{
              duration: 1.8 + (i % 3),
              repeat: Infinity,
              delay: (i * 0.09) % 4,
              ease: 'easeInOut',
            }}
          />
        ))}

        {/* ── Floating micro-particles (layer 3 — large glows) ── */}
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={`glow-${i}`}
            className="absolute rounded-full pointer-events-none"
            style={{
              width: `${6 + (i % 8)}px`,
              height: `${6 + (i % 8)}px`,
              left: `${(i * 4.9 + 5) % 90}%`,
              top: `${(i * 7.3 + 8) % 82}%`,
              background: i % 3 === 0 ? 'rgba(244,63,94,0.25)'
                : i % 3 === 1 ? 'rgba(168,85,247,0.2)'
                : 'rgba(251,146,60,0.22)',
              filter: 'blur(2px)',
            }}
            animate={{
              y: [0, -(25 + (i % 20)), 0],
              x: [0, (i % 2 === 0 ? 12 : -12), 0],
              opacity: [0.05, 0.45, 0.05],
              scale: [1, 1.8, 1],
            }}
            transition={{
              duration: 6 + (i % 8),
              repeat: Infinity,
              delay: (i * 0.4) % 7,
              ease: 'easeInOut',
            }}
          />
        ))}

        {/* ── Hero copy ── */}
        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="mb-5"
          >
            <span className="inline-block px-4 py-1.5 rounded-full bg-rose-500/10 dark:bg-primary/20 border border-rose-400/40 dark:border-primary/40 text-rose-600 dark:text-primary text-sm font-semibold tracking-widest uppercase backdrop-blur-sm">
              About Us
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.4 }}
            className="text-5xl md:text-7xl font-black leading-tight tracking-tight mb-6 text-foreground"
          >
            Discover the World
            <br />
            <span className="text-primary">with Abjee Travel</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.65 }}
            className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed"
          >
            From the misty mountains of Darjeeling to the serene valleys of
            Sikkim — we craft journeys that leave you breathless.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.9 }}
            className="mt-8 flex gap-4 justify-center flex-wrap"
          >
            <a
              href="#videos"
              className="px-7 py-3.5 bg-primary text-white rounded-full font-semibold hover:bg-primary/90 transition-all hover:scale-105 active:scale-95 shadow-xl shadow-primary/30"
            >
              Watch Videos
            </a>
            <a
              href="#team"
              className="px-7 py-3.5 bg-foreground/8 dark:bg-white/10 border border-border dark:border-white/30 text-foreground rounded-full font-semibold hover:bg-foreground/[0.12] dark:hover:bg-white/20 transition-all hover:scale-105 active:scale-95 backdrop-blur-sm"
            >
              Meet the Team
            </a>
          </motion.div>
        </div>

        {/* ── Scroll indicator ── */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-foreground/40 text-xs"
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.6, repeat: Infinity }}
        >
          <span className="tracking-widest uppercase text-[10px]">Scroll</span>
          <div className="w-px h-8 bg-gradient-to-b from-foreground/40 to-transparent" />
        </motion.div>
      </section>

      {/* ══════════════════════════════════════════
          FOUNDER SECTION
         ══════════════════════════════════════════ */}
      <FounderSection />

      {/* ══════════════════════════════════════════
          SOCIAL MEDIA LINKS
         ══════════════════════════════════════════ */}
      <section className="py-16 px-4 relative overflow-hidden">
        {/* subtle background glow */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-rose-500/10" />
        <AnimatedSection className="relative">
          <motion.div variants={fadeUp} className="text-center mb-10">
            <span className="inline-flex items-center gap-2 text-primary text-xs sm:text-sm font-bold tracking-[0.2em] uppercase mb-4">
              <span className="w-8 h-px bg-primary" />
              Stay Connected
              <span className="w-8 h-px bg-primary" />
            </span>
            <h2 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight mt-3 mb-5 leading-none">
              Follow Our
              <span className="block bg-gradient-to-r from-primary via-rose-500 to-orange-400 bg-clip-text text-transparent">
                Journey
              </span>
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed font-medium">
              Connect with us across every platform — from breathtaking reels
              to behind-the-scenes travel tales. Your next adventure starts here.
            </p>
          </motion.div>

          {/* 4 cards — centred, 2 cols on mobile, 4 on sm+ */}
          <div className="max-w-3xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-5">
            {socialLinks.map((link, i) => (
              <motion.a
                key={link.name}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                variants={scaleIn}
                custom={i}
                whileHover={{ y: -10, scale: 1.06 }}
                whileTap={{ scale: 0.94 }}
                className="group flex flex-col items-center gap-4 p-5 sm:p-6 rounded-3xl border border-border bg-card shadow-sm hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/10 transition-all duration-300 cursor-pointer"
              >
                {/* Icon bubble */}
                <div
                  className={`p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br ${link.gradient} shadow-xl ${link.shadowColor} group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300`}
                >
                  <link.icon className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
                </div>

                <div className="text-center">
                  <p className="font-bold text-sm sm:text-base">{link.name}</p>
                  <p className="text-primary text-base sm:text-lg font-black mt-0.5">
                    {link.followers}
                  </p>
                  <p className="text-muted-foreground text-[11px] sm:text-xs mt-1 leading-tight">
                    {link.description}
                  </p>
                </div>
              </motion.a>
            ))}
          </div>
        </AnimatedSection>
      </section>

      {/* ══════════════════════════════════════════
          YOUTUBE VIDEOS
         ══════════════════════════════════════════ */}
      <section id="videos" className="py-14 px-4 bg-muted/40">
        <AnimatedSection>
          <motion.div variants={fadeUp} className="text-center mb-10">
            <span className="inline-flex items-center gap-1.5 text-red-600 text-sm font-semibold tracking-widest uppercase">
              <Youtube className="w-4 h-4" />
              Abjee Travel on YouTube
            </span>
            <h2 className="text-3xl md:text-5xl font-bold mt-2 mb-4">
              Top Travel Videos
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Watch our most-loved travel videos and get inspired for your next
              adventure!
            </p>
          </motion.div>

          <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-6 mb-12">
            {youtubeVideos.map((video, i) => (
              <motion.div
                key={video.id}
                variants={fadeUp}
                custom={i}
                whileHover={{ y: -4 }}
                className="rounded-2xl overflow-hidden border border-border bg-card shadow-md hover:shadow-xl hover:shadow-red-600/10 transition-all duration-300"
              >
                <div className="relative aspect-video bg-black">
                  <iframe
                    src={`https://www.youtube.com/embed/${video.id}`}
                    title={`Abjee Travel video ${i + 1}`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    className="w-full h-full"
                    loading="lazy"
                  />
                </div>
              </motion.div>
            ))}
          </div>

          {/* View More CTA */}
          <motion.div variants={fadeUp} custom={4} className="text-center">
            <a
              href="https://youtube.com/@AbjeeTravels"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 px-8 py-4 bg-red-600 text-white rounded-full font-semibold hover:bg-red-700 transition-all hover:scale-105 active:scale-95 shadow-xl shadow-red-600/30 group"
            >
              <Youtube className="w-5 h-5" />
              View More on YouTube
              <ExternalLink className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </a>
          </motion.div>
        </AnimatedSection>
      </section>

      {/* ══════════════════════════════════════════
          DEVELOPERS
         ══════════════════════════════════════════ */}
      <section id="team" className="py-14 px-4">
        <AnimatedSection>
          <motion.div variants={fadeUp} className="text-center mb-10">
            <span className="text-primary text-sm font-semibold tracking-widest uppercase">
              The Builders
            </span>
            <h2 className="text-3xl md:text-5xl font-bold mt-2 mb-4">
              Meet the Developers
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              A passionate team of engineers and designers who brought Abjee
              Travel to life from scratch.
            </p>
          </motion.div>

          {/* Developer cards */}
          <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-14">
            {developers.map((dev, i) => (
              <motion.div
                key={dev.name}
                variants={fadeUp}
                custom={i}
                whileHover={{ y: -6 }}
                className="group flex flex-col items-center text-center p-6 rounded-2xl border border-border bg-card shadow-sm hover:border-primary/30 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300"
              >
                {/* Avatar with online indicator */}
                <div className="relative mb-4">
                  <div className="w-20 h-20 rounded-full overflow-hidden ring-2 ring-border group-hover:ring-primary/50 transition-all duration-300">
                    <img
                      src={dev.avatar}
                      alt={dev.name}
                      className="w-full h-full object-cover bg-secondary"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(dev.name)}&background=random&color=fff`;
                      }}
                    />
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full border-2 border-card" />
                </div>

                <h3 className="font-bold text-base">{dev.name}</h3>
                <p className="text-primary text-xs font-semibold mt-0.5 mb-3">
                  {dev.role}
                </p>
                <p className="text-muted-foreground text-xs leading-relaxed mb-4 flex-1">
                  {dev.bio}
                </p>

                {/* Skill chips */}
                <div className="flex flex-wrap justify-center gap-1 mb-5">
                  {dev.skills.map((skill) => (
                    <span
                      key={skill}
                      className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-[10px] font-semibold"
                    >
                      {skill}
                    </span>
                  ))}
                </div>

                {/* Action links */}
                <div className="flex gap-2">
                  <a
                    href={dev.github}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="GitHub"
                    className="p-2 rounded-lg border border-border hover:bg-secondary hover:border-primary/30 transition-colors"
                  >
                    <Github className="w-4 h-4" />
                  </a>
                  <a
                    href={dev.email}
                    title="Send email"
                    className="p-2 rounded-lg border border-border hover:bg-secondary hover:border-primary/30 transition-colors"
                  >
                    <Mail className="w-4 h-4" />
                  </a>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Contact CTA card */}
          <motion.div variants={fadeUp} custom={4}>
            <div className="max-w-2xl mx-auto rounded-2xl border border-border bg-card p-8 text-center shadow-lg">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-4">
                <Mail className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-2">Want to reach the team?</h3>
              <p className="text-muted-foreground text-sm mb-6 max-w-md mx-auto">
                Have feedback, a collaboration idea, or a bug to report? We'd love
                to hear from you — we reply within 24 hours.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <a
                  href="mailto:hello@abjectravels.com"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white rounded-full font-semibold text-sm hover:bg-primary/90 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-primary/30"
                >
                  <Mail className="w-4 h-4" />
                  Email the Team
                </a>
                <a
                  href="https://github.com/AbjeeTravels"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-border bg-secondary text-foreground rounded-full font-semibold text-sm hover:border-primary/40 transition-all hover:scale-105 active:scale-95"
                >
                  <Github className="w-4 h-4" />
                  View on GitHub
                </a>
              </div>

              {/* Quick contact info */}
              <div className="mt-6 pt-6 border-t border-border flex flex-col sm:flex-row gap-4 justify-center text-xs text-muted-foreground">
                <span className="flex items-center justify-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-primary" />
                  +91 98002 47262
                </span>
                <span className="flex items-center justify-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-primary" />
                  hello@abjectravels.com
                </span>
                <span className="flex items-center justify-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-primary" />
                  Kolkata, West Bengal
                </span>
              </div>
            </div>
          </motion.div>
        </AnimatedSection>
      </section>

      <Footer4Col />
    </div>
  );
}
