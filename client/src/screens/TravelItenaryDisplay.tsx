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
	Maximize2,
	Minimize2,
	X,
	Share2,
	Send,
	Globe,
	Facebook,
	Copy,
	Check,
	Image as ImageIcon,
	Loader2,
	Sailboat,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { TravelData } from '@/types/travel';
import Header1 from '@/components/mvpblocks/header-1';
import CommunityHeader from '@/components/mvpblocks/community-header';

interface SearchState {
	query: string;
	results: TravelData[];
	loading: boolean;
	error: string | null;
	hasSearched: boolean;
}

const getDurationText = (result: TravelData) => {
	if (result.durationText) return result.durationText;
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
	if (result.introduction) return result.introduction;
	if (result.overview) return result.overview;
	const firstLine = result.itinerary?.split('\n').find(line => line.trim().length > 0);
	if (firstLine) return firstLine;
	if (result.places.length > 0) return `Explore ${result.places.slice(0, 3).join(', ')} and more highlights.`;
	return 'Curated travel itinerary with handpicked places, restaurants, and stays.';
};

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const looksLikeBudget = (value: string) => {
	const text = value.trim().toLowerCase();
	if (!text) return false;
	if (/\b(budget|per\s*person|pp)\b/.test(text)) return true;
	if (/[$€£₹]/.test(text)) return true;
	if (/\d+\s*[-to]+\s*\d+/.test(text)) return true;
	return false;
};

const hasDayPattern = (value: string) => /\bday\s*\d+\b/i.test(value);

const sanitizeTravelData = (raw: TravelData): TravelData => {
	let place = normalizeWhitespace(raw.place || '');
	let country = normalizeWhitespace(raw.country || '');
	let itinerary = (raw.itinerary || '').trim();
	let budget = normalizeBudgetText(raw.budgetEstimate) || normalizeBudgetText(raw.budget);
	let places = Array.isArray(raw.places) ? raw.places.map((item) => item.trim()).filter(Boolean) : [];
	let restaurants = Array.isArray(raw.restaurants) ? raw.restaurants.map((item) => item.trim()).filter(Boolean) : [];
	let hotels = Array.isArray(raw.hotels) ? raw.hotels.map((item) => item.trim()).filter(Boolean) : [];

	if (!itinerary && hasDayPattern(country)) {
		itinerary = country;
		country = '';
	}

	if (!itinerary && hasDayPattern(place)) {
		const dayStart = place.search(/,?\s*Day\s*\d+/i);
		if (dayStart > 0) {
			itinerary = place.slice(dayStart).replace(/^,\s*/, '').trim();
			place = place.slice(0, dayStart).trim();
		}
	}

	if (itinerary && looksLikeBudget(itinerary) && !budget) {
		budget = itinerary;
		itinerary = '';
	}

	if (!budget && looksLikeBudget(country)) {
		budget = country;
		country = '';
	}

	if (!budget && places.length > 0 && looksLikeBudget(places[0])) {
		budget = places[0];
		places = places.slice(1);
	}

	if (places.length > 0 && looksLikeBudget(places[0]) && restaurants.length > 0) {
		if (!budget) budget = places[0];
		places = restaurants;
		restaurants = hotels;
	}

	if (!country || hasDayPattern(country)) {
		const parenthesized = place.match(/\(([^)]+)\)/)?.[1]?.trim();
		if (parenthesized && !hasDayPattern(parenthesized)) {
			country = parenthesized;
		}
	}

	return {
		...raw,
		introduction: (raw.introduction || raw.overview || '').trim(),
		place,
		country,
		itinerary,
		budget: budget || raw.budget || '',
		places,
		restaurants,
		hotels,
	};
};

interface GeminiItineraryFormState {
	place: string;
	country: string;
	interest: string;
	duration: string;
	budget: string;
	travelStyle: string;
	travelers: string;
}

interface GeminiTravelResponse {
	content?: string;
	structured?: Record<string, any> | null;
	message?: string;
}

const DEFAULT_GEMINI_FORM: GeminiItineraryFormState = {
	place: '',
	country: '',
	interest: '',
	duration: '',
	budget: '',
	travelStyle: '',
	travelers: '',
};

const toStringArray = (value: unknown): string[] => {
	if (!Array.isArray(value)) return [];
	return value
		.map((item) => {
			if (typeof item === 'string') return item.trim();
			if (item && typeof item === 'object') {
				const candidate = item as Record<string, unknown>;
				if (typeof candidate.name === 'string') return candidate.name.trim();
				if (typeof candidate.title === 'string') return candidate.title.trim();
				if (typeof candidate.label === 'string') return candidate.label.trim();
			}
			return '';
		})
		.filter(Boolean);
};

const formatGeminiItinerary = (structured: Record<string, any> | null | undefined, fallbackContent: string): string => {
	const days = Array.isArray(structured?.days) ? structured.days : [];
	if (days.length > 0) {
		return days
			.map((day: any, index: number) => {
				const dayLabel = typeof day?.day === 'string' || typeof day?.day === 'number' ? `Day ${day.day}` : `Day ${index + 1}`;
				const title = typeof day?.title === 'string' && day.title.trim() ? `: ${day.title.trim()}` : '';
				const activities = toStringArray(day?.activities);
				const activityLines = activities.length > 0 ? activities.map((activity) => `- ${activity}`).join('\n') : '- Explore the destination at your own pace';
				return `${dayLabel}${title}\n${activityLines}`;
			})
			.join('\n\n');
	}

	return typeof fallbackContent === 'string' && fallbackContent.trim() ? fallbackContent.trim() : 'Gemini generated a travel itinerary for your destination.';
};

