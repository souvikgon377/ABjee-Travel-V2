import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, ChevronDown, ArrowRight, Sparkles } from 'lucide-react';
import { useTheme } from './theme-provider';
import { ModeToggle } from './mode-toggle'
import { animate } from 'framer-motion'
import { useAuth } from '../../contexts/AuthContext';

interface NavItem {
  name: string;
  href: string;
  hasDropdown?: boolean;
  dropdownItems?: { name: string; href: string; description?: string }[];
}

const navItems: NavItem[] = [
  { name: 'Home', href: '/' },
  // { name: 'Hotel/Hostel  Booking', href: '#hotel_booking' },
  // { name: ' Bike/Car Rentals', href: '#hotel_booking' },
  // { name: 'Customised Tour Packages', href: '#hotel_booking' },
  { name: 'Community', href: '/chat' },
  { name: 'Booking Categories', href: '/booking-categories' },
  // {
  //   name: 'Booking',
  //   href: '',
  //   hasDropdown: true,
  //   dropdownItems: [
  //     {
  //       name: 'Hotel/Hostels or Tour Packages',
  //       href: '/hotel-booking',
  //       description: '🏨✈️ Book Custom Hotel & Tour Packages in One Click',
  //     },
  //     // {
  //     //   name: 'Tour Packages',
  //     //   href: '/',
  //     //   description: 'Tour Packages with Customization',
  //     // },
      
  //     { name: 'Car Rents',
  //       href: '/car-rentals',
  //        description: 'Car Rentals' },
  //     { name: 'Bike Rents',
  //       href: '/bike-rentals',
  //        description: 'Book Your Personal Bike' },
  //   ],
  // },
  { name: 'About', href: '/' },
  { name: 'Pricing', href: '#pricing' },
];

