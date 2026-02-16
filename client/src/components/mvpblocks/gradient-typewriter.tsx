import TextGenerateEffect from '@/components/ui/typewriter';

export default function GradientTypewriter() {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-center w-full px-4 min-h-[3.5rem] pb-2 pt-9">
      <TextGenerateEffect
  words="Welcome to ABjee Travels - Your Destination Our Responsibility"
  className="bg-gradient-to-r from-rose-600 to-pink-500 bg-clip-text text-2xl sm:text-3xl md:text-4xl font-bold text-transparent mt-5 leading-snug text-center break-words w-full min-h-[8.2rem]"
/>

    </div>
  );
}