const renderFormattedItinerary = (itinerary: string) => {
	const normalizedItinerary = itinerary
		.replace(/\r\n/g, '\n')
		.replace(/\s*;\s*(?=Day\s*\d+)/gi, '\n')
		.replace(/([.!?])\s*(?=Day\s*\d+\s*[:.-]?)/gi, '$1\n')
		.replace(/([^\n])\s+(?=Day\s*\d+\s*[:.-]?)/gi, '$1\n')
		.trim();

	const renderDayBody = (body: string) => {
		const lines = body
			.replace(/\r\n/g, '\n')
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.length > 0 && !/^\d+$/.test(line));

		if (lines.length === 0) {
			return <p className="text-muted-foreground text-sm leading-relaxed">Explore the destination at your own pace.</p>;
		}

		return (
			<div className="space-y-2">
				{lines.map((line, index) => {
					if (/^[-•]\s*/.test(line)) {
						return (
							<div key={index} className="flex gap-2 text-muted-foreground text-sm leading-relaxed">
								<span className="shrink-0 text-rose-500 font-bold">•</span>
								<span>{line.replace(/^[-•]\s*/, '')}</span>
							</div>
						);
					}

					if (/^[A-Za-z].*:\s*$/.test(line)) {
						return (
							<p key={index} className="text-sm font-semibold text-foreground/85">
								{line}
							</p>
						);
					}

					return (
						<p key={index} className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line">
							{line}
						</p>
					);
				})}
			</div>
		);
	};

	const dayRegex = /(?:^|\n)\s*(Day\s*\d+\s*[:.-]?\s*)([\s\S]*?)(?=(?:\n\s*Day\s*\d+\s*[:.-]?\s*)|$)/gi;
	const sections = Array.from(normalizedItinerary.matchAll(dayRegex)).map((match) => {
		const heading = (match[1] || '').trim().replace(/[:.-]\s*$/, '');
		const body = (match[2] || '').trim();
		return { heading, body };
	});

	if (sections.length > 0) {
		return (
			<div className="space-y-3">
				{sections.map((section, index) => (
					<div key={`${section.heading}-${index}`} className="rounded-2xl border border-rose-200/70 dark:border-rose-900/40 bg-rose-50/60 dark:bg-rose-950/20 p-4 shadow-sm">
						<h4 className="font-bold text-foreground text-sm sm:text-base mb-2 flex items-center gap-2">
							<span className="shrink-0 w-6 h-6 rounded-full bg-rose-500/20 text-rose-700 dark:text-rose-300 flex items-center justify-center text-xs font-bold">
								{section.heading.match(/\d+/)?.[0] || index + 1}
							</span>
							{section.heading}
						</h4>
						{renderDayBody(section.body)}
					</div>
				))}
			</div>
		);
	}

	return normalizedItinerary.split('\n').map((line, i) => {
		const trimmed = line.trim();
		if (!trimmed) {
			return <div key={`empty-${i}`} className="h-1" />;
		}

		if (/^[-•]\s*/.test(trimmed)) {
			const activityText = trimmed.replace(/^[-•]\s*/, '');
			return (
				<div key={`activity-${i}`} className="flex gap-2 text-muted-foreground text-sm leading-relaxed ml-2">
					<span className="shrink-0 text-rose-500 font-bold">•</span>
					<span>{activityText}</span>
				</div>
			);
		}

		return (
			<p key={`text-${i}`} className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line">
				{trimmed}
			</p>
		);
	});
};

const parseBoldText = (text: string) => {
	// Parse **title:** pattern and split into title and description
	const match = text.match(/^\*\*(.+?):\*\*\s*(.*)/);
	if (match) {
		return { title: match[1], description: match[2] };
	}
	return { title: '', description: text };
};

const normalizeBudgetText = (value: unknown): string => {
	if (typeof value === 'string') return value.trim();
	if (typeof value === 'number' && Number.isFinite(value)) return String(value);
	if (!value || typeof value !== 'object') return '';

	const record = value as Record<string, unknown>;
	const preferredKeys = ['display', 'text', 'label', 'range', 'estimate', 'budget', 'amount', 'value'];

	for (const key of preferredKeys) {
		const candidate = record[key];
		if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
		if (typeof candidate === 'number' && Number.isFinite(candidate)) return String(candidate);
	}

	const min = typeof record.min === 'number' ? record.min : typeof record.minimum === 'number' ? record.minimum : null;
	const max = typeof record.max === 'number' ? record.max : typeof record.maximum === 'number' ? record.maximum : null;
	if (min !== null || max !== null) {
		const minText = min !== null ? String(min) : '';
		const maxText = max !== null ? String(max) : '';
		return minText && maxText ? `${minText} - ${maxText}` : minText || maxText;
	}

	for (const candidate of Object.values(record)) {
		if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
		if (typeof candidate === 'number' && Number.isFinite(candidate)) return String(candidate);
	}

	return '';
};

const getBudgetDisplayText = (result: TravelData): string => {
	return normalizeBudgetText(result.budgetEstimate) || normalizeBudgetText(result.budget) || 'Budget on request';
};

const renderTravelTip = (tip: string, index: number) => {
	const { title, description } = parseBoldText(tip);
	return (
		<div key={`tip-${index}`} className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 dark:bg-amber-950/30">
			{title ? (
				<>
					<p className="text-sm font-bold text-amber-700 dark:text-amber-300">{title}:</p>
					<p className="text-sm text-amber-700/90 dark:text-amber-300/90 leading-relaxed mt-1">{description}</p>
				</>
			) : (
				<p className="text-sm text-amber-700 dark:text-amber-300 leading-relaxed">{description}</p>
			)}
		</div>
	);
};

