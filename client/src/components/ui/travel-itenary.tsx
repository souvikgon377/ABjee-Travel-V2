'use client';

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Trash2, Plus, X, Save, AlertCircle, CheckCircle, Edit2, Loader, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { modernConfirm } from '@/lib/modernDialog';
import { adminAPI } from '@/lib/api';
import { getAdminCollectionCache, setAdminCollectionCache } from '@/lib/adminCollectionCache';
import { auth } from '@/lib/firebase';

interface FormState {
	id?: string;
	place: string;
	country: string;
	introduction: string;
	itinerary: string;
	routePoints: Array<{ name: string; lat: string; lng: string }>;
	places: string[];
	restaurants: string[];
	hotels: string[];
	budget: string;
	imageFiles: File[];
	videoFiles: File[];
	mapFile: File | string | null;
	imagePreviews: string[];
	videoPreviews: string[];
}

interface UploadState {
	uploading: boolean;
	progress: number;
	error: string | null;
	success: string | null;
}

interface TravelItem {
	id: string;
	place: string;
	country: string;
	introduction?: string;
	itinerary?: string;
	routePoints?: Array<{ name: string; lat?: number; lng?: number }>;
	restaurants?: string[];
	hotels?: string[];
	budget: string;
	createdAt: string;
	updatedAt: string;
	images?: string[];
	coverImage?: string;
	imageUrl?: string;
	image?: string;
	photos?: Array<{ url?: string }>;
	videos?: string[];
	map?: string | null;
	places?: string[];
}

interface CsvImportSummary {
	totalRows: number;
	importedRows: number;
	failedRows: number;
	errors: string[];
}

interface MigrationProgress {
	jobId: string;
	status: 'queued' | 'running' | 'completed' | 'failed';
	total: number;
	processed: number;
	updated: number;
	skipped: number;
	startedAt: string;
	finishedAt?: string;
	error?: string;
}

const CSV_TEMPLATE_TEXT = `Place of Travel,Country of Travel,Introduction,Travel Itinerary,Average Budget,Top Places to Visit,Top Restaurants,Top Hotels and Resorts
Goa,India,"A coastal escape with beaches, old churches, and vibrant nightlife.","Day 1: Arrival and beach relaxation; Day 2: North Goa beaches and nightlife; Day 3: South Goa and heritage churches","$300-600 per person","Baga Beach; Fort Aguada; Basilica of Bom Jesus","Thalassa; Fisherman's Wharf","Taj Exotica; W Goa"`;
const TRAVEL_ITINERARY_CACHE_KEY = 'travel-itinerary-admin-list';
const TRAVEL_ITINERARY_CACHE_TTL_MS = 5 * 60 * 1000;
const TRAVEL_ITINERARY_PAGE_SIZE = 30;

interface TravelListFilters {
	search: string;
	country: string;
}

const normalizeCoordinateInput = (value: string) => value.replace(/\s+/g, '').replace(/,/g, '.');

const isValidCoordinate = (value: string, axis: 'lat' | 'lng') => {
	if (!value.trim()) return true;
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) return false;
	if (axis === 'lat') return numeric >= -90 && numeric <= 90;
	return numeric >= -180 && numeric <= 180;
};

const getRoutePointErrorMessage = (point: { name: string; lat: string; lng: string }) => {
	const name = point.name.trim();
	const hasLat = point.lat.trim().length > 0;
	const hasLng = point.lng.trim().length > 0;

	if (!name && (hasLat || hasLng)) {
		return 'Add a location name for this pin.';
	}

	if ((hasLat && !hasLng) || (!hasLat && hasLng)) {
		return 'Latitude and longitude must both be filled, or both left empty.';
	}

	if (!isValidCoordinate(point.lat, 'lat')) {
		return 'Latitude must be a number between -90 and 90.';
	}

	if (!isValidCoordinate(point.lng, 'lng')) {
		return 'Longitude must be a number between -180 and 180.';
	}

	return '';
};

const getTravelItemImage = (item: TravelItem): string => {
	const candidates = [
		...(Array.isArray(item.images) ? item.images : []),
		item.coverImage,
		item.imageUrl,
		item.image,
		...(Array.isArray(item.photos) ? item.photos.map((photo) => photo?.url || '') : []),
	];

	for (const candidate of candidates) {
		if (typeof candidate === 'string' && candidate.trim()) {
			return candidate.trim();
		}
	}

	return '';
};

