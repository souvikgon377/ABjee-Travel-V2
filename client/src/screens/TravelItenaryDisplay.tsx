'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
	Search,
	MapPin,
	DollarSign,
	Clock,
	Heart,
	MessageCircle,
	ArrowLeft,
	X,
	Share2,
	Send,
	Globe,
	Facebook,
	Copy,
	Check,
	Image as ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { TravelData } from '@/types/travel';
import Header1 from '@/components/mvpblocks/header-1';

interface SearchState {
	query: string;
	results: TravelData[];
	loading: boolean;
	error: string | null;
	hasSearched: boolean;
}

const DEMO_TRAVEL_DATA: TravelData[] = [
	{
		id: 'demo-goa',
		place: 'Goa',
		country: 'India',
		itinerary:
			'Day 1: Arrive at Panaji, relax at Miramar Beach, evening cruise.\nDay 2: Explore North Goa beaches and Fort Aguada.\nDay 3: South Goa churches, local market shopping, sunset dinner by the sea.',
		places: ['Fort Aguada', 'Baga Beach', 'Calangute Beach', 'Basilica of Bom Jesus'],
		restaurants: ['Pousada by the Beach', 'Fisherman’s Wharf', 'Mum’s Kitchen'],
		hotels: ['Taj Fort Aguada', 'Zuri White Sands', 'Novotel Goa Resort'],
		budget: '₹18,000 - ₹30,000',
		images: [
			'https://images.unsplash.com/photo-1582972236019-ea9a8cda546f?w=1200&q=80',
			'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=1200&q=80',
			'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&q=80',
		],
		videos: [],
		map: null,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	},
	{
		id: 'demo-kerala',
		place: 'Alleppey',
		country: 'Kerala',
		itinerary:
			'Day 1: Check-in to houseboat and canal cruise.\nDay 2: Village walk and local cuisine trail.\nDay 3: Sunrise backwaters, shopping, and departure.',
		places: ['Alleppey Backwaters', 'Marari Beach', 'Pathiramanal Island'],
		restaurants: ['Thaff Delicacy', 'Cassia', 'Mushroom Houseboat Restaurant'],
		hotels: ['Punnamada Resort', 'Lemon Tree Vembanad Lake', 'Houseboat Stay'],
		budget: '₹22,000',
		images: ['https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=1200&q=80'],
		videos: [],
		map: null,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	},
];

const getDurationText = (result: TravelData) => {
	const dayMatches = result.itinerary?.match(/Day\s*\d+/gi) || [];
	if (dayMatches.length > 0) return `${dayMatches.length} Days`;
	const estimated = Math.max(2, Math.min(10, Math.ceil((result.places.length + result.hotels.length) / 2)));
	return `${estimated} Days`;
};

const getCardBadge = (index: number) => {
	const labels = ['Family', 'Couple', 'Group', 'Solo'];
	return labels[index % labels.length];
};

const getPreviewText = (result: TravelData) => {
	const firstLine = result.itinerary?.split('\n').find(line => line.trim().length > 0);
	if (firstLine) return firstLine;
	if (result.places.length > 0) return `Explore ${result.places.slice(0, 3).join(', ')} and more highlights.`;
	return 'Curated travel itinerary with handpicked places, restaurants, and stays.';
};