const renderLocalInsight = (insight: string, index: number) => {
	const { title, description } = parseBoldText(insight);
	return (
		<div key={`insight-${index}`} className="rounded-2xl border border-violet-400/30 bg-violet-500/10 px-4 py-3 dark:bg-violet-950/30">
			{title ? (
				<>
					<p className="text-sm font-bold text-violet-700 dark:text-violet-300">{title}:</p>
					<p className="text-sm text-violet-700/90 dark:text-violet-300/90 leading-relaxed mt-1">{description}</p>
				</>
			) : (
				<p className="text-sm text-violet-700 dark:text-violet-300 leading-relaxed">{description}</p>
			)}
		</div>
	);
};

const buildGeneratedTravelData = (
	form: GeminiItineraryFormState,
	response: GeminiTravelResponse,
): TravelData => {
	const structured = response.structured || {};
	const routePoints: Array<{ name: string; lat?: number; lng?: number }> = Array.isArray(structured?.routePoints)
		? structured.routePoints
			.map((point: any) => {
				if (!point || typeof point !== 'object') return null;
				const name = typeof point.name === 'string' ? point.name.trim() : '';
				if (!name) return null;
				const lat = typeof point.lat === 'number' ? point.lat : undefined;
				const lng = typeof point.lng === 'number' ? point.lng : undefined;
				return { name, ...(typeof lat === 'number' ? { lat } : {}), ...(typeof lng === 'number' ? { lng } : {}) };
			})
			.filter((item): item is { name: string; lat?: number; lng?: number } => item !== null)
		: [];

	const places = Array.from(
		new Set([
			...toStringArray(structured?.places),
			...routePoints.map((point: any) => point.name),
		].filter(Boolean)),
	).slice(0, 10);

	const hotels = toStringArray(structured?.hotels);
	const restaurants = toStringArray(structured?.restaurants);
	const travelTips = toStringArray(structured?.travelTips);
	const localInsights = toStringArray(structured?.localInsights);
	const itinerary = formatGeminiItinerary(structured, response.content || '');
	const normalizedBudgetEstimate = normalizeBudgetText(structured?.budgetEstimate);
	const normalizedBudget = normalizeBudgetText(structured?.budget);
	const normalizedFormBudget = normalizeBudgetText(form.budget);

	return {
		id: `gemini-${Date.now()}`,
		place: form.place.trim(),
		country: form.country.trim(),
		introduction:
			typeof structured?.introduction === 'string'
				? structured.introduction.trim()
				: (typeof structured?.overview === 'string' ? structured.overview.trim() : (response.content || '').trim()),
		itinerary,
		places,
		restaurants,
		hotels,
		budget: normalizedBudgetEstimate || normalizedBudget || normalizedFormBudget || 'Budget on request',
		images: [],
		videos: [],
		map: null,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		overview: typeof structured?.overview === 'string' ? structured.overview : response.content || '',
		durationText: typeof structured?.duration === 'string' ? structured.duration : form.duration || '',
		budgetEstimate: normalizedBudgetEstimate || normalizedBudget || normalizedFormBudget || '',
		travelTips,
		localInsights,
		routeFlow: typeof structured?.routeFlow === 'string' ? structured.routeFlow : '',
		routePoints,
		generatedBy: 'gemini',
	};
};

