import TextGenerateEffect from '@/components/ui/typewriter';

interface GradientTypewriterProps {
  count?: number;
}

export default function GradientTypewriter({ count }: GradientTypewriterProps) {
  const words = count 
    ? `Welcome to ABjee Travels - Explore ${count}+ Curated Itineraries`
    : "Welcome to ABjee Travels - Your Destination Our Responsibility";

  return (
    <div className="flex flex-col sm:flex-row items-center justify-center w-full px-4 min-h-14 pb-2 pt-9">
      <TextGenerateEffect
        words={words}
        className="bg-linear-to-r from-rose-600 to-pink-500 bg-clip-text text-2xl sm:text-3xl md:text-4xl font-bold text-transparent mt-5 leading-snug text-center wrap-break-word w-full min-h-[8.2rem]"
      />
    </div>
  );
}