function TravelDetailModal({
	result,
	onClose,
}: {
	result: TravelData;
	onClose: () => void;
}) {
	const [liked, setLiked] = useState(false);
	const [likes, setLikes] = useState(Math.max(1, result.places.length - 1));
	const [copied, setCopied] = useState(false);
	const [commentName, setCommentName] = useState('');
	const [commentText, setCommentText] = useState('');

	useEffect(() => {
		const original = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = original;
		};
	}, []);

	const mapSrc = result.map && !result.map.endsWith('.pdf')
		? result.map
		: `https://maps.google.com/maps?q=${encodeURIComponent(`${result.place}, ${result.country}`)}&z=10&output=embed`;

	const toggleLike = () => {
		setLiked(prev => !prev);
		setLikes(prev => (liked ? Math.max(0, prev - 1) : prev + 1));
	};

	const handleShare = async (type: 'whatsapp' | 'facebook' | 'copy') => {
		const url = `${window.location.origin}/travel-destinations?place=${encodeURIComponent(result.place)}`;
		if (type === 'whatsapp') {
			window.open(`https://wa.me/?text=${encodeURIComponent(`${result.place} Travel Itinerary - ${url}`)}`);
			return;
		}
		if (type === 'facebook') {
			window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`);
			return;
		}
		await navigator.clipboard.writeText(url);
		setCopied(true);
		setTimeout(() => setCopied(false), 1600);
	};

	return (
		<AnimatePresence>
			<motion.div
				className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm"
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				exit={{ opacity: 0 }}
				onClick={onClose}
			>
				<div className="min-h-screen py-0 flex items-start justify-center">
					<motion.div
						className="relative bg-[#060912] max-w-5xl w-full mx-auto min-h-screen md:my-6 md:rounded-3xl overflow-hidden shadow-2xl border border-slate-800"
						initial={{ y: 40, opacity: 0 }}
						animate={{ y: 0, opacity: 1 }}
						exit={{ y: 40, opacity: 0 }}
						onClick={e => e.stopPropagation()}
					>
						<div className="relative h-80 md:h-105 overflow-hidden">
							<img
								src={result.images[0] || 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1200&q=80'}
								alt={result.place}
								className="w-full h-full object-cover"
							/>
							<div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/20 to-transparent" />
							<button
								onClick={onClose}
								className="absolute top-4 left-4 bg-black/40 backdrop-blur text-white rounded-full p-2 hover:bg-black/60 transition-colors"
							>
								<ArrowLeft className="w-5 h-5" />
							</button>
							<div className="absolute bottom-0 left-0 right-0 p-6">
								<div className="flex items-center gap-2 mb-2 text-rose-300">
									<MapPin className="w-4 h-4" />
									<span>{result.place}, {result.country}</span>
								</div>
								<h1 className="text-white text-3xl md:text-5xl font-black mb-2">{result.place} Travel Itinerary</h1>
								<div className="text-slate-300 text-sm flex items-center gap-3">
									<span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {getDurationText(result)}</span>
									<span>by <strong className="text-white">ABjee Travel</strong></span>
								</div>
							</div>
						</div>

						<div className="p-5 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
							<div className="lg:col-span-2 space-y-7">
								<section>
									<h2 className="text-3xl font-bold text-white mb-3">Place or Country of Travel</h2>
									<div className="flex flex-wrap gap-2">
										<Badge className="rounded-full bg-rose-500/20 text-rose-200 border border-rose-400/40 px-3 py-1">{result.place}</Badge>
										<Badge className="rounded-full bg-orange-500/20 text-orange-200 border border-orange-400/40 px-3 py-1">{result.country}</Badge>
									</div>
								</section>

								<section>
									<h2 className="text-3xl font-bold text-white mb-3">Introduction</h2>
									<p className="text-slate-300 text-lg leading-relaxed">{getPreviewText(result)}</p>
								</section>

								{result.itinerary && (
									<section>
										<h3 className="text-2xl font-bold text-white mb-3">Travel Itinerary</h3>
										<div className="space-y-2">
											{result.itinerary.split('\n').map((line, i) => (
												<p key={i} className="text-slate-300">{line}</p>
											))}
										</div>
									</section>
								)}

								<section>
									<h3 className="text-2xl font-bold text-white mb-3">Top Places to Visit</h3>
									{result.places.length > 0 ? (
										<div className="flex flex-wrap gap-2">
											{result.places.map((place, index) => (
												<Badge key={`${place}-${index}`} className="rounded-full bg-white/10 text-slate-200 border border-white/20 px-3 py-1">{place}</Badge>
											))}
										</div>
									) : (
										<p className="text-slate-400">No places added yet.</p>
									)}
								</section>

								<section>
									<h3 className="text-2xl font-bold text-white mb-3">Top Restaurants</h3>
									{result.restaurants.length > 0 ? (
										<div className="flex flex-wrap gap-2">
											{result.restaurants.map((restaurant, index) => (
												<Badge key={`${restaurant}-${index}`} className="rounded-full bg-emerald-500/15 text-emerald-200 border border-emerald-400/30 px-3 py-1">{restaurant}</Badge>
											))}
										</div>
									) : (
										<p className="text-slate-400">No restaurants added yet.</p>
									)}
								</section>

								<section>
									<h3 className="text-2xl font-bold text-white mb-3">Top Hotels and Resorts</h3>
									{result.hotels.length > 0 ? (
										<div className="flex flex-wrap gap-2">
											{result.hotels.map((hotel, index) => (
												<Badge key={`${hotel}-${index}`} className="rounded-full bg-blue-500/15 text-blue-200 border border-blue-400/30 px-3 py-1">{hotel}</Badge>
											))}
										</div>
									) : (
										<p className="text-slate-400">No hotels or resorts added yet.</p>
									)}
								</section>

								<section>
									<h3 className="text-2xl font-bold text-white mb-3 flex items-center gap-2"><ImageIcon className="w-5 h-5 text-purple-400" /> Upload Photo, Video</h3>
									{result.images.length > 0 && (
										<div className="space-y-3 mb-5">
											<p className="text-slate-300 text-sm">Photos ({result.images.length})</p>
											<div className="grid grid-cols-2 md:grid-cols-3 gap-3">
												{result.images.map((img, i) => (
													<img key={i} src={img} alt={`${result.place} ${i + 1}`} className="rounded-xl h-36 w-full object-cover" />
												))}
											</div>
										</div>
									)}
									{result.videos.length > 0 && (
										<div className="space-y-3">
											<p className="text-slate-300 text-sm">Videos ({result.videos.length})</p>
											<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
												{result.videos.map((videoUrl, i) => (
													<video key={`${videoUrl}-${i}`} src={videoUrl} controls className="rounded-xl h-56 w-full object-cover bg-black" preload="metadata" />
												))}
											</div>
										</div>
									)}
									{result.images.length === 0 && result.videos.length === 0 && (
										<p className="text-slate-400">No photos or videos uploaded yet.</p>
									)}
								</section>

								<section>
									<h3 className="text-2xl font-bold text-white mb-3">Upload Travel Map</h3>
									<div className="rounded-2xl overflow-hidden border border-slate-700 h-72">
										{result.map ? (
											<iframe
												src={mapSrc}
												width="100%"
												height="100%"
												style={{ border: 0 }}
												allowFullScreen
												loading="lazy"
												title="Travel map"
											/>
										) : (
											<iframe
												src={mapSrc}
												width="100%"
												height="100%"
												style={{ border: 0 }}
												allowFullScreen
												loading="lazy"
												title="Fallback travel map"
											/>
										)}
									</div>
									{!result.map && <p className="text-slate-400 text-sm mt-2">No custom travel map uploaded yet. Showing location map for {result.place}, {result.country}.</p>}
								</section>

								<section>
									<h3 className="text-2xl font-bold text-white mb-3 flex items-center gap-2"><Share2 className="w-5 h-5 text-blue-400" /> Share This Story</h3>
									<div className="flex flex-wrap gap-3 mb-5">
										<Button onClick={() => handleShare('whatsapp')} className="bg-green-600 hover:bg-green-700 rounded-xl"><Globe className="w-4 h-4 mr-1" /> WhatsApp</Button>
										<Button onClick={() => handleShare('facebook')} className="bg-blue-600 hover:bg-blue-700 rounded-xl"><Facebook className="w-4 h-4 mr-1" /> Facebook</Button>
										<Button onClick={() => handleShare('copy')} variant="secondary" className="rounded-xl">{copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}{copied ? 'Copied!' : 'Copy Link'}</Button>
									</div>
									<Button onClick={toggleLike} variant="secondary" className="rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200">
										<Heart className={`w-4 h-4 mr-2 ${liked ? 'fill-rose-500 text-rose-500' : ''}`} /> Like · {likes}
									</Button>
								</section>

								<section>
									<h3 className="text-2xl font-bold text-white mb-3 flex items-center gap-2"><MessageCircle className="w-5 h-5 text-indigo-400" /> Comments</h3>
									<div className="rounded-2xl border border-slate-700 bg-linear-to-br from-slate-900 to-slate-800 p-4 space-y-3">
										<input
											type="text"
											placeholder="Your name"
											value={commentName}
											onChange={e => setCommentName(e.target.value)}
											className="w-full bg-black/40 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-400 focus:outline-none"
										/>
										<textarea
											placeholder="Share your thoughts about this itinerary..."
											value={commentText}
											onChange={e => setCommentText(e.target.value)}
											rows={4}
											className="w-full bg-black/40 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-400 resize-none focus:outline-none"
										/>
										<Button disabled={!commentName.trim() || !commentText.trim()} className="rounded-xl bg-linear-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600">
											<Send className="w-4 h-4 mr-2" /> Post Comment
										</Button>
									</div>
								</section>
							</div>

							<div className="space-y-4">
								<div className="bg-linear-to-br from-rose-500/15 to-orange-500/15 border border-rose-500/30 rounded-2xl p-5 sticky top-4">
									<h3 className="font-bold text-white mb-4 text-xl">Trip Information</h3>
									<div className="space-y-4 text-sm">
										<div>
											<p className="text-slate-400">Destination</p>
											<p className="text-white font-semibold">{result.place}, {result.country}</p>
										</div>
										<div>
											<p className="text-slate-400">Duration</p>
											<p className="text-white font-semibold">{getDurationText(result)}</p>
										</div>
										<div>
											<p className="text-slate-400">Approx Budget</p>
											<p className="text-white font-semibold">{result.budget}</p>
										</div>
										<div>
											<p className="text-slate-400">Travel Type</p>
											<span className="inline-flex mt-1 text-xs font-semibold px-3 py-1 rounded-full bg-pink-500/20 text-pink-300 border border-pink-400/30">{getCardBadge(1)}</span>
										</div>
									</div>
								</div>
							</div>
						</div>
					</motion.div>
				</div>
			</motion.div>
		</AnimatePresence>
	);
}

export default function TravelItenaryDisplay() {
	const [search, setSearch] = useState<SearchState>({
		query: '',
		results: [],
		loading: false,
		error: null,
		hasSearched: false,
	});
	const [allResults, setAllResults] = useState<TravelData[]>([]);
	const [filterDestination, setFilterDestination] = useState('');
	const [filterDuration, setFilterDuration] = useState('');
	const [showFilters, setShowFilters] = useState(false);
	const [selectedResult, setSelectedResult] = useState<TravelData | null>(null);
	const heroRef = useRef<HTMLElement | null>(null);
	const resultsRef = useRef<HTMLElement | null>(null);

	const loadItineraries = useCallback(async () => {
		setSearch(prev => ({ ...prev, loading: true, error: null }));
		try {
			const res = await fetch('/api/travel');
			const data = await res.json();
			if (!res.ok) throw new Error(data.message || 'Failed to fetch itineraries');
			const fetchedResults: TravelData[] = data?.data?.results || data?.results || [];
			const combinedResults = [...fetchedResults, ...DEMO_TRAVEL_DATA];
			setAllResults(combinedResults);
			setSearch(prev => ({ ...prev, results: combinedResults, loading: false }));
		} catch (error: any) {
			setAllResults(DEMO_TRAVEL_DATA);
			setSearch(prev => ({ ...prev, results: DEMO_TRAVEL_DATA, loading: false, error: error.message || 'An error occurred' }));
		}
	}, []);

	useEffect(() => {
		loadItineraries();
	}, [loadItineraries]);

	useEffect(() => {
		let filtered = [...allResults];
		const q = search.query.trim().toLowerCase();

		if (q) {
			filtered = filtered.filter(item => {
				const searchableText = [
					item.place,
					item.country,
					item.itinerary,
					item.places.join(' '),
					item.restaurants.join(' '),
					item.hotels.join(' '),
				].join(' ').toLowerCase();
				return searchableText.includes(q);
			});
		}

		if (filterDestination.trim()) {
			const destinationQuery = filterDestination.trim().toLowerCase();
			filtered = filtered.filter(item =>
				`${item.place} ${item.country}`.toLowerCase().includes(destinationQuery)
			);
		}

		if (filterDuration) {
			filtered = filtered.filter(item => {
				const days = parseInt(getDurationText(item), 10);
				if (Number.isNaN(days)) return false;
				if (filterDuration === 'short') return days <= 3;
				if (filterDuration === 'medium') return days >= 4 && days <= 7;
				if (filterDuration === 'long') return days > 7;
				return true;
			});
		}

		setSearch(prev => ({ ...prev, results: filtered, hasSearched: Boolean(q) }));
	}, [allResults, search.query, filterDestination, filterDuration]);

	return (
		<div className="min-h-screen bg-background">
			<Header1 />

			<section ref={heroRef} className="relative pt-16 h-[75vh] min-h-130 flex items-center justify-center overflow-hidden">
				<div className="absolute inset-0">
					<img src="https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1600&q=80" alt="Travel destination" className="w-full h-full object-cover" />
					<div className="absolute inset-0 bg-linear-to-b from-black/60 via-black/40 to-black/30" />
				</div>
				<div className="absolute bottom-0 left-0 right-0 h-64 bg-linear-to-t from-background via-background/55 to-transparent pointer-events-none" />
				<div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
					<motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
						<span className="inline-block bg-rose-500/20 border border-rose-400/40 text-rose-300 text-xs font-semibold px-4 py-1.5 rounded-full mb-5">Curated Destination Plans</span>
						<h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-white mb-5 leading-tight">Travel <span className="bg-linear-to-r from-rose-400 to-orange-400 bg-clip-text text-transparent">Itineraries</span></h1>
						<p className="text-gray-300 text-lg md:text-xl mb-8 max-w-2xl mx-auto">Plan your next trip with destination highlights, recommended stays, food picks, and day-wise itinerary ideas.</p>
						<div className="flex flex-col sm:flex-row gap-3 max-w-3xl mx-auto">
							<div className="flex-1 flex items-center gap-2 bg-white/10 backdrop-blur border border-white/20 rounded-2xl px-4 py-3">
								<Search className="w-5 h-5 text-white/60 shrink-0" />
								<input type="text" value={search.query} onChange={e => setSearch(prev => ({ ...prev, query: e.target.value }))} placeholder="Search destinations or countries..." className="flex-1 bg-transparent text-white placeholder:text-white/50 focus:outline-none text-sm" />
							</div>
							<Button onClick={() => resultsRef.current?.scrollIntoView({ behavior: 'smooth' })} className="px-6 py-3 bg-linear-to-r from-rose-500 to-orange-500 text-white font-semibold rounded-2xl hover:opacity-90 transition-opacity text-sm shadow-lg shadow-rose-500/25">Explore</Button>
						</div>
						<div className="mt-5 flex flex-wrap items-center justify-center gap-3">
							<Button variant="outline" className="rounded-2xl border-white/30 text-white hover:bg-white/10" onClick={() => setSearch(prev => ({ ...prev, query: '', hasSearched: false }))}>Clear</Button>
						</div>
					</motion.div>
				</div>
			</section>

			<main ref={resultsRef} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
				{search.error && <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg"><p className="text-red-800 dark:text-red-200 font-medium">{search.error}</p></motion.div>}

				{search.loading && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center py-12"><div className="animate-spin"><div className="w-12 h-12 border-4 border-slate-200 dark:border-slate-700 border-t-rose-500 dark:border-t-orange-400 rounded-full" /></div></motion.div>}

				{!search.loading && (
					<section className="mb-8">
						<div className="flex flex-wrap items-center gap-3 mb-4">
							<span className="text-slate-200 font-semibold text-sm">Filter Itineraries:</span>
							<button
								onClick={() => setShowFilters(prev => !prev)}
								className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white/10 border border-white/20 rounded-xl hover:bg-white/20 transition-colors text-white"
							>
								<Search className="w-3.5 h-3.5" /> {showFilters ? 'Hide Filters' : 'Show Filters'}
							</button>
							{(filterDestination || filterDuration) && (
								<button
									onClick={() => { setFilterDestination(''); setFilterDuration(''); }}
									className="text-xs text-rose-300 hover:text-rose-200 flex items-center gap-1"
								>
									<X className="w-3 h-3" /> Clear Filters
								</button>
							)}
						</div>

						<AnimatePresence>
							{showFilters && (
								<motion.div
									initial={{ opacity: 0, height: 0 }}
									animate={{ opacity: 1, height: 'auto' }}
									exit={{ opacity: 0, height: 0 }}
									className="overflow-hidden"
								>
									<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white/5 rounded-2xl p-4 border border-white/10">
										<div>
											<label className="block text-xs text-slate-300 mb-1">Destination</label>
											<input
												type="text"
												placeholder="e.g. Goa or India"
												value={filterDestination}
												onChange={e => setFilterDestination(e.target.value)}
												className="w-full bg-black/30 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none"
											/>
										</div>
										<div>
											<label className="block text-xs text-slate-300 mb-1">Duration</label>
											<select
												value={filterDuration}
												onChange={e => setFilterDuration(e.target.value)}
												className="w-full bg-black/30 border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
											>
												<option value="">All Durations</option>
												<option value="short">Short (1-3 Days)</option>
												<option value="medium">Medium (4-7 Days)</option>
												<option value="long">Long (8+ Days)</option>
											</select>
										</div>
									</div>
								</motion.div>
							)}
						</AnimatePresence>
					</section>
				)}

				{!search.loading && search.hasSearched && search.results.length === 0 && !search.error && (
					<motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-12">
						<MapPin className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
						<h3 className="text-xl font-semibold text-slate-700 dark:text-slate-300 mb-2">No Results Found</h3>
						<p className="text-slate-500 dark:text-slate-400">Try searching with different keywords or check the spelling</p>
					</motion.div>
				)}

				{!search.loading && search.results.length > 0 && (
					<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
						<div className="flex items-center justify-between">
							<div className="text-sm text-slate-600 dark:text-slate-400">Showing <span className="font-semibold text-slate-900 dark:text-white">{search.results.length}</span> stories</div>
							<Badge className="text-sm px-3 py-1.5 bg-emerald-600 hover:bg-emerald-600 text-white rounded-full">Traveler Picks</Badge>
						</div>
						<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
							{search.results.map((result, idx) => (
								<motion.div key={result.id} className="group" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.08 }} whileHover={{ y: -4 }} onClick={() => setSelectedResult(result)}>
									<Card className="rounded-3xl border border-slate-700/50 shadow-xl overflow-hidden bg-[#12141c] text-white group-hover:shadow-2xl group-hover:border-slate-600 transition-all duration-300 cursor-pointer">
										<div className="relative h-52 bg-slate-800 overflow-hidden rounded-t-3xl">
											<img src={result.images[0] || 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1200&q=80'} alt={result.place} className="w-full h-full object-cover" />
											<div className="absolute inset-0 bg-linear-to-t from-black/70 to-transparent" />
											<span className="absolute top-4 right-4 text-xs font-semibold px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">{getCardBadge(idx)}</span>
											<div className="absolute bottom-4 left-4 right-4">
												<div className="flex items-center gap-2 text-white text-sm"><MapPin className="w-4 h-4" /><span>{result.place}, {result.country}</span></div>
											</div>
										</div>
										<div className="p-5 space-y-4">
											<div className="space-y-2">
												<h3 className="text-3xl font-bold text-white leading-tight line-clamp-2">{result.place} Travel Guide</h3>
												<p className="text-slate-300 text-sm line-clamp-2">{getPreviewText(result)}</p>
											</div>
											<div className="flex flex-wrap gap-4 text-sm text-slate-300 border-b border-white/10 pb-3">
												<span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {getDurationText(result)}</span>
												<span className="flex items-center gap-1"><DollarSign className="w-4 h-4" /> {result.budget}</span>
											</div>
											<div className="flex items-center justify-between text-sm">
												<div className="flex items-center gap-2 text-slate-300"><div className="w-7 h-7 rounded-full bg-linear-to-br from-rose-500 to-orange-500 text-white text-xs font-bold flex items-center justify-center">A</div><span>ABjee Travel</span></div>
												<div className="flex items-center gap-3 text-slate-400"><span className="flex items-center gap-1"><Heart className="w-4 h-4" /> {Math.max(1, result.places.length - 1)}</span><span className="flex items-center gap-1"><MessageCircle className="w-4 h-4" /> {Math.max(1, result.hotels.length)}</span></div>
											</div>
											<Button className="w-full rounded-2xl bg-linear-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 text-white font-semibold" onClick={e => { e.stopPropagation(); setSelectedResult(result); }}>Read More</Button>
										</div>
									</Card>
								</motion.div>
							))}
						</div>
					</motion.div>
				)}
			</main>

			<AnimatePresence>
				{selectedResult && <TravelDetailModal result={selectedResult} onClose={() => setSelectedResult(null)} />}
			</AnimatePresence>
		</div>
	);
}