function TravelDetailModal({
	result,
	shareStoryId,
	onClose,
}: {
	result: TravelData;
	shareStoryId: string;
	onClose: () => void;
}) {
	const [liked, setLiked] = useState(false);
	const [likes, setLikes] = useState(Math.max(1, result.places.length - 1));
	const [copied, setCopied] = useState(false);
	const [commentName, setCommentName] = useState('');
	const [commentText, setCommentText] = useState('');
	const [isWindowExpanded, setIsWindowExpanded] = useState(false);

	useEffect(() => {
		const original = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = original;
		};
	}, []);

	const toggleWindowExpand = () => {
		setIsWindowExpanded((prev) => !prev);
	};

	const mapSrc = result.map && !result.map.endsWith('.pdf')
		? result.map
		: `https://maps.google.com/maps?q=${encodeURIComponent(`${result.place}, ${result.country}`)}&z=10&output=embed`;

	const toggleLike = () => {
		setLiked(prev => !prev);
		setLikes(prev => (liked ? Math.max(0, prev - 1) : prev + 1));
	};

	const handleShare = async (type: 'whatsapp' | 'facebook' | 'copy') => {
		const shareUrl = new URL(window.location.href);
		shareUrl.pathname = window.location.pathname.includes('/travel-itinerary') ? '/travel-itinerary' : '/travel-destinations';
		shareUrl.searchParams.set('story', shareStoryId);
		shareUrl.searchParams.set('place', result.place);
		const url = shareUrl.toString();
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
		setTimeout(() => setCopied(false), 1000);
	};

	return (
		<AnimatePresence>
			<motion.div
				data-lenis-prevent
				className="fixed inset-0 z-50 overflow-y-auto overscroll-contain touch-pan-y bg-black/80 backdrop-blur-sm"
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				exit={{ opacity: 0 }}
				onClick={onClose}
			>
				<div className="min-h-screen py-0 flex items-start justify-center">
					<motion.div
						layout
						className={`relative bg-background w-full mx-auto min-h-screen overflow-hidden shadow-2xl transition-[max-width,margin,border-radius] duration-500 ease-out ${isWindowExpanded ? 'max-w-[98vw] md:my-2 md:rounded-2xl' : 'max-w-4xl md:my-8 md:rounded-3xl'}`}
						initial={{ y: 40, opacity: 0 }}
						animate={{ y: 0, opacity: 1 }}
						exit={{ y: 40, opacity: 0 }}
						transition={{ layout: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } }}
						onClick={e => e.stopPropagation()}
					>
						<div className="relative h-72 md:h-96 overflow-hidden">
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
							<button
								onClick={toggleWindowExpand}
								title={isWindowExpanded ? 'Restore card width' : 'Expand to window width'}
								className="hidden md:inline-flex absolute top-4 right-4 bg-black/40 backdrop-blur text-white rounded-full p-2 hover:bg-black/60 transition-colors"
							>
								{isWindowExpanded ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
							</button>
							<div className="absolute bottom-0 left-0 right-0 p-6">
								<div className="flex items-center gap-2 mb-2 text-rose-300">
									<MapPin className="w-4 h-4" />
									<span>{result.place}, {result.country}</span>
								</div>
								<h1 className="text-white text-3xl md:text-5xl font-black mb-2">{result.place} Travel Itinerary</h1>
								<div className="text-gray-300 text-sm flex items-center gap-3">
									<span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {getDurationText(result)}</span>
									<span>by <strong className="text-white">ABjee Travel</strong></span>
								</div>
							</div>
						</div>

						<div className="p-5 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
							<div className="lg:col-span-2 space-y-7">
								<section>
									<h2 className="text-xl font-bold text-foreground mb-3">Place or Country of Travel</h2>
									<div className="flex flex-wrap gap-2">
										<Badge className="rounded-full bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-400/40 px-3 py-1">{result.place}</Badge>
										<Badge className="rounded-full bg-orange-500/20 text-orange-700 dark:text-orange-300 border border-orange-400/40 px-3 py-1">{result.country}</Badge>
									</div>
								</section>

								<section>
									<h2 className="text-xl font-bold text-foreground mb-3">Introduction</h2>
									<p className="text-muted-foreground text-sm leading-relaxed">{getPreviewText(result)}</p>
								</section>

								{result.overview && result.overview !== (result.introduction || '').trim() && result.overview !== getPreviewText(result) && (
									<section>
										<h3 className="text-xl font-bold text-foreground mb-3">Itinerary Overview</h3>
										<p className="text-muted-foreground text-sm leading-relaxed">{result.overview}</p>
									</section>
								)}

								{result.itinerary && (
									<section>
										<h3 className="text-xl font-bold text-foreground mb-3">Travel Itinerary</h3>
										<div className="space-y-1">
											{renderFormattedItinerary(result.itinerary)}
										</div>
									</section>
								)}

								{result.travelTips && result.travelTips.length > 0 && (
										<section>
											<h3 className="text-xl font-bold text-foreground mb-4">Travel Tips</h3>
											<div className="space-y-2">
												{result.travelTips.map((tip, index) => renderTravelTip(tip, index))}
											</div>
										</section>
									)}

									{result.localInsights && result.localInsights.length > 0 && (
										<section>
											<h3 className="text-xl font-bold text-foreground mb-4">Local Insights</h3>
											<div className="space-y-2">
												{result.localInsights.map((insight, index) => renderLocalInsight(insight, index))}
											</div>
										</section>
									)}

									{result.routeFlow && (
										<section>
											<h3 className="text-xl font-bold text-foreground mb-4">Route Flow</h3>
											<div className="rounded-xl border border-border/50 bg-muted/30 px-4 py-3">
												<p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line font-medium">{result.routeFlow}</p>
											</div>
										</section>
									)}


								<section>
									<h3 className="text-xl font-bold text-foreground mb-3">Upload Travel Map</h3>
									<div className="rounded-2xl overflow-hidden border border-border h-72">
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
									{!result.map && <p className="text-muted-foreground text-sm mt-2">No custom travel map uploaded yet. Showing location map for {result.place}, {result.country}.</p>}
								</section>

							</div>

							<div className="space-y-6">
								<div className="bg-linear-to-br from-rose-50 dark:from-rose-500/10 to-orange-50 dark:to-orange-500/10 border border-rose-200 dark:border-rose-500/20 rounded-2xl p-5 sticky top-4">
									<h3 className="font-bold text-foreground mb-4 text-base">Trip Information</h3>
									<div className="space-y-4 text-sm">
										<div>
											<p className="text-muted-foreground">Destination</p>
											<p className="text-foreground font-semibold">{result.place}, {result.country}</p>
										</div>
										<div>
											<p className="text-muted-foreground">Duration</p>
												<p className="text-foreground font-semibold">{result.durationText || getDurationText(result)}</p>
										</div>
										<div>
											<p className="text-muted-foreground">Approx Budget</p>
												<p className="text-foreground font-semibold">{getBudgetDisplayText(result)}</p>
										</div>
										<div>
											<p className="text-muted-foreground">Travel Type</p>
											<span className="inline-flex mt-1 text-xs font-semibold px-3 py-1 rounded-full bg-pink-500/20 text-pink-700 dark:text-pink-300 border border-pink-400/30">{getCardBadge(1)}</span>
										</div>
									</div>
								</div>

								<section>
									<h3 className="text-xl font-bold text-foreground mb-3">Top Places to Visit</h3>
									{result.places.length > 0 ? (
										<div className="flex flex-wrap gap-2">
											{result.places.map((place, index) => (
												<Badge key={`${place}-${index}`} className="rounded-full bg-muted text-foreground border border-border px-3 py-1">{place}</Badge>
											))}
										</div>
									) : (
										<p className="text-muted-foreground">No places added yet.</p>
									)}
								</section>

								<section>
									<h3 className="text-xl font-bold text-foreground mb-3">Top Restaurants</h3>
									{result.restaurants.length > 0 ? (
										<div className="flex flex-wrap gap-2">
											{result.restaurants.map((restaurant, index) => (
												<Badge key={`${restaurant}-${index}`} className="rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-400/30 px-3 py-1">{restaurant}</Badge>
											))}
										</div>
									) : (
										<p className="text-muted-foreground">No restaurants added yet.</p>
									)}
								</section>

								<section>
									<h3 className="text-xl font-bold text-foreground mb-3">Top Hotels and Resorts</h3>
									{result.hotels.length > 0 ? (
										<div className="flex flex-wrap gap-2">
											{result.hotels.map((hotel, index) => (
												<Badge key={`${hotel}-${index}`} className="rounded-full bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-400/30 px-3 py-1">{hotel}</Badge>
											))}
										</div>
									) : (
										<p className="text-muted-foreground">No hotels or resorts added yet.</p>
									)}
								</section>

								<section>
									<h3 className="text-xl font-bold text-foreground mb-3 flex items-center gap-2"><ImageIcon className="w-5 h-5 text-purple-500" /> Upload Photo, Video</h3>
									{result.images.length > 0 && (
										<div className="space-y-3 mb-5">
											<p className="text-muted-foreground text-sm">Photos ({result.images.length})</p>
											<div className="grid grid-cols-2 gap-3">
												{result.images.map((img, i) => (
													<img key={i} src={img} alt={`${result.place} ${i + 1}`} className="rounded-xl h-32 w-full object-cover" />
												))}
											</div>
										</div>
									)}
									{result.videos.length > 0 && (
										<div className="space-y-3">
											<p className="text-muted-foreground text-sm">Videos ({result.videos.length})</p>
											<div className="grid grid-cols-1 gap-3">
												{result.videos.map((videoUrl, i) => (
													<video key={`${videoUrl}-${i}`} src={videoUrl} controls className="rounded-xl h-48 w-full object-cover bg-black" preload="metadata" />
												))}
											</div>
										</div>
									)}
									{result.images.length === 0 && result.videos.length === 0 && (
										<p className="text-muted-foreground">No photos or videos uploaded yet.</p>
									)}
								</section>
							</div>

							<div className="lg:col-span-2 space-y-7">
								<section>
									<h3 className="text-xl font-bold text-foreground mb-3 flex items-center gap-2"><Share2 className="w-5 h-5 text-blue-500" /> Share This Story</h3>
									<div className="flex flex-wrap gap-3 mb-5">
										<Button onClick={() => handleShare('whatsapp')} className="flex items-center gap-2 px-4 py-2 bg-green-50 dark:bg-green-500/10 border border-green-300 dark:border-green-500/30 text-green-700 dark:text-green-400 rounded-xl text-sm hover:bg-green-100 dark:hover:bg-green-500/20 transition-colors"><Globe className="w-4 h-4" /> WhatsApp</Button>
										<Button onClick={() => handleShare('facebook')} className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-500/10 border border-blue-300 dark:border-blue-500/30 text-blue-700 dark:text-blue-400 rounded-xl text-sm hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"><Facebook className="w-4 h-4" /> Facebook</Button>
										<Button onClick={() => handleShare('copy')} className="flex items-center gap-2 px-4 py-2 bg-muted border border-border text-muted-foreground rounded-xl text-sm hover:bg-accent transition-colors">{copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}{copied ? 'Copied!' : 'Copy Link'}</Button>
									</div>
									<Button onClick={toggleLike} className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-colors ${liked ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/40' : 'bg-muted text-muted-foreground border border-border hover:bg-rose-500/10 hover:text-rose-500 dark:hover:text-rose-400'}`}>
										<Heart className={`w-5 h-5 ${liked ? 'fill-rose-500 text-rose-500' : ''}`} /> Like · {likes}
									</Button>
								</section>

								<section>
									<h3 className="text-xl font-bold text-foreground mb-3 flex items-center gap-2"><MessageCircle className="w-5 h-5 text-indigo-500" /> Comments</h3>
									<div className="bg-muted/60 rounded-2xl p-4 mb-4 space-y-3 border border-border">
										<input
											type="text"
											placeholder="Your name"
											value={commentName}
											onChange={e => setCommentName(e.target.value)}
											className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-rose-500/40"
										/>
										<textarea
											placeholder="Share your thoughts about this itinerary..."
											value={commentText}
											onChange={e => setCommentText(e.target.value)}
											rows={4}
											className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-rose-500/40"
										/>
										<Button disabled={!commentName.trim() || !commentText.trim()} className="rounded-xl bg-linear-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600">
											<Send className="w-4 h-4 mr-2" /> Post Comment
										</Button>
									</div>
								</section>
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
	const [showAiGenerator, setShowAiGenerator] = useState(false);
	const [selectedResult, setSelectedResult] = useState<TravelData | null>(null);
	const [hasHandledInitialStoryLink, setHasHandledInitialStoryLink] = useState(false);
	const [hasLoadedItineraries, setHasLoadedItineraries] = useState(false);
	const [geminiForm, setGeminiForm] = useState<GeminiItineraryFormState>(DEFAULT_GEMINI_FORM);
	const [_generatedItinerary, setGeneratedItinerary] = useState<TravelData | null>(null);
	const [isGenerating, setIsGenerating] = useState(false);
	const [generationError, setGenerationError] = useState<string | null>(null);
	const heroRef = useRef<HTMLElement | null>(null);
	const generatorRef = useRef<HTMLElement | null>(null);
	const resultsRef = useRef<HTMLElement | null>(null);

	useEffect(() => {
		if (showAiGenerator) {
			generatorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	}, [showAiGenerator]);

	const loadItineraries = useCallback(async () => {
		setSearch(prev => ({ ...prev, loading: true, error: null }));
		setHasLoadedItineraries(false);
		try {
			const res = await fetch('/api/travel');
			const data = await res.json();
			if (!res.ok) throw new Error(data.message || 'Failed to fetch itineraries');
			const fetchedResults: TravelData[] = (data?.data?.results || data?.results || []).map((item: TravelData) => sanitizeTravelData(item));
			setAllResults(fetchedResults);
			setSearch(prev => ({ ...prev, results: fetchedResults, loading: false }));
		} catch (error: any) {
			setAllResults([]);
			setSearch(prev => ({ ...prev, results: [], loading: false, error: error.message || 'An error occurred' }));
		} finally {
			setHasLoadedItineraries(true);
		}
	}, []);

	useEffect(() => {
		loadItineraries();
	}, [loadItineraries]);

	useEffect(() => {
		if (typeof window === 'undefined') return;
		if (hasHandledInitialStoryLink) return;
		if (!hasLoadedItineraries) return;

		const params = new URLSearchParams(window.location.search);
		const storyId = params.get('story');
		const place = params.get('place');

		if (!storyId && !place) {
			setHasHandledInitialStoryLink(true);
			return;
		}

		let matchedStory: TravelData | undefined;
		if (storyId) {
			matchedStory = allResults.find((item) => item.id === storyId);
		}

		if (!matchedStory && place) {
			const normalizedPlace = place.trim().toLowerCase();
			matchedStory = allResults.find((item) => item.place.trim().toLowerCase() === normalizedPlace);
		}

		if (matchedStory) {
			setSelectedResult(matchedStory);
		}

		setHasHandledInitialStoryLink(true);
	}, [allResults, hasHandledInitialStoryLink, hasLoadedItineraries]);

	useEffect(() => {
		if (typeof window === 'undefined') return;

		const url = new URL(window.location.href);
		if (selectedResult?.id) {
			url.searchParams.set('story', selectedResult.id);
			url.searchParams.delete('place');
		} else {
			url.searchParams.delete('story');
		}

		window.history.replaceState({}, '', url.toString());
	}, [selectedResult]);

	const handleGenerateItinerary = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		const place = geminiForm.place.trim();
		const country = geminiForm.country.trim();
		if (!place || !country) {
			setGenerationError('Place and country are required to generate an itinerary.');
			return;
		}

		setIsGenerating(true);
		setGenerationError(null);

		try {
			const res = await fetch('/api/generate-travel', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					place,
					country,
					interest: geminiForm.interest.trim(),
					duration: geminiForm.duration.trim(),
					budget: geminiForm.budget.trim(),
					travelStyle: geminiForm.travelStyle.trim(),
					travelers: geminiForm.travelers.trim(),
					type: 'itinerary',
				}),
			});

			const data = await res.json();
			if (!res.ok) {
				throw new Error(data?.message || data?.error || 'Failed to generate itinerary');
			}

			const generated = buildGeneratedTravelData(geminiForm, {
				content: data?.data?.content || data?.content || '',
				structured: data?.data?.structured || data?.structured || null,
			});

			const saveRes = await fetch('/api/travel', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					place: generated.place,
					country: generated.country,
					introduction: generated.introduction || generated.overview || '',
					itinerary: generated.itinerary,
					places: generated.places,
					restaurants: generated.restaurants,
					hotels: generated.hotels,
					budget: generated.budget,
					images: generated.images,
					videos: generated.videos,
					map: generated.map,
					overview: generated.overview,
					durationText: generated.durationText,
					budgetEstimate: generated.budgetEstimate,
					travelTips: generated.travelTips,
					localInsights: generated.localInsights,
					routeFlow: generated.routeFlow,
					routePoints: generated.routePoints,
					generatedBy: generated.generatedBy,
				}),
			});

			const savedData = await saveRes.json();
			if (!saveRes.ok) {
				throw new Error(savedData?.message || 'Failed to save generated itinerary');
			}

			const savedGenerated: TravelData = {
				...generated,
				...(savedData?.data || savedData || {}),
				id: savedData?.data?.id || savedData?.id || generated.id,
			};
			const sanitizedSavedGenerated = sanitizeTravelData(savedGenerated);

			setGeneratedItinerary(sanitizedSavedGenerated);
			setSelectedResult(sanitizedSavedGenerated);
			setAllResults(prev => [sanitizedSavedGenerated, ...prev.filter(item => item.id !== sanitizedSavedGenerated.id)]);
			resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		} catch (error: any) {
			setGenerationError(error?.message || 'Unable to generate itinerary. Please try again.');
		} finally {
			setIsGenerating(false);
		}
	}, [geminiForm]);

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

	const triggerSearchAndScroll = useCallback(() => {
		const q = search.query.trim();
		setSearch(prev => ({ ...prev, hasSearched: Boolean(q) }));
		resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}, [search.query]);

	return (
		<div className="min-h-screen bg-linear-to-br from-rose-200 to-gray-200 dark:from-gray-900 dark:via-rose-900/20 dark:to-pink-900/20">
			<Header1 />
			<CommunityHeader />

			<section ref={heroRef} className="relative pt-16 h-[75vh] min-h-130 flex items-center justify-center overflow-hidden">
				<div className="absolute inset-0">
					<img src="https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1600&q=80" alt="Travel destination" className="w-full h-full object-cover" />
					<div className="absolute inset-0 bg-linear-to-b from-black/60 via-black/40 to-black/30" />
				</div>
				<div className="absolute bottom-0 left-0 right-0 h-64 bg-linear-to-t from-rose-100/95 via-rose-100/55 to-transparent dark:from-background dark:via-background/55 pointer-events-none" />
				<div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
					<motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
						<span className="inline-block bg-rose-500/20 border border-rose-400/40 text-rose-300 text-xs font-semibold px-4 py-1.5 rounded-full mb-5">Curated Destination Plans</span>
						<h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-white mb-5 leading-tight">Travel <span className="bg-linear-to-r from-rose-400 to-orange-400 bg-clip-text text-transparent">Itineraries</span></h1>
						<p className="text-gray-300 text-lg md:text-xl mb-8 max-w-2xl mx-auto">Plan your next trip with destination highlights, recommended stays, food picks, and day-wise itinerary ideas.</p>
						<div className="flex flex-col sm:flex-row gap-3 max-w-3xl mx-auto">
							<div className="flex-1 flex items-center gap-2 bg-white/10 backdrop-blur border border-white/20 rounded-2xl px-4 py-3 transition-all focus-within:border-rose-400/80 focus-within:shadow-[0_0_0_2px_rgba(251,113,133,0.35)]">
								<Search className="w-5 h-5 text-white/60 shrink-0" />
								<input
									type="text"
									value={search.query}
									onChange={e => setSearch(prev => ({ ...prev, query: e.target.value }))}
									onKeyDown={(e) => {
										if (e.key === 'Enter') {
											e.preventDefault();
											triggerSearchAndScroll();
										}
									}}
									placeholder="Search destinations or countries..."
									className="flex-1 bg-transparent text-white placeholder:text-white/50 border-0 shadow-none outline-none! ring-0! focus:outline-none! focus:ring-0! focus-visible:outline-none! focus-visible:ring-0! focus-visible:border-0! text-sm"
								/>
							</div>
							<Button onClick={triggerSearchAndScroll} className="px-6 py-3 bg-linear-to-r from-rose-500 to-orange-500 text-white font-semibold rounded-2xl hover:opacity-90 transition-opacity text-sm shadow-lg shadow-rose-500/25">Search</Button>
						</div>
						<div className="mt-5 flex flex-wrap items-center justify-center gap-3">
							<Button
								variant="outline"
								className="rounded-2xl border-rose-300/80 bg-rose-50/90 text-rose-700 hover:bg-rose-100 dark:border-white/30 dark:bg-transparent dark:text-white dark:hover:bg-white/10"
								onClick={() => setSearch(prev => ({ ...prev, query: '', hasSearched: false }))}
							>
								Clear
							</Button>
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
							<span className="text-foreground font-semibold text-sm">Filter Itineraries:</span>
							<button
								onClick={() => setShowFilters(prev => !prev)}
								className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-muted border border-border rounded-xl hover:bg-accent transition-colors text-foreground"
							>
								<Search className="w-3.5 h-3.5" /> {showFilters ? 'Hide Filters' : 'Show Filters'}
							</button>
							{(filterDestination || filterDuration) && (
								<button
									onClick={() => { setFilterDestination(''); setFilterDuration(''); }}
									className="text-xs text-rose-600 hover:text-rose-500 dark:text-rose-300 dark:hover:text-rose-200 flex items-center gap-1"
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
									<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-muted/50 rounded-2xl p-4 border border-border">
										<div>
											<label className="block text-xs text-muted-foreground mb-1">Destination</label>
											<input
												type="text"
												placeholder="e.g. Goa or India"
												value={filterDestination}
												onChange={e => setFilterDestination(e.target.value)}
												className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-rose-500/30"
											/>
										</div>
										<div>
											<label className="block text-xs text-muted-foreground mb-1">Duration</label>
											<select
												value={filterDuration}
												onChange={e => setFilterDuration(e.target.value)}
												className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-rose-500/30"
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
						<Button
							onClick={() => setShowAiGenerator(true)}
							className="mt-6 rounded-2xl bg-linear-to-r from-rose-500 to-orange-500 px-6 py-3 font-semibold text-white hover:opacity-90"
						>
							Generate Your Itenary using AI
						</Button>
					</motion.div>
				)}

				<AnimatePresence>
					{!search.loading && search.hasSearched && search.results.length === 0 && !search.error && showAiGenerator && (
						<motion.section
							ref={generatorRef}
							initial={{ opacity: 0, y: 20, height: 0 }}
							animate={{ opacity: 1, y: 0, height: 'auto' }}
							exit={{ opacity: 0, y: 20, height: 0 }}
							className="mb-8 overflow-hidden"
						>
							<Card className="overflow-hidden border border-border bg-card/80 shadow-lg shadow-black/5">
								<div className="p-6 md:p-8 space-y-4 bg-linear-to-br from-rose-500/10 via-background to-orange-500/10">
									<div className="inline-flex items-center gap-2 rounded-full border border-rose-400/30 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-700 dark:text-rose-200">
										Abjee AI Itinerary Generator
									</div>
									<h2 className="text-2xl md:text-3xl font-black text-foreground">Build a trip plan from basic details</h2>
									<p className="text-sm md:text-base text-muted-foreground max-w-2xl">Fill in destination and preferences. AI will create an itinerary and save it to Firebase automatically.</p>
									<form onSubmit={handleGenerateItinerary} className="space-y-4 pt-2">
										<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
											<Input value={geminiForm.place} onChange={(e) => setGeminiForm(prev => ({ ...prev, place: e.target.value }))} placeholder="Destination place, e.g. Goa" className="rounded-xl" />
											<Input value={geminiForm.country} onChange={(e) => setGeminiForm(prev => ({ ...prev, country: e.target.value }))} placeholder="Country, e.g. India" className="rounded-xl" />
										</div>
										<Textarea value={geminiForm.interest} onChange={(e) => setGeminiForm(prev => ({ ...prev, interest: e.target.value }))} placeholder="Interests like beaches, family trip, honeymoon, food, adventure..." rows={3} className="rounded-xl resize-none" />
										<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
											<Input value={geminiForm.duration} onChange={(e) => setGeminiForm(prev => ({ ...prev, duration: e.target.value }))} placeholder="Duration, e.g. 5 days" className="rounded-xl" />
											<Input value={geminiForm.budget} onChange={(e) => setGeminiForm(prev => ({ ...prev, budget: e.target.value }))} placeholder="Budget, e.g. ₹25,000" className="rounded-xl" />
											<Input value={geminiForm.travelers} onChange={(e) => setGeminiForm(prev => ({ ...prev, travelers: e.target.value }))} placeholder="Travelers, e.g. 2 adults" className="rounded-xl" />
										</div>
										<Input value={geminiForm.travelStyle} onChange={(e) => setGeminiForm(prev => ({ ...prev, travelStyle: e.target.value }))} placeholder="Travel style, e.g. relaxed, luxury, backpacking" className="rounded-xl" />
										{generationError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{generationError}</div>}
										<div className="flex flex-wrap items-center gap-3">
											<Button type="submit" disabled={isGenerating} className="rounded-xl bg-linear-to-r from-rose-500 to-orange-500 px-5 py-2.5 font-semibold text-white hover:opacity-90">
												{isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sailboat className="mr-2 h-4 w-4" />}
												{isGenerating ? 'Generating...' : 'Generate Itinerary'}
											</Button>
											<Button type="button" variant="outline" className="rounded-xl" onClick={() => setGeminiForm(DEFAULT_GEMINI_FORM)}>Clear</Button>
										</div>
									</form>
								</div>
							</Card>
						</motion.section>
					)}
				</AnimatePresence>

				{!search.loading && search.results.length > 0 && (
					<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
						<div className="flex items-center justify-between">
							<div className="text-sm text-slate-600 dark:text-slate-400">Showing <span className="font-semibold text-slate-900 dark:text-white">{search.results.length}</span> stories</div>
							<Badge className="text-sm px-3 py-1.5 bg-emerald-600 hover:bg-emerald-600 text-white rounded-full">Traveler Picks</Badge>
						</div>
						<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
							{search.results.map((result, idx) => (
								<motion.div key={result.id} className="group" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.08 }} whileHover={{ y: -4 }} onClick={() => setSelectedResult(result)}>
									<Card className="group bg-card rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 flex flex-col border border-border cursor-pointer">
										<div className="relative overflow-hidden h-48 bg-muted">
											<img src={result.images[0] || 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1200&q=80'} alt={result.place} className="w-full h-full object-cover" />
											<div className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent" />
											<span className="absolute top-3 right-3 text-xs font-semibold px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-400/30">{result.generatedBy === 'gemini' ? 'AI' : getCardBadge(idx)}</span>
											<div className="absolute bottom-4 left-4 right-4">
												<div className="flex items-center gap-2 text-white text-sm"><MapPin className="w-4 h-4" /><span>{result.place}, {result.country}</span></div>
											</div>
										</div>
										<div className="flex flex-col flex-1 p-4 gap-2">
											<div className="space-y-1">
												<h3 className="font-bold text-foreground text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors">{result.place} Travel Guide</h3>
												<p className="text-muted-foreground text-xs line-clamp-2">{getPreviewText(result)}</p>
											</div>
											<div className="flex flex-wrap gap-2 mt-1">
												<span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="w-3 h-3" /> {getDurationText(result)}</span>
												<span className="flex items-center gap-1 text-xs text-muted-foreground"><DollarSign className="w-3 h-3" /> {getBudgetDisplayText(result)}</span>
											</div>
											<div className="flex items-center gap-2 mt-auto pt-3 border-t border-border/40">
												<div className="w-6 h-6 rounded-full bg-linear-to-br from-rose-500 to-orange-400 text-white text-xs font-bold flex items-center justify-center">A</div>
												<span className="text-xs text-muted-foreground flex-1 truncate">ABjee Travel</span>
												<span className="flex items-center gap-1 text-xs text-muted-foreground"><Heart className="w-3.5 h-3.5" /> {Math.max(1, result.places.length - 1)}</span>
												<span className="flex items-center gap-1 text-xs text-muted-foreground"><MessageCircle className="w-3.5 h-3.5" /> {Math.max(1, result.hotels.length)}</span>
											</div>
											<Button className="mt-2 w-full py-2 rounded-xl text-xs font-semibold bg-linear-to-r from-rose-500 to-orange-500 text-white hover:opacity-90 transition-opacity" onClick={e => { e.stopPropagation(); setSelectedResult(result); }}>Read More</Button>
										</div>
									</Card>
								</motion.div>
							))}
						</div>
					</motion.div>
				)}
			</main>

			<AnimatePresence>
				{selectedResult && (
					<TravelDetailModal
						result={selectedResult}
						shareStoryId={selectedResult.id}
						onClose={() => setSelectedResult(null)}
					/>
				)}
			</AnimatePresence>
		</div>
	);
}
