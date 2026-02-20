import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import gsap from 'gsap';
import { X } from 'lucide-react';

type Location = {
  id: number;
  name: string;
};

type State = Location & {};

type Country = Location & {};

type GroupToursPopupProps = {
  isOpen: boolean;
  onClose: () => void;
};

// Sample data - replace with your actual data source
const countries: Country[] = [
  { id: 1, name: 'India' },
  { id: 2, name: 'United States' },
  { id: 3, name: 'Thailand' },
  { id: 4, name: 'Japan' },
  { id: 5, name: 'Australia' },
  { id: 6, name: 'France' },
];

const statesByCountry: Record<number, State[]> = {
  1: [ // India
    { id: 1, name: 'Karnataka' },
    { id: 2, name: 'Kerala' },
    { id: 3, name: 'Tamil Nadu' },
    { id: 4, name: 'Rajasthan' },
    { id: 5, name: 'Goa' },
  ],
  2: [ // US
    { id: 4, name: 'California' },
    { id: 5, name: 'New York' },
    { id: 6, name: 'Florida' },
    { id: 7, name: 'Nevada' },
  ],
  3: [ // Thailand
    { id: 8, name: 'Bangkok' },
    { id: 9, name: 'Phuket' },
    { id: 10, name: 'Chiang Mai' },
  ],
};

const locationsByState: Record<number, Location[]> = {
  1: [ // Karnataka
    { id: 1, name: 'Bangalore' },
    { id: 2, name: 'Mysore' },
    { id: 3, name: 'Coorg' },
  ],
  2: [ // Kerala
    { id: 4, name: 'Kochi' },
    { id: 5, name: 'Munnar' },
    { id: 6, name: 'Alleppey' },
  ],
  3: [ // Tamil Nadu
    { id: 7, name: 'Chennai' },
    { id: 8, name: 'Ooty' },
    { id: 9, name: 'Kodaikanal' },
  ],
  4: [ // California
    { id: 10, name: 'Los Angeles' },
    { id: 11, name: 'San Francisco' },
  ],
  5: [ // New York
    { id: 12, name: 'New York City' },
    { id: 13, name: 'Niagara Falls' },
  ],
};

export const GroupToursPopup: React.FC<GroupToursPopupProps> = ({ isOpen, onClose }) => {
  const [step, setStep] = useState<number>(1);
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [selectedState, setSelectedState] = useState<State | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Animation on mount/unmount
  useEffect(() => {
    if (isOpen && popupRef.current) {
      gsap.fromTo(
        popupRef.current,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.3 }
      );
    }
  }, [isOpen]);

  const handleCountrySelect = (country: Country): void => {
    setSelectedCountry(country);
    setSelectedState(null);
    setStep(2);
  };

  const handleStateSelect = (state: State): void => {
    setSelectedState(state);
    setStep(3);
  };

  const handleLocationSelect = (location: Location): void => {
    if (import.meta.env.DEV) {
      console.log('Selected:', {
        country: selectedCountry,
        state: selectedState,
        location
      });
    }
    onClose();
  };

  const handleBack = (): void => {
    if (step > 1) {
      setStep(step - 1);
    } else {
      onClose();
    }
  };

  const renderStepContent = (): React.ReactElement => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-gray-800">Select Country</h3>
            <div className="grid grid-cols-2 gap-3">
              {countries.map((country) => (
                <motion.button
                  key={country.id}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.98 }}
                  className="p-4 border border-gray-200 rounded-lg text-left hover:bg-white/50 hover:border-blue-300 transition-all backdrop-blur-sm bg-white/70"
                  onClick={() => handleCountrySelect(country)}
                >
                  <span className="font-medium text-gray-800">{country.name}</span>
                </motion.button>
              ))}
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <div className="flex items-center space-x-2 mb-4">
              <button
                onClick={handleBack}
                className="p-1.5 rounded-full hover:bg-white/50 transition-colors"
                aria-label="Go back"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6"/>
                </svg>
              </button>
              <h3 className="text-xl font-semibold text-gray-800">Select State/Region</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {selectedCountry && statesByCountry[selectedCountry.id]?.map((state) => (
                <motion.button
                  key={state.id}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.98 }}
                  className="p-4 border border-gray-200 rounded-lg text-left hover:bg-white/50 hover:border-blue-300 transition-all backdrop-blur-sm bg-white/70"
                  onClick={() => handleStateSelect(state)}
                >
                  <span className="font-medium text-gray-800">{state.name}</span>
                </motion.button>
              ))}
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-4">
            <div className="flex items-center space-x-2 mb-4">
              <button
                onClick={handleBack}
                className="p-1.5 rounded-full hover:bg-white/50 transition-colors"
                aria-label="Go back"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6"/>
                </svg>
              </button>
              <h3 className="text-xl font-semibold text-gray-800">Select Location</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {selectedState && locationsByState[selectedState.id]?.map((location) => (
                <motion.button
                  key={location.id}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.98 }}
                  className="p-4 border border-gray-200 rounded-lg text-left hover:bg-white/50 hover:border-blue-300 transition-all backdrop-blur-sm bg-white/70"
                  onClick={() => handleLocationSelect(location)}
                >
                  <span className="font-medium text-gray-800">{location.name}</span>
                </motion.button>
              ))}
            </div>
          </div>
        );
      default:
        return <div>Invalid step</div>;
    }
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        ref={popupRef}
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -20, opacity: 0 }}
        className="bg-white/90 backdrop-blur-lg rounded-2xl w-full max-w-md p-6 relative shadow-xl border border-white/20"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-600 hover:text-gray-800 bg-white/50 hover:bg-white/80 rounded-full p-1.5 transition-all"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Find Group Tours</h2>
          <p className="text-gray-600 mt-1">Select your destination to find available group tours</p>
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex-1 flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                    i <= step
                      ? 'bg-blue-500/90 text-white'
                      : 'bg-white/50 text-gray-600'
                  }`}
                >
                  {i}
                </div>
                <span
                  className={`text-xs mt-2 ${
                    i <= step ? 'text-blue-500/90 font-medium' : 'text-gray-500'
                  }`}
                >
                  {i === 1 ? 'Country' : i === 2 ? 'State' : 'Location'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="min-h-[200px]"
          >
            {renderStepContent()}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
};

export default GroupToursPopup;