export default function AdminTravelItenary() {
	const [existingItineraries, setExistingItineraries] = useState<TravelItem[]>([]);
	const [itinerarySearchInput, setItinerarySearchInput] = useState('');
	const [countryFilterInput, setCountryFilterInput] = useState('');
	const [appliedFilters, setAppliedFilters] = useState<TravelListFilters>({
		search: '',
		country: '',
	});
	const [loadingItineraries, setLoadingItineraries] = useState(true);
	const [loadingMoreItineraries, setLoadingMoreItineraries] = useState(false);
	const [hasMoreItineraries, setHasMoreItineraries] = useState(false);
	const [itineraryPage, setItineraryPage] = useState(1);
	const [isEditing, setIsEditing] = useState(false);
	const [form, setForm] = useState<FormState>({
		place: '',
		country: '',
		introduction: '',
		itinerary: '',
		routePoints: [{ name: '', lat: '', lng: '' }],
		places: [''],
		restaurants: [''],
		hotels: [''],
		budget: '',
		imageFiles: [],
		videoFiles: [],
		mapFile: null,
		imagePreviews: [],
		videoPreviews: [],
	});

	const [uploadState, setUploadState] = useState<UploadState>({
		uploading: false,
		progress: 0,
		error: null,
		success: null,
	});
	const [csvFile, setCsvFile] = useState<File | null>(null);
	const [csvImporting, setCsvImporting] = useState(false);
	const [csvImportProgress, setCsvImportProgress] = useState(0);
	const [csvImportSummary, setCsvImportSummary] = useState<CsvImportSummary | null>(null);
	const [csvImportError, setCsvImportError] = useState<string | null>(null);
	const [copiedCsvTemplate, setCopiedCsvTemplate] = useState(false);
	const [migrationJobId, setMigrationJobId] = useState<string | null>(null);
	const [migrationProgress, setMigrationProgress] = useState<MigrationProgress | null>(null);
	const [migrationStarting, setMigrationStarting] = useState(false);
	const [migrationNotice, setMigrationNotice] = useState<string | null>(null);
	const [isCompressingImages, setIsCompressingImages] = useState(false);
	const [isEditorOpen, setIsEditorOpen] = useState(false);
	const validPinCount = form.routePoints.filter((point) => point.name.trim() && !getRoutePointErrorMessage(point)).length;
	const filteredItineraries = existingItineraries;

	const imageInputRef = useRef<HTMLInputElement>(null);
	const videoInputRef = useRef<HTMLInputElement>(null);
	const mapInputRef = useRef<HTMLInputElement>(null);
	const csvInputRef = useRef<HTMLInputElement>(null);

	// Clear success/error messages after 5 seconds
	useEffect(() => {
		if (uploadState.success || uploadState.error) {
			const timer = setTimeout(() => {
				setUploadState(prev => ({
					...prev,
					success: null,
					error: null,
				}));
			}, 5000);
			return () => clearTimeout(timer);
		}
	}, [uploadState.success, uploadState.error]);

	// Cleanup preview URLs on unmount
	useEffect(() => {
		return () => {
			form.imagePreviews.forEach(url => {
				if (url.startsWith('blob:')) URL.revokeObjectURL(url);
			});
			form.videoPreviews.forEach(url => {
				if (url.startsWith('blob:')) URL.revokeObjectURL(url);
			});
		};
	}, [form.imagePreviews, form.videoPreviews]);

	const buildTravelListCacheKey = useCallback((filters: TravelListFilters) => {
		return `${TRAVEL_ITINERARY_CACHE_KEY}:${filters.search.toLowerCase()}:${filters.country.toLowerCase()}`;
	}, []);

	// Fetch existing itineraries from API
	const fetchItineraries = async (options?: {
		reset?: boolean;
		forceRefresh?: boolean;
		filters?: TravelListFilters;
	}) => {
		const reset = options?.reset ?? true;
		const forceRefresh = options?.forceRefresh ?? false;
		const selectedFilters = options?.filters ?? appliedFilters;
		const nextPage = reset ? 1 : (itineraryPage + 1);

		try {
			if (reset) setLoadingItineraries(true);
			else setLoadingMoreItineraries(true);

			if (reset && !forceRefresh) {
				const cachedItineraries = getAdminCollectionCache<{
					items: TravelItem[];
					hasMore: boolean;
				}>(buildTravelListCacheKey(selectedFilters), {
					userId: auth.currentUser?.uid,
				});
				if (cachedItineraries) {
					setExistingItineraries(cachedItineraries.items);
					setHasMoreItineraries(cachedItineraries.hasMore);
					setItineraryPage(1);
					return;
				}
			}

			const response = await adminAPI.getTravelItineraryList({
				limit: TRAVEL_ITINERARY_PAGE_SIZE,
				page: nextPage,
				search: selectedFilters.search,
				country: selectedFilters.country,
				forceRefresh,
			});
			const data = response.data?.data ?? response.data ?? {};
			const results = data.rows || [];
			const normalizedResults = [...results].sort((a: TravelItem, b: TravelItem) => {
				return new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime();
			});

			setExistingItineraries((prev) => {
				if (reset) return normalizedResults;
				const byId = new Map<string, TravelItem>();
				prev.forEach((item) => byId.set(item.id, item));
				normalizedResults.forEach((item) => byId.set(item.id, item));
				return Array.from(byId.values());
			});

			const hasMore = Boolean(data.hasMore);
			setHasMoreItineraries(hasMore);
			setItineraryPage(nextPage);

			if (reset) {
				setAdminCollectionCache(
					buildTravelListCacheKey(selectedFilters),
					{ items: normalizedResults, hasMore },
					TRAVEL_ITINERARY_CACHE_TTL_MS,
					{
						userId: auth.currentUser?.uid,
					},
				);
			}
		} catch (error: any) {
			setUploadState(prev => ({
				...prev,
				error: error.message || 'Failed to load itineraries',
			}));
		} finally {
			if (reset) setLoadingItineraries(false);
			else setLoadingMoreItineraries(false);
		}
	};

	// Fetch existing itineraries on mount
	useEffect(() => {
		void fetchItineraries({
			reset: true,
			filters: {
				search: '',
				country: '',
			},
		});
	}, []);

	// Load itinerary for editing
	const loadForEditing = useCallback((itinerary: TravelItem) => {
		setForm({
			id: itinerary.id,
			place: itinerary.place,
			country: itinerary.country,
			introduction: itinerary.introduction || '',
			itinerary: itinerary.itinerary || '',
			routePoints: toRoutePointInputs(itinerary.routePoints),
			places: itinerary.places || [''],
			restaurants: itinerary.restaurants || [''],
			hotels: itinerary.hotels || [''],
			budget: itinerary.budget || '',
			imageFiles: [],
			videoFiles: [],
			mapFile: itinerary.map || null,
			imagePreviews: itinerary.images?.length ? itinerary.images : (getTravelItemImage(itinerary) ? [getTravelItemImage(itinerary)] : []),
			videoPreviews: itinerary.videos || [],
		});
		setIsEditing(true);
		setIsEditorOpen(true);
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}, []);

	// Delete itinerary
	const deleteItinerary = async (id: string) => {
		const confirmed = await modernConfirm('Are you sure you want to delete this itinerary? This action cannot be undone.', {
			title: 'Delete Itinerary',
			confirmText: 'Delete',
			cancelText: 'Cancel',
			destructive: true,
		});

		if (!confirmed) {
			return;
		}

		try {
			setUploadState(prev => ({
				...prev,
				uploading: true,
				error: null,
				success: null,
			}));

			const res = await fetch(`/api/travel/${id}`, { method: 'DELETE' });
			if (!res.ok) {
				const errorBody = await res.json().catch(() => ({} as { message?: string }));
				throw new Error(errorBody.message || 'Failed to delete itinerary');
			}

			setExistingItineraries((prev) => {
				const nextItineraries = prev.filter(item => item.id !== id);
				setAdminCollectionCache(
					buildTravelListCacheKey(appliedFilters),
					{ items: nextItineraries, hasMore: hasMoreItineraries },
					TRAVEL_ITINERARY_CACHE_TTL_MS,
					{
						userId: auth.currentUser?.uid,
					},
				);
				return nextItineraries;
			});
			setUploadState(prev => ({
				...prev,
				uploading: false,
				success: 'Itinerary deleted successfully!',
			}));
		} catch (error: any) {
			setUploadState(prev => ({
				...prev,
				uploading: false,
				error: error.message || 'Failed to delete itinerary',
			}));
		}
	};

	const deleteAllItineraries = async () => {
		if (existingItineraries.length === 0) {
			setUploadState((prev) => ({
				...prev,
				error: 'No itineraries to delete.',
			}));
			return;
		}

		const confirmed = await modernConfirm(
			`Delete all ${existingItineraries.length} itineraries? This action cannot be undone.`,
			{
				title: 'Delete All Itineraries',
				confirmText: 'Delete All',
				cancelText: 'Cancel',
				destructive: true,
			}
		);

		if (!confirmed) {
			return;
		}

		try {
			setUploadState((prev) => ({
				...prev,
				uploading: true,
				error: null,
				success: null,
			}));

			const res = await fetch('/api/travel?all=true', { method: 'DELETE' });
			if (!res.ok) {
				const errorBody = await res.json().catch(() => ({} as { message?: string }));
				throw new Error(errorBody.message || 'Failed to delete all itineraries');
			}

			setExistingItineraries([]);
			setAdminCollectionCache(
				buildTravelListCacheKey(appliedFilters),
				{ items: [], hasMore: false },
				TRAVEL_ITINERARY_CACHE_TTL_MS,
				{
					userId: auth.currentUser?.uid,
				},
			);
			setUploadState((prev) => ({
				...prev,
				uploading: false,
				success: 'All itineraries deleted successfully!',
			}));
		} catch (error: any) {
			setUploadState((prev) => ({
				...prev,
				uploading: false,
				error: error.message || 'Failed to delete all itineraries',
			}));
		}
	};

	// Handle text input changes
	const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
		const { name, value } = e.target;
		setForm(prev => ({
			...prev,
			[name]: value,
		}));
	}, []);

	// Handle list item changes
	const handleListChange = useCallback((listName: keyof Pick<FormState, 'places' | 'restaurants' | 'hotels'>, index: number, value: string) => {
		setForm(prev => ({
			...prev,
			[listName]: prev[listName].map((item, i) => (i === index ? value : item)),
		}));
	}, []);

	// Add new list item
	const handleAddListItem = useCallback((listName: keyof Pick<FormState, 'places' | 'restaurants' | 'hotels'>) => {
		setForm(prev => ({
			...prev,
			[listName]: [...prev[listName], ''],
		}));
	}, []);

	// Remove list item
	const handleRemoveListItem = useCallback((listName: keyof Pick<FormState, 'places' | 'restaurants' | 'hotels'>, index: number) => {
		setForm(prev => ({
			...prev,
			[listName]: prev[listName].filter((_, i) => i !== index),
		}));
	}, []);

	const handleRoutePointChange = useCallback((index: number, field: 'name' | 'lat' | 'lng', value: string) => {
		const normalizedValue = field === 'lat' || field === 'lng' ? normalizeCoordinateInput(value) : value;
		setForm((prev) => ({
			...prev,
			routePoints: prev.routePoints.map((point, i) => (i === index ? { ...point, [field]: normalizedValue } : point)),
		}));
	}, []);

	const handleAddRoutePoint = useCallback(() => {
		setForm((prev) => ({
			...prev,
			routePoints: [...prev.routePoints, { name: '', lat: '', lng: '' }],
		}));
	}, []);

	const handleRemoveRoutePoint = useCallback((index: number) => {
		setForm((prev) => ({
			...prev,
			routePoints: prev.routePoints.length > 1
				? prev.routePoints.filter((_, i) => i !== index)
				: [{ name: '', lat: '', lng: '' }],
		}));
	}, []);

	// Handle image uploads
	const compressImage = useCallback((file: File, maxDim = 1920, quality = 0.85): Promise<File> =>
		new Promise((resolve) => {
			const TARGET_BYTES = 9.5 * 1024 * 1024;
			const url = URL.createObjectURL(file);
			const image = new Image();

			const canvasToBlob = (canvas: HTMLCanvasElement, q: number) =>
				new Promise<Blob | null>((blobResolve) => {
					canvas.toBlob((blob) => blobResolve(blob), 'image/webp', q);
				});

			image.onload = async () => {
				URL.revokeObjectURL(url);
				let width = image.width;
				let height = image.height;
				if (width > maxDim || height > maxDim) {
					if (width >= height) {
						height = Math.round((height / width) * maxDim);
						width = maxDim;
					} else {
						width = Math.round((width / height) * maxDim);
						height = maxDim;
					}
				}

				let bestBlob: Blob | null = null;
				let currentWidth = width;
				let currentHeight = height;
				let attempt = 0;

				while (attempt < 6) {
					const canvas = document.createElement('canvas');
					canvas.width = currentWidth;
					canvas.height = currentHeight;
					const context = canvas.getContext('2d');
					if (!context) {
						resolve(file);
						return;
					}
					context.drawImage(image, 0, 0, currentWidth, currentHeight);

					for (const q of [quality, 0.78, 0.68, 0.58, 0.5]) {
						const blob = await canvasToBlob(canvas, q);
						if (!blob) continue;
						if (!bestBlob || blob.size < bestBlob.size) bestBlob = blob;
						if (blob.size <= TARGET_BYTES) {
							const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), { type: 'image/webp' });
							resolve(compressedFile.size < file.size ? compressedFile : file);
							return;
						}
					}

					currentWidth = Math.max(720, Math.round(currentWidth * 0.85));
					currentHeight = Math.max(720, Math.round(currentHeight * 0.85));
					attempt += 1;
				}

				if (bestBlob) {
					const compressedFile = new File([bestBlob], file.name.replace(/\.[^.]+$/, '.webp'), { type: 'image/webp' });
					resolve(compressedFile.size < file.size ? compressedFile : file);
					return;
				}

				resolve(file);
			};

			image.onerror = () => {
				URL.revokeObjectURL(url);
				resolve(file);
			};
			image.src = url;
		}), []);

	const handleImageChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(e.target.files || []);
		const validFiles = files.filter(file => file.type.startsWith('image/'));

		if (imageInputRef.current) {
			imageInputRef.current.value = '';
		}

		if (!validFiles.length) return;

		setIsCompressingImages(true);
		try {
			const compressedFiles = await Promise.all(validFiles.map(file => compressImage(file)));
			const newPreviews = compressedFiles.map(file => URL.createObjectURL(file));

			setForm(prev => ({
				...prev,
				imageFiles: [...prev.imageFiles, ...compressedFiles],
				imagePreviews: [...prev.imagePreviews, ...newPreviews],
			}));
		} finally {
			setIsCompressingImages(false);
		}
	}, [compressImage]);

	// Handle video uploads
	const handleVideoChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(e.target.files || []);
		const validFiles = files.filter(f => f.type.startsWith('video/'));
		
		const newPreviews = validFiles.map(f => URL.createObjectURL(f));
		
		setForm(prev => ({
			...prev,
			videoFiles: [...prev.videoFiles, ...validFiles],
			videoPreviews: [...prev.videoPreviews, ...newPreviews],
		}));

		if (videoInputRef.current) {
			videoInputRef.current.value = '';
		}
	}, []);

	// Handle map upload
	const handleMapChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file && (file.type.startsWith('image/') || file.type === 'application/pdf')) {
			setForm(prev => ({
				...prev,
				mapFile: file,
			}));
		}

		if (mapInputRef.current) {
			mapInputRef.current.value = '';
		}
	}, []);

	// Remove image
	const handleRemoveImage = useCallback((index: number) => {
		setForm(prev => {
			const newPreviews = [...prev.imagePreviews];
			const newFiles = [...prev.imageFiles];
			URL.revokeObjectURL(newPreviews[index]);
			newPreviews.splice(index, 1);
			newFiles.splice(index, 1);
			return {
				...prev,
				imagePreviews: newPreviews,
				imageFiles: newFiles,
			};
		});
	}, []);

	// Remove video
	const handleRemoveVideo = useCallback((index: number) => {
		setForm(prev => {
			const newPreviews = [...prev.videoPreviews];
			const newFiles = [...prev.videoFiles];
			URL.revokeObjectURL(newPreviews[index]);
			newPreviews.splice(index, 1);
			newFiles.splice(index, 1);
			return {
				...prev,
				videoPreviews: newPreviews,
				videoFiles: newFiles,
			};
		});
	}, []);

	// Validate form
	const validateForm = (): string | null => {
		if (!form.place.trim()) return 'Place is required';
		if (!form.country.trim()) return 'Country is required';
		if (!form.budget.trim()) return 'Budget is required';
		if (form.places.filter(p => p.trim()).length === 0) return 'At least one place is required';
		if (form.restaurants.filter(r => r.trim()).length === 0) return 'At least one restaurant is required';
		if (form.hotels.filter(h => h.trim()).length === 0) return 'At least one hotel is required';
		if (form.imagePreviews.length === 0) return 'At least one image is required';
		return null;
	};

	// Submit form
	const handleSubmit = useCallback(async () => {
		const validationError = validateForm();
		if (validationError) {
			setUploadState(prev => ({
				...prev,
				error: validationError,
			}));
			return;
		}

		setUploadState(prev => ({
			...prev,
			uploading: true,
			error: null,
			success: null,
		}));

		try {
			// Keep existing remote images, upload only newly added files.
			const existingRemoteImages: string[] = [...form.imagePreviews.filter(p => p.startsWith('http'))];
			const uploadedImages: string[] = [];
			for (let i = 0; i < form.imageFiles.length; i++) {
				const formData = new FormData();
				formData.append('file', form.imageFiles[i]);
				formData.append('folder', 'travel-content/images');

				const res = await fetch('/api/upload', {
					method: 'POST',
					body: formData,
				});

				const data = await res.json().catch(() => ({} as any));
				if (!res.ok) {
					throw new Error(data?.message || 'Image upload failed');
				}
				uploadedImages.push(data.data.url);
				setUploadState(prev => ({
					...prev,
					progress: ((i + 1) / form.imageFiles.length) * 33,
				}));
			}

			// Keep existing remote videos, upload only newly added files.
			const uploadedVideos: string[] = [...form.videoPreviews.filter(p => p.startsWith('http'))];
			for (let i = 0; i < form.videoFiles.length; i++) {
				const formData = new FormData();
				formData.append('file', form.videoFiles[i]);
				formData.append('folder', 'travel-content/videos');

				const res = await fetch('/api/upload', {
					method: 'POST',
					body: formData,
				});

				const data = await res.json().catch(() => ({} as any));
				if (!res.ok) {
					throw new Error(data?.message || 'Video upload failed');
				}
				uploadedVideos.push(data.data.url);
				setUploadState(prev => ({
					...prev,
					progress: 33 + ((i + 1) / form.videoFiles.length) * 33,
				}));
			}

			// Upload map
			let uploadedMap: string | null = null;
			if (form.mapFile && form.mapFile instanceof File) {
				const formData = new FormData();
				formData.append('file', form.mapFile);
				formData.append('folder', 'travel-content/maps');

				const res = await fetch('/api/upload', {
					method: 'POST',
					body: formData,
				});

				const data = await res.json().catch(() => ({} as any));
				if (!res.ok) {
					throw new Error(data?.message || 'Map upload failed');
				}
				uploadedMap = data.data.url;
			} else if (typeof form.mapFile === 'string') {
				uploadedMap = form.mapFile;
			}
			setUploadState(prev => ({
				...prev,
				progress: 66,
			}));

			// Prepare travel data
			const travelData = {
				place: form.place.trim(),
				country: form.country.trim(),
				introduction: form.introduction.trim(),
				itinerary: form.itinerary.trim(),
				routePoints: buildRoutePointsPayload(form.routePoints),
				places: form.places.filter(p => p.trim()),
				restaurants: form.restaurants.filter(r => r.trim()),
				hotels: form.hotels.filter(h => h.trim()),
				budget: form.budget.trim(),
				images: uploadedImages.length > 0 ? [...uploadedImages, ...existingRemoteImages] : existingRemoteImages,
				coverImage: uploadedImages[0] || existingRemoteImages[0] || '',
				videos: uploadedVideos,
				map: uploadedMap || form.mapFile || null,
			};

			// Use PUT for update or POST for create
			const method = form.id ? 'PUT' : 'POST';
			const url = form.id ? `/api/travel/${form.id}` : '/api/travel';

			const res = await fetch(url, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(travelData),
			});

			if (!res.ok) throw new Error((await res.json()).message || `Failed to ${form.id ? 'update' : 'save'} travel data`);

			setUploadState(prev => ({
				...prev,
				progress: 100,
				success: `Travel content ${form.id ? 'updated' : 'added'} successfully!`,
			}));

			// Refresh itineraries list
			await fetchItineraries({
				reset: true,
				forceRefresh: true,
				filters: appliedFilters,
			});

			// Reset form
			setTimeout(() => {
				setForm({
					place: '',
					country: '',
					introduction: '',
					itinerary: '',
					routePoints: [{ name: '', lat: '', lng: '' }],
					places: [''],
					restaurants: [''],
					hotels: [''],
					budget: '',
					imageFiles: [],
					videoFiles: [],
					mapFile: null,
					imagePreviews: [],
					videoPreviews: [],
				});
				setIsEditing(false);
				setUploadState(prev => ({
					...prev,
					uploading: false,
					progress: 0,
				}));
			}, 1500);
		} catch (error: any) {
			setUploadState(prev => ({
				...prev,
				uploading: false,
				error: error.message || 'An error occurred',
			}));
		}
	}, [form]);

	// Reset form
	const handleReset = useCallback(() => {
		form.imagePreviews.forEach(url => {
			if (url.startsWith('blob:')) URL.revokeObjectURL(url);
		});
		form.videoPreviews.forEach(url => {
			if (url.startsWith('blob:')) URL.revokeObjectURL(url);
		});
		setForm({
			place: '',
			country: '',
			introduction: '',
			itinerary: '',
			routePoints: [{ name: '', lat: '', lng: '' }],
			places: [''],
			restaurants: [''],
			hotels: [''],
			budget: '',
			imageFiles: [],
			videoFiles: [],
			mapFile: null,
			imagePreviews: [],
			videoPreviews: [],
		});
		setIsEditing(false);
	}, [form]);

	const openCreateEditor = useCallback(() => {
		handleReset();
		setIsEditorOpen(true);
	}, [handleReset]);

	const closeEditor = useCallback(() => {
		if (uploadState.uploading) return;
		handleReset();
		setIsEditorOpen(false);
	}, [handleReset, uploadState.uploading]);

	useEffect(() => {
		if (!isEditorOpen) return;

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				closeEditor();
			}
		};

		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [isEditorOpen, closeEditor]);

	const getMapLabel = (mapValue: File | string | null) => {
		if (!mapValue) return '';
		if (mapValue instanceof File) return mapValue.name;
		const segments = mapValue.split('/');
		return segments[segments.length - 1] || mapValue;
	};

	const handleApplyListFilters = useCallback(() => {
		const nextFilters: TravelListFilters = {
			search: itinerarySearchInput.trim(),
			country: countryFilterInput.trim(),
		};
		setAppliedFilters(nextFilters);
		setItineraryPage(1);
		void fetchItineraries({ reset: true, forceRefresh: true, filters: nextFilters });
	}, [countryFilterInput, fetchItineraries, itinerarySearchInput]);

	const handleResetListFilters = useCallback(() => {
		setItinerarySearchInput('');
		setCountryFilterInput('');
		const resetFilters: TravelListFilters = { search: '', country: '' };
		setAppliedFilters(resetFilters);
		setItineraryPage(1);
		void fetchItineraries({ reset: true, forceRefresh: true, filters: resetFilters });
	}, [fetchItineraries]);

	const handleLoadMoreItineraries = useCallback(() => {
		if (!hasMoreItineraries || loadingMoreItineraries) return;
		void fetchItineraries({
			reset: false,
			forceRefresh: true,
			filters: appliedFilters,
		});
	}, [appliedFilters, fetchItineraries, hasMoreItineraries, itineraryPage, loadingMoreItineraries]);

	const parseCsvTable = (text: string, delimiter: ',' | ';' | '\t' | '|'): string[][] => {
		const rows: string[][] = [];
		let currentRow: string[] = [];
		let currentCell = '';
		let inQuotes = false;

		for (let i = 0; i < text.length; i += 1) {
			const char = text[i];
			const nextChar = text[i + 1];

			if (char === '"') {
				if (inQuotes && nextChar === '"') {
					currentCell += '"';
					i += 1;
					continue;
				}

				inQuotes = !inQuotes;
				continue;
			}

			if (char === delimiter && !inQuotes) {
				currentRow.push(currentCell);
				currentCell = '';
				continue;
			}

			if ((char === '\n' || char === '\r') && !inQuotes) {
				if (char === '\r' && nextChar === '\n') {
					i += 1;
				}

				currentRow.push(currentCell);
				if (currentRow.some((cell) => cell.trim().length > 0)) {
					rows.push(currentRow);
				}
				currentRow = [];
				currentCell = '';
				continue;
			}

			currentCell += char;
		}

		currentRow.push(currentCell);
		if (currentRow.some((cell) => cell.trim().length > 0)) {
			rows.push(currentRow);
		}

		return rows;
	};

	const normalizeCsvHeader = (value: string) =>
		value
			.replace(/^\uFEFF/, '')
			.replace(/^"|"$/g, '')
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '');

	const CSV_HEADER_ALIASES: Record<string, string> = {
		placeoftravel: 'place',
		placeof: 'place',
		place: 'place',
		countryoftravel: 'country',
		countryof: 'country',
		country: 'country',
		travelitinerary: 'itinerary',
		travelitin: 'itinerary',
		itinerary: 'itinerary',
		averagebudget: 'budget',
		averageb: 'budget',
		avgbudget: 'budget',
		avgb: 'budget',
		estimatedbudget: 'budget',
		budget: 'budget',
		topplacestovisit: 'places',
		topplaces: 'places',
		places: 'places',
		toprestaurants: 'restaurants',
		restaurants: 'restaurants',
		tophotelsandresorts: 'hotels',
		tophotels: 'hotels',
		hotelsandresorts: 'hotels',
		hotels: 'hotels',
		duration: 'durationtext',
		durationtext: 'durationtext',
		budgetestimate: 'budgetestimate',
		traveltips: 'traveltips',
		localinsights: 'localinsights',
		routeflow: 'routeflow',
		routepoints: 'routepoints',
		images: 'images',
		videos: 'videos',
		map: 'map',
		overview: 'overview',
		generatedby: 'generatedby',
		introduction: 'introduction',
		intro: 'introduction',
	};

	const normalizeToCanonicalHeader = (value: string) => {
		const normalized = normalizeCsvHeader(value);
		if (CSV_HEADER_ALIASES[normalized]) {
			return CSV_HEADER_ALIASES[normalized];
		}

		if (normalized.includes('place') && normalized.includes('travel')) return 'place';
		if (normalized.includes('country')) return 'country';
		if (normalized.includes('itinerary') || normalized.includes('travelitin')) return 'itinerary';
		if (normalized.includes('intro')) return 'introduction';
		if (normalized.includes('budget') || normalized.startsWith('averageb') || normalized.includes('avgb')) return 'budget';
		if (normalized.includes('restaurant')) return 'restaurants';
		if (normalized.includes('hotel') || normalized.includes('resort')) return 'hotels';
		if (normalized.includes('places') || normalized.includes('placestovisit')) return 'places';

		return normalized;
	};

	const DEFAULT_CSV_HEADERS = [
		'place',
		'country',
		'introduction',
		'itinerary',
		'budget',
		'places',
		'restaurants',
		'hotels',
		'images',
		'videos',
		'map',
		'overview',
		'durationtext',
		'budgetestimate',
		'traveltips',
		'localinsights',
		'routeflow',
		'routepoints',
		'generatedby',
	] as const;

	const countDelimiterOutsideQuotes = (line: string, delimiter: ',' | ';' | '\t' | '|') => {
		let count = 0;
		let inQuotes = false;

		for (let i = 0; i < line.length; i += 1) {
			const char = line[i];
			const nextChar = line[i + 1];

			if (char === '"') {
				if (inQuotes && nextChar === '"') {
					i += 1;
					continue;
				}
				inQuotes = !inQuotes;
				continue;
			}

			if (!inQuotes && char === delimiter) {
				count += 1;
			}
		}

		return count;
	};

	const detectDelimiter = (text: string): ',' | ';' | '\t' | '|' => {
		const candidateDelimiters: Array<',' | ';' | '\t' | '|'> = [',', ';', '\t', '|'];
		const sampleLines = text
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter(Boolean)
			.slice(0, 5);

		if (sampleLines.length === 0) return ',';

		let bestDelimiter: ',' | ';' | '\t' | '|' = ',';
		let bestScore = -1;

		for (const delimiter of candidateDelimiters) {
			const score = sampleLines.reduce((sum, line) => sum + countDelimiterOutsideQuotes(line, delimiter), 0);
			if (score > bestScore) {
				bestScore = score;
				bestDelimiter = delimiter;
			}
		}

		return bestDelimiter;
	};

	const decodeCsvFile = async (file: File): Promise<string> => {
		const buffer = await file.arrayBuffer();
		const bytes = new Uint8Array(buffer);
		const startsWith = (a: number, b: number) => bytes.length >= 2 && bytes[0] === a && bytes[1] === b;
		const hasNullBytes = bytes.slice(0, Math.min(bytes.length, 200)).some((byte) => byte === 0);

		try {
			if (startsWith(0xFF, 0xFE)) return new TextDecoder('utf-16le').decode(buffer);
			if (startsWith(0xFE, 0xFF)) return new TextDecoder('utf-16be').decode(buffer);
			if (startsWith(0xEF, 0xBB)) return new TextDecoder('utf-8').decode(buffer);
			if (hasNullBytes) return new TextDecoder('utf-16le').decode(buffer);
			return new TextDecoder('utf-8').decode(buffer);
		} catch {
			return file.text();
		}
	};

	const parseCsvWithBestDelimiter = (text: string) => {
		const sanitizedText = text.replace(/^\uFEFF/, '');
		const delimiters: Array<',' | ';' | '\t' | '|'> = [detectDelimiter(sanitizedText), ',', ';', '\t', '|'];
		const uniqueDelimiters = Array.from(new Set(delimiters));

		let bestRows: string[][] = [];
		let bestScore = -1;

		for (const delimiter of uniqueDelimiters) {
			const candidateRows = parseCsvTable(sanitizedText, delimiter);
			const headerScore = candidateRows.length > 0
				? candidateRows[0].map(normalizeToCanonicalHeader).filter((header) => (DEFAULT_CSV_HEADERS as readonly string[]).includes(header)).length
				: 0;
			const score = (headerScore * 100) + candidateRows.length;

			if (score > bestScore) {
				bestScore = score;
				bestRows = candidateRows;
			}
		}

		return bestRows;
	};

	const readSpreadsheetRows = async (file: File): Promise<string[][]> => {
		const arrayBuffer = await file.arrayBuffer();
		const xlsx = await import('xlsx');
		const workbook = xlsx.read(arrayBuffer, { type: 'array' });
		const firstSheetName = workbook.SheetNames[0];
		if (!firstSheetName) return [];

		const sheet = workbook.Sheets[firstSheetName];
		const rows = xlsx.utils.sheet_to_json<(string | number | boolean | Date | null)[]>(sheet, {
			header: 1,
			raw: false,
			defval: '',
			blankrows: false,
		});

		return rows
			.map((row) => row.map((cell) => String(cell ?? '').trim()))
			.filter((row) => row.some((cell) => cell.length > 0));
	};

	const parseListField = (value: string) => {
		if (!value.trim()) return [] as string[];
		return value
			.split(/[|;]+/)
			.map((item) => item.trim())
			.filter(Boolean);
	};

	const parseRoutePointsField = (value: string) => {
		if (!value.trim()) return [] as Array<{ name: string; lat?: number; lng?: number }>;

		return value
			.split('|')
			.map((segment) => segment.trim())
			.filter(Boolean)
			.map((segment) => {
				const [namePart, coordsPart] = segment.split('@').map((part) => part.trim());
				if (!namePart) return null;

				if (!coordsPart) {
					return { name: namePart };
				}

				const [latRaw, lngRaw] = coordsPart.split(',').map((coord) => coord.trim());
				const lat = Number(latRaw);
				const lng = Number(lngRaw);

				return {
					name: namePart,
					...(Number.isFinite(lat) ? { lat } : {}),
					...(Number.isFinite(lng) ? { lng } : {}),
				};
			})
			.filter((point): point is { name: string; lat?: number; lng?: number } => point !== null);
	};

	const toRoutePointInputs = (points?: Array<{ name: string; lat?: number; lng?: number }>) => {
		if (!Array.isArray(points) || points.length === 0) {
			return [{ name: '', lat: '', lng: '' }];
		}

		const mapped = points
			.map((point) => ({
				name: point?.name?.trim() || '',
				lat: typeof point?.lat === 'number' ? String(point.lat) : '',
				lng: typeof point?.lng === 'number' ? String(point.lng) : '',
			}))
			.filter((point) => point.name);

		return mapped.length > 0 ? mapped : [{ name: '', lat: '', lng: '' }];
	};

	const buildRoutePointsPayload = (points: Array<{ name: string; lat: string; lng: string }>) => {
		return points
			.map((point) => {
				const name = point.name.trim();
				if (getRoutePointErrorMessage(point)) return null;
				if (!name) return null;

				const lat = Number(point.lat.trim());
				const lng = Number(point.lng.trim());

				return {
					name,
					...(Number.isFinite(lat) ? { lat } : {}),
					...(Number.isFinite(lng) ? { lng } : {}),
				};
			})
			.filter((point): point is { name: string; lat?: number; lng?: number } => point !== null);
	};

	const looksLikeItineraryText = (value: string) => {
		const text = value.trim();
		if (!text) return false;
		if (/\bday\s*\d+\b/i.test(text)) return true;
		if (/\b(morning|afternoon|evening|night)\b/i.test(text) && /[\n\r]|[-•]/.test(text)) return true;
		return false;
	};

	const normalizeNarrativeFields = (introductionRaw: string, itineraryRaw: string, overviewRaw: string) => {
		let introduction = introductionRaw.trim();
		let itinerary = itineraryRaw.trim();
		let overview = overviewRaw.trim();

		if (!itinerary && looksLikeItineraryText(introduction)) {
			itinerary = introduction;
			introduction = '';
		}

		if (introduction && itinerary && looksLikeItineraryText(introduction) && !looksLikeItineraryText(itinerary)) {
			const swappedIntroduction = itinerary;
			itinerary = introduction;
			introduction = swappedIntroduction;
		}

		if (!introduction && overview && !looksLikeItineraryText(overview)) {
			introduction = overview;
		}

		if (!overview) {
			overview = introduction;
		}

		return { introduction, itinerary, overview };
	};

	const parseTableRowsToImportRows = (rows: string[][]) => {
		if (rows.length === 0) {
			throw new Error('CSV is empty.');
		}

		let headerIndex = 0;
		let bestScore = -1;
		for (let i = 0; i < Math.min(rows.length, 6); i += 1) {
			const headers = rows[i].map(normalizeToCanonicalHeader);
			const requiredMatches = ['place', 'country', 'budget'].filter((key) => headers.includes(key)).length;
			const known = headers.filter((header) => (DEFAULT_CSV_HEADERS as readonly string[]).includes(header)).length;
			const score = (requiredMatches * 100) + (known * 10) + headers.length;
			if (score > bestScore) {
				bestScore = score;
				headerIndex = i;
			}
		}

		const headerCells = rows[headerIndex] || rows[0];
		let headers = headerCells.map(normalizeToCanonicalHeader);
		let dataRows = rows.slice(headerIndex + 1);
		let rowOffset = headerIndex + 2;

		if (dataRows.length === 0) {
			headers = buildFallbackHeaders(headerCells.length);
			dataRows = rows;
			rowOffset = 1;
		}

		const missingRequired = ['place', 'country', 'budget'].filter((key) => !headers.includes(key));
		if (missingRequired.length > 0) {
			headers = buildFallbackHeaders(headerCells.length);
			dataRows = rows;
			rowOffset = 1;
		}

		return dataRows.map((cells, index) => {
			const row: Record<string, string> = {};

			headers.forEach((header, headerIndex) => {
				row[header] = (cells[headerIndex] || '').trim();
			});

			return {
				rowNumber: index + rowOffset,
				data: row,
			};
		});
	};

	const buildFallbackHeaders = (columnCount: number) => {
		const headers = Array.from({ length: columnCount }, (_, index) => `field${index + 1}`);
		if (columnCount > 0) headers[0] = 'place';
		if (columnCount > 1) headers[1] = 'country';
		if (columnCount > 2) headers[2] = 'introduction';
		if (columnCount > 3) headers[3] = 'itinerary';
		if (columnCount > 4) headers[4] = 'budget';
		if (columnCount > 5) headers[5] = 'places';
		if (columnCount > 6) headers[6] = 'restaurants';
		if (columnCount > 7) headers[7] = 'hotels';
		if (columnCount === 3) {
			headers[2] = 'budget';
		}
		if (columnCount === 4) {
			headers[2] = 'itinerary';
			headers[3] = 'budget';
		}
		return headers;
	};

	const parseCsvTextToRows = (text: string) => {
		const rows = parseCsvWithBestDelimiter(text);
		return parseTableRowsToImportRows(rows);
	};

	const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0] || null;
		setCsvFile(file);
		setCsvImportSummary(null);
		setCsvImportError(null);

		if (csvInputRef.current) {
			csvInputRef.current.value = '';
		}
	};

	const handleImportCsv = async () => {
		if (!csvFile) {
			setCsvImportError('Please select a CSV or Excel file to import.');
			return;
		}

		setCsvImporting(true);
		setCsvImportProgress(0);
		setCsvImportSummary(null);
		setCsvImportError(null);

		try {
			const fileName = csvFile.name.toLowerCase();
			const isSpreadsheet = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
			const rows = isSpreadsheet
				? parseTableRowsToImportRows(await readSpreadsheetRows(csvFile))
				: parseCsvTextToRows(await decodeCsvFile(csvFile));
			const errors: string[] = [];
			let importedRows = 0;

			for (let i = 0; i < rows.length; i += 1) {
				const { rowNumber, data } = rows[i];
				const place = (data.place || '').trim();
				const country = (data.country || '').trim();
				const budget = (data.budget || '').trim();
				const normalizedNarrative = normalizeNarrativeFields(
					data.introduction || data.overview || '',
					data.itinerary || '',
					data.overview || data.introduction || '',
				);

				if (!place || !country || !budget) {
					errors.push(`Row ${rowNumber}: place, country, and budget are required.`);
					setCsvImportProgress(Math.round(((i + 1) / rows.length) * 100));
					continue;
				}

				const payload = {
					place,
					country,
					budget,
					introduction: normalizedNarrative.introduction,
					itinerary: normalizedNarrative.itinerary,
					overview: normalizedNarrative.overview,
					durationText: data.durationtext || '',
					budgetEstimate: data.budgetestimate || '',
					routeFlow: data.routeflow || '',
					places: parseListField(data.places || ''),
					restaurants: parseListField(data.restaurants || ''),
					hotels: parseListField(data.hotels || ''),
					travelTips: parseListField(data.traveltips || ''),
					localInsights: parseListField(data.localinsights || ''),
					images: parseListField(data.images || ''),
					videos: parseListField(data.videos || ''),
					map: (data.map || '').trim() || null,
					routePoints: parseRoutePointsField(data.routepoints || ''),
					generatedBy: data.generatedby === 'gemini' ? 'gemini' : 'system',
				};

				const response = await fetch('/api/travel', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload),
				});

				if (!response.ok) {
					const errorBody = await response.json().catch(() => ({} as { message?: string }));
					errors.push(`Row ${rowNumber}: ${errorBody.message || 'Failed to import row.'}`);
				} else {
					importedRows += 1;
				}

				setCsvImportProgress(Math.round(((i + 1) / rows.length) * 100));
			}

			const summary: CsvImportSummary = {
				totalRows: rows.length,
				importedRows,
				failedRows: rows.length - importedRows,
				errors,
			};

			setCsvImportSummary(summary);

			if (summary.failedRows > 0) {
				setCsvImportError('CSV import completed with some failed rows. Check summary below.');
			} else {
				setUploadState((prev) => ({
					...prev,
					success: `CSV import complete. ${summary.importedRows} itineraries created.`,
				}));
			}

			await fetchItineraries({
				reset: true,
				forceRefresh: true,
				filters: appliedFilters,
			});
		} catch (error: any) {
			setCsvImportError(error?.message || 'Failed to import file.');
		} finally {
			setCsvImporting(false);
			setCsvFile(null);
		}
	};

	const handleCopyCsvTemplate = async () => {
		try {
			await navigator.clipboard.writeText(CSV_TEMPLATE_TEXT);
			setCopiedCsvTemplate(true);
			setTimeout(() => setCopiedCsvTemplate(false), 1800);
		} catch {
			setCsvImportError('Unable to copy template. Please copy it manually from the help text.');
		}
	};

	const fetchMigrationProgress = useCallback(async (jobId: string) => {
		const response = await adminAPI.getTourPlaceSearchMigrationStatus(jobId);
		const progress = response?.data?.data?.progress as MigrationProgress | undefined;
		if (!progress) {
			throw new Error('Migration progress unavailable');
		}
		setMigrationProgress(progress);
		return progress;
	}, []);

	const handleRunMigration = async () => {
		setMigrationStarting(true);
		setMigrationNotice(null);
		try {
			const response = await adminAPI.startTourPlaceSearchMigration();
			const payload = response?.data?.data as {
				jobId?: string;
				alreadyRunning?: boolean;
				progress?: MigrationProgress;
			} | undefined;

			const jobId = payload?.jobId;
			if (!jobId) {
				throw new Error('Migration job ID is missing');
			}

			setMigrationJobId(jobId);
			setMigrationProgress(payload?.progress || null);
			setMigrationNotice(payload?.alreadyRunning ? 'Migration already running.' : 'Migration started in background.');
		} catch (error: unknown) {
			setMigrationNotice(error instanceof Error ? error.message : 'Failed to start migration.');
		} finally {
			setMigrationStarting(false);
		}
	};

	useEffect(() => {
		if (!migrationJobId) return;

		let intervalId: ReturnType<typeof setInterval> | null = null;
		let cancelled = false;

		const poll = async () => {
			try {
				const progress = await fetchMigrationProgress(migrationJobId);
				if (cancelled) return;
				if (progress.status === 'completed') {
					setMigrationNotice('Migration completed successfully.');
					if (intervalId) clearInterval(intervalId);
				}
				if (progress.status === 'failed') {
					setMigrationNotice(progress.error || 'Migration failed.');
					if (intervalId) clearInterval(intervalId);
				}
			} catch {
				if (intervalId) clearInterval(intervalId);
			}
		};

		void poll();
		intervalId = setInterval(() => {
			void poll();
		}, 2000);

		return () => {
			cancelled = true;
			if (intervalId) clearInterval(intervalId);
		};
	}, [fetchMigrationProgress, migrationJobId]);

	return (
		<div className="min-h-screen bg-linear-to-br from-rose-50 dark:from-slate-950 via-white dark:via-rose-950/30 to-orange-50 dark:to-slate-900 p-6">
			<AnimatePresence>
				{(uploadState.success || uploadState.error) && (
					<motion.div
						key={uploadState.error ? 'itinerary-error-toast' : 'itinerary-success-toast'}
						initial={{ opacity: 0, y: -18, scale: 0.96 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: -18, scale: 0.96 }}
						transition={{ duration: 0.2 }}
						className="fixed top-4 right-4 z-80 max-w-sm rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-md"
					>
						{uploadState.error ? (
							<div className="flex items-start gap-3 bg-red-50/95 dark:bg-red-950/80 border-red-200 dark:border-red-900 text-red-800 dark:text-red-100">
								<AlertCircle className="w-5 h-5 text-red-600 dark:text-red-300 shrink-0" />
								<p className="text-sm font-medium">{uploadState.error}</p>
							</div>
						) : (
							<div className="flex items-start gap-3 bg-green-50/95 dark:bg-green-950/80 border-green-200 dark:border-green-900 text-green-800 dark:text-green-100">
								<CheckCircle className="w-5 h-5 text-green-600 dark:text-green-300 shrink-0" />
								<p className="text-sm font-medium">{uploadState.success}</p>
							</div>
						)}
					</motion.div>
				)}
			</AnimatePresence>

			<div className="max-w-6xl mx-auto">
				{/* Header */}
				<motion.div
					initial={{ opacity: 0, y: -20 }}
					animate={{ opacity: 1, y: 0 }}
					className="mb-8"
				>
					<h1 className="text-4xl font-bold bg-linear-to-r from-rose-500 to-orange-500 bg-clip-text text-transparent mb-2">
						Travel Itinerary Details
					</h1>
					<p className="text-slate-600 dark:text-slate-400">
						Manage and upload travel destination data
					</p>
				</motion.div>

				{/* Database Itineraries Section */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					className="mb-12"
				>
					<Card className="p-6 border-0 shadow-lg dark:shadow-2xl">
						<div className="flex flex-wrap items-center justify-between gap-3 mb-6">
							<h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
								<span className="text-rose-500">📋</span>
								Database Itineraries ({existingItineraries.length})
							</h2>
							<Button
								onClick={openCreateEditor}
								className="gap-2 bg-linear-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600"
							>
								<Plus className="w-4 h-4" />
								New Itinerary
							</Button>
							<Button
								onClick={() => {
									void fetchItineraries({
										reset: true,
										forceRefresh: true,
										filters: appliedFilters,
									});
								}}
								variant="outline"
								size="sm"
								disabled={loadingItineraries}
								className="gap-2"
							>
								{loadingItineraries ? <Loader className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
								Refresh
							</Button>
							<Button
								onClick={deleteAllItineraries}
								variant="destructive"
								size="sm"
								disabled={existingItineraries.length === 0 || uploadState.uploading}
								className="gap-2"
							>
								<Trash2 className="w-4 h-4" />
								Delete All
							</Button>
						</div>

						<div className="mb-6 rounded-xl border border-rose-200/70 dark:border-rose-900/50 bg-rose-50/70 dark:bg-rose-950/20 p-4">
							<div className="flex flex-wrap items-center justify-between gap-3 mb-3">
								<h3 className="text-base font-semibold text-slate-900 dark:text-white">Import Itineraries from CSV</h3>
								<Badge variant="outline" className="text-xs">
									Required columns: place, country, budget
								</Badge>
							</div>
							<p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mb-3">
								Optional columns: introduction, itinerary, places, restaurants, hotels, images, videos, map, overview, durationText, budgetEstimate, travelTips, localInsights, routeFlow, routePoints, generatedBy. Use | to separate list values.
							</p>
							<div className="flex flex-wrap gap-2">
								<input
									ref={csvInputRef}
									type="file"
									accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
									onChange={handleCsvFileChange}
									disabled={csvImporting}
									className="hidden"
								/>
								<Button
									onClick={() => csvInputRef.current?.click()}
									variant="outline"
									disabled={csvImporting}
								>
									{csvFile ? 'Change File' : 'Choose CSV/XLSX'}
								</Button>
								<Button
									onClick={handleCopyCsvTemplate}
									variant="outline"
									disabled={csvImporting}
								>
									{copiedCsvTemplate ? 'Template Copied' : 'Copy CSV Template'}
								</Button>
								<Button
									onClick={handleImportCsv}
									disabled={!csvFile || csvImporting}
									className="bg-linear-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600"
								>
									{csvImporting ? 'Importing...' : 'Import File'}
								</Button>
								<Button
									onClick={handleRunMigration}
									variant="outline"
									disabled={migrationStarting || migrationProgress?.status === 'running' || migrationProgress?.status === 'queued'}
								>
									{migrationStarting ? 'Starting Migration...' : 'Run Migration'}
								</Button>
							</div>
							{csvFile && (
								<p className="mt-2 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
									Selected file: <span className="font-semibold">{csvFile.name}</span>
								</p>
							)}
							{csvImporting && (
								<div className="mt-3">
									<div className="w-full bg-rose-200 dark:bg-rose-900/40 rounded-full h-2">
										<motion.div
											className="bg-linear-to-r from-rose-500 to-orange-500 h-2 rounded-full"
											initial={{ width: 0 }}
											animate={{ width: `${csvImportProgress}%` }}
											transition={{ duration: 0.2 }}
										/>
									</div>
									<p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Import progress: {csvImportProgress}%</p>
								</div>
							)}
							{csvImportError && (
								<p className="mt-3 text-sm text-red-600 dark:text-red-300">{csvImportError}</p>
							)}
							{csvImportSummary && (
								<div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 p-3 text-sm">
									<p className="font-semibold text-slate-800 dark:text-slate-100">
										Imported {csvImportSummary.importedRows}/{csvImportSummary.totalRows} rows.
									</p>
									{csvImportSummary.failedRows > 0 && (
										<p className="text-red-600 dark:text-red-300 mt-1">
											Failed rows: {csvImportSummary.failedRows}
										</p>
									)}
									{csvImportSummary.errors.length > 0 && (
										<div className="mt-2 max-h-32 overflow-y-auto pr-1">
											{csvImportSummary.errors.map((errorText, index) => (
												<p key={`${errorText}-${index}`} className="text-xs text-slate-600 dark:text-slate-300">{errorText}</p>
											))}
										</div>
									)}
									{(migrationProgress || migrationNotice) && (
										<div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 p-3 text-sm">
											{migrationNotice && <p className="text-xs text-slate-600 dark:text-slate-300 mb-2">{migrationNotice}</p>}
											{migrationProgress && (
												<>
													<div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
														<span className="font-mono text-slate-500 dark:text-slate-400">{migrationProgress.jobId}</span>
														<span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-semibold uppercase">{migrationProgress.status}</span>
													</div>
													<div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
														<span>Total: {migrationProgress.total}</span>
														<span>Processed: {migrationProgress.processed}</span>
														<span>Updated: {migrationProgress.updated}</span>
														<span>Skipped: {migrationProgress.skipped}</span>
													</div>
													<div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
														<div
															className="h-full bg-linear-to-r from-rose-500 to-orange-500 transition-all duration-300"
															style={{ width: `${migrationProgress.total > 0 ? Math.min(100, Math.round((migrationProgress.processed / migrationProgress.total) * 100)) : 0}%` }}
														/>
													</div>
												</>
											)}
										</div>
									)}
								</div>
							)}
						</div>

						<div className="mb-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/40 p-3 space-y-3">
							<div className="grid grid-cols-1 gap-2 md:grid-cols-4">
								<Input
									value={itinerarySearchInput}
									onChange={(e) => setItinerarySearchInput(e.target.value)}
									placeholder="Search place or itinerary..."
								/>
								<Input
									value={countryFilterInput}
									onChange={(e) => setCountryFilterInput(e.target.value)}
									placeholder="Country filter"
								/>
								<Button variant="outline" onClick={handleApplyListFilters}>Apply Filters</Button>
								<Button variant="outline" onClick={handleResetListFilters}>Reset</Button>
							</div>
							<p className="text-xs text-slate-500 dark:text-slate-400">
								Loaded {filteredItineraries.length} itinerary records for current filters.
							</p>
						</div>

						{loadingItineraries ? (
							<div className="p-8 text-center">
								<Loader className="w-8 h-8 animate-spin mx-auto text-rose-500 mb-3" />
								<p className="text-slate-600 dark:text-slate-400">Loading itineraries from database...</p>
							</div>
						) : filteredItineraries.length === 0 ? (
							<div className="p-8 text-center rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40">
								<p className="text-slate-700 dark:text-slate-200 font-medium">No matching travel itineraries found.</p>
								<p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Try another search keyword or create a new itinerary.</p>
							</div>
						) : (
							<div className="space-y-4">
								<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
								{filteredItineraries.map((item) => (
									<motion.div
										key={item.id}
										initial={{ opacity: 0, y: 10 }}
										animate={{ opacity: 1, y: 0 }}
										whileHover={{ scale: 1.02 }}
										className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:shadow-lg transition-all cursor-pointer"
									>
										{getTravelItemImage(item) && (
											<img
												src={getTravelItemImage(item)}
												alt={item.place}
												className="w-full h-40 object-cover rounded-md mb-3"
											/>
										)}
										<h3 className="text-lg font-semibold text-slate-900 dark:text-white">{item.place}</h3>
										<p className="text-sm text-slate-600 dark:text-slate-400 mb-2">{item.country}</p>
										<p className="text-sm font-medium text-rose-600 dark:text-rose-400 mb-3">{item.budget}</p>
										{item.itinerary && (
											<p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-3 mb-3">{item.itinerary}</p>
										)}
										<div className="flex flex-wrap gap-2 mb-3">
											<Badge variant="outline" className="text-xs">{item.places?.length || 0} places</Badge>
											<Badge variant="outline" className="text-xs">{item.restaurants?.length || 0} restaurants</Badge>
											<Badge variant="outline" className="text-xs">{item.hotels?.length || 0} hotels</Badge>
										</div>
										<div className="flex gap-2">
											<Button
												onClick={() => loadForEditing(item)}
												size="sm"
												className="flex-1 bg-blue-500 hover:bg-blue-600 text-white gap-1"
											>
												<Edit2 className="w-4 h-4" />
												Edit
											</Button>
											<Button
												onClick={() => deleteItinerary(item.id)}
												size="sm"
												variant="destructive"
												disabled={uploadState.uploading}
												className="flex-1 gap-1"
											>
												<Trash2 className="w-4 h-4" />
												Delete
											</Button>
										</div>
									</motion.div>
								))}
								</div>
								<div className="flex justify-center">
									<Button
										variant="outline"
										onClick={handleLoadMoreItineraries}
										disabled={!hasMoreItineraries || loadingMoreItineraries}
									>
										{loadingMoreItineraries ? 'Loading More...' : hasMoreItineraries ? 'Load More' : 'No More Results'}
									</Button>
								</div>
							</div>
						)}
					</Card>
				</motion.div>

				{/* Status Messages */}
				{uploadState.error && (
					<motion.div
						initial={{ opacity: 0, y: -10 }}
						animate={{ opacity: 1, y: 0 }}
						className="mb-6 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg flex items-center gap-3"
					>
						<AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
						<span className="text-red-800 dark:text-red-200">{uploadState.error}</span>
					</motion.div>
				)}

				{uploadState.success && (
					<motion.div
						initial={{ opacity: 0, y: -10 }}
						animate={{ opacity: 1, y: 0 }}
						className="mb-6 p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg flex items-center gap-3"
					>
						<CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
						<span className="text-green-800 dark:text-green-200">{uploadState.success}</span>
					</motion.div>
				)}

				{uploadState.uploading && (
					<motion.div
						initial={{ opacity: 0, y: -10 }}
						animate={{ opacity: 1, y: 0 }}
						className="mb-6 p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-lg"
					>
						<div className="flex items-center justify-between mb-2">
							<span className="text-rose-800 dark:text-rose-200 font-medium">Uploading...</span>
							<span className="text-sm text-rose-600 dark:text-rose-400">{Math.round(uploadState.progress)}%</span>
						</div>
						<div className="w-full bg-rose-200 dark:bg-rose-900/50 rounded-full h-2">
							<motion.div
								className="bg-linear-to-r from-rose-500 to-orange-500 h-2 rounded-full"
								initial={{ width: 0 }}
								animate={{ width: `${uploadState.progress}%` }}
								transition={{ duration: 0.3 }}
							/>
						</div>
					</motion.div>
				)}

				{/* Edit Mode Banner */}
				{isEditing && (
					<motion.div
						initial={{ opacity: 0, y: -10 }}
						animate={{ opacity: 1, y: 0 }}
						className="mb-8 p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg flex items-center justify-between"
					>
						<div className="flex items-center gap-3">
							<Edit2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
							<span className="font-medium text-blue-800 dark:text-blue-200">
								Editing: <strong>{form.place}</strong> ({form.country})
							</span>
						</div>
						<Button
							onClick={() => setIsEditorOpen(true)}
							size="sm"
							variant="outline"
							className="text-blue-600 dark:text-blue-400"
						>
							Open Editor
						</Button>
						<Button
							onClick={() => {
								handleReset();
								setIsEditing(false);
							}}
							size="sm"
							variant="outline"
							className="text-blue-600 dark:text-blue-400"
						>
							Cancel Edit
						</Button>
					</motion.div>
				)}

				<AnimatePresence>
					{isEditorOpen && (
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							onMouseDown={(event) => {
								if (event.target === event.currentTarget) {
									closeEditor();
								}
							}}
							className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] p-4 sm:p-6 overflow-y-auto"
						>
							<motion.div
								initial={{ opacity: 0, y: 24, scale: 0.98 }}
								animate={{ opacity: 1, y: 0, scale: 1 }}
								exit={{ opacity: 0, y: 24, scale: 0.98 }}
								transition={{ duration: 0.2 }}
								className="mx-auto flex max-h-[92vh] w-full max-w-6xl flex-col rounded-2xl bg-white dark:bg-slate-950 p-6 shadow-2xl border border-slate-200 dark:border-slate-800"
							>
								<div className="flex items-center justify-between mb-5">
									<h2 className="text-xl font-bold text-slate-900 dark:text-white">
										{isEditing ? 'Edit Travel Itinerary' : 'Create Travel Itinerary'}
									</h2>
									<Button type="button" variant="ghost" size="icon" onClick={closeEditor} disabled={uploadState.uploading}>
										<X className="w-5 h-5" />
									</Button>
								</div>

								<div className="flex-1 overflow-y-auto pr-1 pb-3">

								<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
					{/* Main Form */}
					<div className="lg:col-span-2 space-y-6">
						{/* Basic Info */}
						<Card className="p-6 border-0 shadow-lg dark:shadow-2xl">
							<h2 className="text-xl font-bold mb-4 text-slate-900 dark:text-white">Place or Country of Travel</h2>
							<div className="space-y-4">
								<div>
									<label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
										Place of Travel <span className="text-red-500">*</span>
									</label>
									<Input
										name="place"
										value={form.place}
										onChange={handleInputChange}
										placeholder="e.g., Bali, Tokyo, Paris"
										disabled={uploadState.uploading}
										className="w-full"
									/>
								</div>

								<div>
									<label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
										Country of Travel <span className="text-red-500">*</span>
									</label>
									<Input
										name="country"
										value={form.country}
										onChange={handleInputChange}
										placeholder="e.g., Indonesia, Japan, France"
										disabled={uploadState.uploading}
										className="w-full"
									/>
								</div>

								<div>
									<RichTextEditor
										id="travel-introduction-rich-text"
										label="Introduction"
										value={form.introduction}
										onChange={(html) => setForm((prev) => ({ ...prev, introduction: html }))}
										disabled={uploadState.uploading}
										helperText="Add a short formatted overview. Supports bold, lists, headings, color, and clean paste from ChatGPT."
									/>
								</div>

								<div>
									<RichTextEditor
										id="travel-itinerary-rich-text"
										label="Travel Itinerary"
										value={form.itinerary}
										onChange={(html) => setForm((prev) => ({ ...prev, itinerary: html }))}
										disabled={uploadState.uploading}
										helperText="Use day-wise headings, bullets, highlights, and rich formatting. Paste from ChatGPT to auto-preserve structure."
									/>
								</div>

								<div>
									<div className="mb-2 flex items-center justify-between gap-2">
										<label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
											Pin Markers (Multiple Locations)
										</label>
										<Badge variant="outline" className="text-xs">
											{validPinCount} valid pin{validPinCount === 1 ? '' : 's'}
										</Badge>
									</div>
									<div className="space-y-2">
										{form.routePoints.map((point, index) => (
											<div key={`route-point-${index}`} className="space-y-1.5">
												<div className="grid grid-cols-1 md:grid-cols-12 gap-2">
													<Input
														value={point.name}
														onChange={(e) => handleRoutePointChange(index, 'name', e.target.value)}
														placeholder={`Location ${index + 1}`}
														disabled={uploadState.uploading}
														className={`md:col-span-6 ${point.name.trim().length === 0 && (point.lat.trim() || point.lng.trim()) ? 'border-red-400 focus-visible:ring-red-400' : ''}`}
													/>
													<Input
														value={point.lat}
														onChange={(e) => handleRoutePointChange(index, 'lat', e.target.value)}
														placeholder="Latitude"
														disabled={uploadState.uploading}
														className={`md:col-span-2 ${!isValidCoordinate(point.lat, 'lat') || (point.lat.trim() && !point.lng.trim()) ? 'border-red-400 focus-visible:ring-red-400' : ''}`}
													/>
													<Input
														value={point.lng}
														onChange={(e) => handleRoutePointChange(index, 'lng', e.target.value)}
														placeholder="Longitude"
														disabled={uploadState.uploading}
														className={`md:col-span-2 ${!isValidCoordinate(point.lng, 'lng') || (!point.lat.trim() && point.lng.trim()) ? 'border-red-400 focus-visible:ring-red-400' : ''}`}
													/>
													<Button
														type="button"
														onClick={() => handleRemoveRoutePoint(index)}
														variant="ghost"
														size="icon"
														disabled={uploadState.uploading}
														className="md:col-span-2"
													>
														<Trash2 className="w-4 h-4 text-red-500" />
													</Button>
												</div>
												{getRoutePointErrorMessage(point) && (
													<p className="text-xs text-red-500">{getRoutePointErrorMessage(point)}</p>
												)}
											</div>
										))}
										<Button
											type="button"
											onClick={handleAddRoutePoint}
											variant="outline"
											size="sm"
											disabled={uploadState.uploading}
											className="gap-1"
										>
											<Plus className="w-4 h-4" /> Add Pin
										</Button>
									</div>
									<p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
										Add name only, or include latitude/longitude for exact pin placement.
									</p>
								</div>

								<div>
									<label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
										Average Budget <span className="text-red-500">*</span>
									</label>
									<Input
										name="budget"
										value={form.budget}
										onChange={handleInputChange}
										placeholder="e.g., $1000-1500 per person"
										disabled={uploadState.uploading}
										className="w-full"
									/>
								</div>
							</div>
						</Card>

						{/* Dynamic Lists */}
						<Card className="p-6 border-0 shadow-lg dark:shadow-2xl">
							<h2 className="text-xl font-bold mb-4 text-slate-900 dark:text-white">Top Places, Restaurants and Hotels</h2>
							<div className="space-y-6">
								{/* Places */}
								<div>
									<div className="flex items-center justify-between mb-3">
										<label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
											Top Places to Visit <span className="text-red-500">*</span>
										</label>
										<Button
											type="button"
											onClick={() => handleAddListItem('places')}
											variant="outline"
											size="sm"
											disabled={uploadState.uploading}
											className="gap-1"
										>
											<Plus className="w-4 h-4" /> Add
										</Button>
									</div>
									<div className="space-y-2">
										{form.places.map((place, idx) => (
											<div key={idx} className="flex gap-2">
												<Input
													value={place}
													onChange={e => handleListChange('places', idx, e.target.value)}
													placeholder={`Place ${idx + 1}`}
													disabled={uploadState.uploading}
													className="flex-1"
												/>
												{form.places.length > 1 && (
													<Button
														type="button"
														onClick={() => handleRemoveListItem('places', idx)}
														variant="ghost"
														size="icon"
														disabled={uploadState.uploading}
													>
														<Trash2 className="w-4 h-4 text-red-500" />
													</Button>
												)}
											</div>
										))}
									</div>
								</div>

								{/* Restaurants */}
								<div>
									<div className="flex items-center justify-between mb-3">
										<label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
											Top Restaurants <span className="text-red-500">*</span>
										</label>
										<Button
											type="button"
											onClick={() => handleAddListItem('restaurants')}
											variant="outline"
											size="sm"
											disabled={uploadState.uploading}
											className="gap-1"
										>
											<Plus className="w-4 h-4" /> Add
										</Button>
									</div>
									<div className="space-y-2">
										{form.restaurants.map((restaurant, idx) => (
											<div key={idx} className="flex gap-2">
												<Input
													value={restaurant}
													onChange={e => handleListChange('restaurants', idx, e.target.value)}
													placeholder={`Restaurant ${idx + 1}`}
													disabled={uploadState.uploading}
													className="flex-1"
												/>
												{form.restaurants.length > 1 && (
													<Button
														type="button"
														onClick={() => handleRemoveListItem('restaurants', idx)}
														variant="ghost"
														size="icon"
														disabled={uploadState.uploading}
													>
														<Trash2 className="w-4 h-4 text-red-500" />
													</Button>
												)}
											</div>
										))}
									</div>
								</div>

								{/* Hotels */}
								<div>
									<div className="flex items-center justify-between mb-3">
										<label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
											Top Hotels and Resorts <span className="text-red-500">*</span>
										</label>
										<Button
											type="button"
											onClick={() => handleAddListItem('hotels')}
											variant="outline"
											size="sm"
											disabled={uploadState.uploading}
											className="gap-1"
										>
											<Plus className="w-4 h-4" /> Add
										</Button>
									</div>
									<div className="space-y-2">
										{form.hotels.map((hotel, idx) => (
											<div key={idx} className="flex gap-2">
												<Input
													value={hotel}
													onChange={e => handleListChange('hotels', idx, e.target.value)}
													placeholder={`Hotel ${idx + 1}`}
													disabled={uploadState.uploading}
													className="flex-1"
												/>
												{form.hotels.length > 1 && (
													<Button
														type="button"
														onClick={() => handleRemoveListItem('hotels', idx)}
														variant="ghost"
														size="icon"
														disabled={uploadState.uploading}
													>
														<Trash2 className="w-4 h-4 text-red-500" />
													</Button>
												)}
											</div>
										))}
									</div>
								</div>
							</div>
						</Card>
					</div>

					{/* Media Upload Section */}
					<div className="space-y-6">
						<Card className="p-4 border-0 shadow-lg dark:shadow-2xl">
							<h2 className="text-lg font-bold text-slate-900 dark:text-white">Upload Photo, Video</h2>
						</Card>

						{/* Photo Upload */}
						<Card className="p-6 border-0 shadow-lg dark:shadow-2xl">
							<h3 className="text-lg font-bold mb-4 text-slate-900 dark:text-white flex items-center gap-2">
								<Upload className="w-5 h-5" /> Upload Photo
							</h3>
							<input
								ref={imageInputRef}
								type="file"
								multiple
								accept="image/*"
								onChange={handleImageChange}
								disabled={uploadState.uploading}
								className="hidden"
							/>
							<Button
									type="button"
								onClick={() => imageInputRef.current?.click()}
								variant="outline"
								className="w-full mb-3"
								disabled={uploadState.uploading || isCompressingImages}
							>
								{isCompressingImages ? 'Compressing Images...' : 'Choose Images'}
							</Button>
							<div className="space-y-2 max-h-48 overflow-y-auto">
								{form.imagePreviews.length === 0 ? (
									<p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">No images selected</p>
								) : (
									form.imagePreviews.map((url, idx) => (
										<motion.div
											key={idx}
											initial={{ opacity: 0, scale: 0.8 }}
											animate={{ opacity: 1, scale: 1 }}
											className="relative group"
										>
											<img src={url} alt={`Preview ${idx}`} className="w-full h-20 object-cover rounded-lg" />
											<Button
												type="button"
												onClick={() => handleRemoveImage(idx)}
												variant="ghost"
												size="icon"
												className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600"
												disabled={uploadState.uploading}
											>
												<X className="w-4 h-4 text-white" />
											</Button>
										</motion.div>
									))
								)}
							</div>
							<Badge variant="outline" className="mt-3 w-full justify-center">
								{form.imageFiles.length} image(s)
							</Badge>
						</Card>

						{/* Video Upload */}
						<Card className="p-6 border-0 shadow-lg dark:shadow-2xl">
							<h3 className="text-lg font-bold mb-4 text-slate-900 dark:text-white flex items-center gap-2">
								<Upload className="w-5 h-5" /> Upload Video
							</h3>
							<input
								ref={videoInputRef}
								type="file"
								multiple
								accept="video/*"
								onChange={handleVideoChange}
								disabled={uploadState.uploading}
								className="hidden"
							/>
							<Button
									type="button"
								onClick={() => videoInputRef.current?.click()}
								variant="outline"
								className="w-full mb-3"
								disabled={uploadState.uploading}
							>
								Choose Videos
							</Button>
							<div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
								{form.videoPreviews.length === 0 ? (
									<p className="col-span-2 text-sm text-slate-500 dark:text-slate-400 text-center py-4">No videos selected</p>
								) : (
									form.videoPreviews.map((url, idx) => (
										<motion.div
											key={idx}
											initial={{ opacity: 0, scale: 0.8 }}
											animate={{ opacity: 1, scale: 1 }}
											className="relative group"
										>
											<video src={url} className="w-full h-20 object-cover rounded-lg bg-black" />
											<Button
												type="button"
												onClick={() => handleRemoveVideo(idx)}
												variant="ghost"
												size="icon"
												className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600"
												disabled={uploadState.uploading}
											>
												<X className="w-4 h-4 text-white" />
											</Button>
										</motion.div>
									))
								)}
							</div>
							<Badge variant="outline" className="mt-3 w-full justify-center">
								{form.videoFiles.length} video(s)
							</Badge>
						</Card>

						{/* Map Upload */}
						<Card className="p-6 border-0 shadow-lg dark:shadow-2xl">
							<h3 className="text-lg font-bold mb-4 text-slate-900 dark:text-white flex items-center gap-2">
								<Upload className="w-5 h-5" /> Travel Map
							</h3>
							<input
								ref={mapInputRef}
								type="file"
								accept="image/*,.pdf"
								onChange={handleMapChange}
								disabled={uploadState.uploading}
								className="hidden"
							/>
							<Button
									type="button"
								onClick={() => mapInputRef.current?.click()}
								variant="outline"
								className="w-full"
								disabled={uploadState.uploading}
							>
								Upload Map
							</Button>
							{form.mapFile && (
								<motion.div
									initial={{ opacity: 0, y: -10 }}
									animate={{ opacity: 1, y: 0 }}
									className="mt-3 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-between"
								>
									<span className="text-sm text-slate-600 dark:text-slate-400 truncate">{getMapLabel(form.mapFile)}</span>
									<Button
											type="button"
										onClick={() => setForm(prev => ({ ...prev, mapFile: null }))}
										variant="ghost"
										size="icon"
										disabled={uploadState.uploading}
									>
										<X className="w-4 h-4" />
									</Button>
								</motion.div>
							)}
						</Card>

					</div>
								</div>

								</div>

								<div className="sticky bottom-0 mt-4 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm pt-4">
									<div className="flex flex-wrap justify-end gap-3">
										<Button type="button" onClick={closeEditor} variant="outline" disabled={uploadState.uploading}>
											Cancel
										</Button>
										<Button
											type="button"
											onClick={handleSubmit}
											disabled={uploadState.uploading}
											className="gap-2 bg-linear-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600"
										>
											<Save className="w-4 h-4" />
											{isEditing ? 'Update' : 'Create'}
										</Button>
									</div>
								</div>
							</motion.div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</div>
	);
}