export default function Header1() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const { theme } = useTheme();
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const headerVariants = {
    initial: { y: -100, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    scrolled: {
      backdropFilter: 'blur(20px)',
      backgroundColor:
        theme === 'dark' ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.8)',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
    },
  };

  const mobileMenuVariants = {
    closed: { opacity: 0, height: 0 },
    open: { opacity: 1, height: 'auto' },
  };

  const dropdownVariants = {
    hidden: { opacity: 0, y: -10, scale: 0.95 },
    visible: { opacity: 1, y: 0, scale: 1 },
  };

  return (
    <motion.header
      className="fixed left-0 right-0 top-0 z-50 transition-all duration-300"
      variants={headerVariants}
      initial="initial"
      animate={isScrolled ? 'scrolled' : 'animate'}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      style={{
        backdropFilter: isScrolled ? 'blur(20px)' : 'none',
        backgroundColor: isScrolled
          ? theme === 'dark'
            ? 'rgba(0, 0, 0, 0.8)'
            : 'rgba(255, 255, 255, 0.8)'
          : 'transparent',
        boxShadow: isScrolled ? '0 8px 32px rgba(0, 0, 0, 0.1)' : 'none',
      }}
    >
      <div className="mx-auto max-w-7x2 px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between lg:h-20">
          <motion.div
            className="flex items-center space-x-2"
            whileHover={{ scale: 1.05 }}
            transition={{ type: 'spring', stiffness: 400, damping: 10 }}
          >
            <Link to="/" className="flex items-center space-x-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg overflow-hidden">
                <img src="/logo.jpg" alt="ABjee Travel" className="h-8 w-8 object-cover" />
              </div>
              <span className="bg-gradient-to-r from-rose-500 to-rose-700 bg-clip-text text-xl font-bold text-transparent">
                ABjee Travel
              </span>
            </Link>
          </motion.div>

          <nav className="hidden items-center space-x-8 lg:flex">
            {navItems.map((item) => (
              <div
                key={item.name}
                className="relative"
                onMouseEnter={() =>
                  item.hasDropdown && setActiveDropdown(item.name)
                }
                onMouseLeave={() => setActiveDropdown(null)}
              >
                {item.name === 'Pricing' ? (
                  <a
                    href={item.href}
                    className="flex items-center space-x-1 font-medium text-foreground transition-colors duration-200 hover:text-rose-500"
                    onClick={e => {
                      e.preventDefault();
                      const target = document.getElementById('pricing');
                      if (target) {
                        const start = window.scrollY;
                        const end = target.getBoundingClientRect().top + window.scrollY - 60; // adjust for header height
                        animate(start, end, {
                          duration: 0.7,
                          onUpdate: (value) => window.scrollTo(0, value),
                        });
                      }
                    }}
                  >
                    <span>{item.name}</span>
                  </a>
                
                ) : (
                  <Link
                    to={item.href}
                    className="flex items-center space-x-1 font-medium text-foreground transition-colors duration-200 hover:text-rose-500"
                  >
                    <span>{item.name}</span>
                    {item.hasDropdown && (
                      <ChevronDown className="h-4 w-4 transition-transform duration-200" />
                    )}
                  </Link>
                )}
                

                {item.hasDropdown && (
                  <AnimatePresence>
                    {activeDropdown === item.name && (
                      <motion.div
                        className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-100 overflow-hidden rounded-xl border border-border bg-background/95 shadow-xl backdrop-blur-lg"
                        variants={dropdownVariants}
                        initial="hidden"
                        animate="visible"
                        exit="hidden"
                        transition={{ duration: 0.2 }}
                      >
                        {item.dropdownItems?.map((dropdownItem) => (
                          <Link
                            key={dropdownItem.name}
                            to={dropdownItem.href}
                            className="block px-4 py-3 transition-colors duration-200 hover:bg-muted"
                            onClick={() => setActiveDropdown(null)}
                          >
                            <div className="font-medium text-foreground">
                              {dropdownItem.name}
                            </div>
                            {dropdownItem.description && (
                              <div className="text-sm text-muted-foreground">
                                {dropdownItem.description}
                              </div>
                            )}
                          </Link>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}
              </div>
            ))}
          </nav>

          <div className="hidden items-center space-x-4 lg:flex">
            {currentUser ? (
              <>
                <div className="flex items-center space-x-3">
                  <div className="text-right">
                    <p className="text-sm font-medium text-foreground">
                      {currentUser.displayName || currentUser.email}
                    </p>
                    <p className="text-xs text-muted-foreground">Welcome back!</p>
                  </div>
                  {currentUser.photoURL ? (
                    <img
                      src={currentUser.photoURL}
                      alt="Profile"
                      className="w-8 h-8 rounded-full border-2 border-rose-500"
                    />
                  ) : (
                    <div className="w-8 h-8 bg-rose-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                      {(currentUser.displayName || currentUser.email || 'U').charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    logout();
                    navigate('/');
                  }}
                  className="text-sm font-medium text-foreground transition-colors duration-200 hover:text-rose-500"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/auth"
                  className="font-medium text-foreground transition-colors duration-200 hover:text-rose-500"
                >
                  Sign In
                </Link>
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Link
                    to="/auth"
                    className="inline-flex items-center space-x-2 rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-6 py-2.5 font-medium text-white transition-all duration-200 hover:shadow-lg"
                  >
                    <span>Get Started</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </motion.div>
              </>
            )}
            <ModeToggle />
          </div>

          {/* Mobile: Theme toggle + Hamburger */}
          <div className="flex items-center space-x-2 lg:hidden">
            <ModeToggle />
            <motion.button
              className="rounded-lg p-2 transition-colors duration-200 hover:bg-muted"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              whileTap={{ scale: 0.95 }}
            >
              {isMobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </motion.button>
          </div>
        </div>

        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              className="overflow-hidden lg:hidden"
              variants={mobileMenuVariants}
              initial="closed"
              animate="open"
              exit="closed"
              transition={{ duration: 0.3, ease: 'easeInOut' }}
            >
              <div className="mt-4 space-y-2 rounded-xl border border-border bg-background/95 py-4 shadow-xl backdrop-blur-lg">
                {navItems.map((item) => (
                  item.name === 'Pricing' ? (
                    <a
                      key={item.name}
                      href={item.href}
                      className="block px-4 py-3 font-medium text-foreground transition-colors duration-200 hover:bg-muted"
                      onClick={e => {
                        e.preventDefault();
                        setIsMobileMenuOpen(false);
                        const target = document.getElementById('pricing');
                        if (target) {
                          const start = window.scrollY;
                          const end = target.getBoundingClientRect().top + window.scrollY - 60; // adjust for header height
                          animate(start, end, {
                            duration: 0.7,
                            onUpdate: (value) => window.scrollTo(0, value),
                          });
                        }
                      }}
                    >
                      {item.name}
                    </a>
                  ) : item.hasDropdown ? (
                    <div key={item.name} className="px-4 py-2">
                      <div className="font-medium text-foreground mb-2">{item.name}</div>
                      <div className="pl-4 space-y-1">
                        {item.dropdownItems?.map((dropdownItem) => (
                          <Link
                            key={dropdownItem.name}
                            to={dropdownItem.href}
                            className="block py-2 text-sm text-muted-foreground transition-colors duration-200 hover:text-rose-500"
                            onClick={() => setIsMobileMenuOpen(false)}
                          >
                            {dropdownItem.name}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <Link
                      key={item.name}
                      to={item.href}
                      className="block px-4 py-3 font-medium text-foreground transition-colors duration-200 hover:bg-muted"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      {item.name}
                    </Link>
                  )
                ))}
                <div className="space-y-2 px-4 py-2">
                  {currentUser ? (
                    <>
                      <div className="flex items-center space-x-3 px-4 py-3 bg-muted rounded-lg">
                        {currentUser.photoURL ? (
                          <img
                            src={currentUser.photoURL}
                            alt="Profile"
                            className="w-10 h-10 rounded-full border-2 border-rose-500"
                          />
                        ) : (
                          <div className="w-10 h-10 bg-rose-500 rounded-full flex items-center justify-center text-white font-bold">
                            {(currentUser.displayName || currentUser.email || 'U').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-foreground">
                            {currentUser.displayName || currentUser.email}
                          </p>
                          <p className="text-xs text-muted-foreground">Welcome back!</p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setIsMobileMenuOpen(false);
                          logout();
                          navigate('/');
                        }}
                        className="block w-full rounded-lg py-2.5 text-center font-medium text-foreground transition-colors duration-200 hover:bg-muted"
                      >
                        Sign Out
                      </button>
                    </>
                  ) : (
                    <>
                      <Link
                        to="/auth"
                        className="block w-full rounded-lg py-2.5 text-center font-medium text-foreground transition-colors duration-200 hover:bg-muted"
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        Sign In
                      </Link>
                      <Link
                        to="/auth"
                        className="block w-full rounded-lg bg-gradient-to-r from-rose-500 to-rose-700 py-2.5 text-center font-medium text-white transition-all duration-200 hover:shadow-lg"
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        Get Started
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.header>
  );
}
