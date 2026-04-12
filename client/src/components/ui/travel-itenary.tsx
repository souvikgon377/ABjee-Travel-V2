'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Upload, Trash2, Plus, X, Save, AlertCircle, CheckCircle, Edit2, Loader, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { modernConfirm } from '@/lib/modernDialog';

interface FormState {
	id?: string;
	place: string;
	country: string;
	itinerary: string;
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
	itinerary?: string;
	restaurants?: string[];
	hotels?: string[];
	budget: string;
	createdAt: string;
	updatedAt: string;
	images?: string[];
	videos?: string[];
	map?: string | null;
	places?: string[];
}

export default function AdminTravelItenary() {
	const [existingItineraries, setExistingItineraries] = useState<TravelItem[]>([]);
	const [loadingItineraries, setLoadingItineraries] = useState(true);
	const [isEditing, setIsEditing] = useState(false);
	const [form, setForm] = useState<FormState>({
		place: '',
		country: '',
		itinerary: '',
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
	const [isCompressingImages, setIsCompressingImages] = useState(false);

	const imageInputRef = useRef<HTMLInputElement>(null);
	const videoInputRef = useRef<HTMLInputElement>(null);
	const mapInputRef = useRef<HTMLInputElement>(null);

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

	// Fetch existing itineraries on mount
	useEffect(() => {
		fetchItineraries();
	}, []);

	// Fetch existing itineraries from API
	const fetchItineraries = async () => {
		try {
			setLoadingItineraries(true);
			const res = await fetch('/api/travel');
			if (!res.ok) throw new Error('Failed to fetch itineraries');
			const data = await res.json();
			const results = data.results || data.data?.results || [];
			const sortedResults = [...results].sort((a: TravelItem, b: TravelItem) => {
				return new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime();
			});
			setExistingItineraries(sortedResults);
		} catch (error: any) {
			setUploadState(prev => ({
				...prev,
				error: error.message || 'Failed to load itineraries',
			}));
		} finally {
			setLoadingItineraries(false);
		}
	};

	// Load itinerary for editing
	const loadForEditing = useCallback((itinerary: TravelItem) => {
		setForm({
			id: itinerary.id,
			place: itinerary.place,
			country: itinerary.country,
			itinerary: itinerary.itinerary || '',
			places: itinerary.places || [''],
			restaurants: itinerary.restaurants || [''],
			hotels: itinerary.hotels || [''],
			budget: itinerary.budget || '',
			imageFiles: [],
			videoFiles: [],
			mapFile: itinerary.map || null,
			imagePreviews: itinerary.images || [],
			videoPreviews: itinerary.videos || [],
		});
		setIsEditing(true);
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
			if (!res.ok) throw new Error('Failed to delete itinerary');

			setExistingItineraries(prev => prev.filter(item => item.id !== id));
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
			const uploadedImages: string[] = [...form.imagePreviews.filter(p => p.startsWith('http'))];
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
				itinerary: form.itinerary.trim(),
				places: form.places.filter(p => p.trim()),
				restaurants: form.restaurants.filter(r => r.trim()),
				hotels: form.hotels.filter(h => h.trim()),
				budget: form.budget.trim(),
				images: uploadedImages.length > 0 ? uploadedImages : form.imagePreviews,
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
			await fetchItineraries();

			// Reset form
			setTimeout(() => {
				setForm({
					place: '',
					country: '',
					itinerary: '',
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
			itinerary: '',
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

	const getMapLabel = (mapValue: File | string | null) => {
		if (!mapValue) return '';
		if (mapValue instanceof File) return mapValue.name;
		const segments = mapValue.split('/');
		return segments[segments.length - 1] || mapValue;
	};

	return (
		<div className="min-h-screen bg-linear-to-br from-rose-50 dark:from-slate-950 via-white dark:via-rose-950/30 to-orange-50 dark:to-slate-900 p-6">
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
								onClick={fetchItineraries}
								variant="outline"
								size="sm"
								disabled={loadingItineraries}
								className="gap-2"
							>
								{loadingItineraries ? <Loader className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
								Refresh
							</Button>
						</div>

						{loadingItineraries ? (
							<div className="p-8 text-center">
								<Loader className="w-8 h-8 animate-spin mx-auto text-rose-500 mb-3" />
								<p className="text-slate-600 dark:text-slate-400">Loading itineraries from database...</p>
							</div>
						) : existingItineraries.length === 0 ? (
							<div className="p-8 text-center rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40">
								<p className="text-slate-700 dark:text-slate-200 font-medium">No travel itineraries found in database.</p>
								<p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Create one using the form below and it will appear here.</p>
							</div>
						) : (
							<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
								{existingItineraries.map((item) => (
									<motion.div
										key={item.id}
										initial={{ opacity: 0, y: 10 }}
										animate={{ opacity: 1, y: 0 }}
										whileHover={{ scale: 1.02 }}
										className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:shadow-lg transition-all cursor-pointer"
									>
										{item.images && item.images[0] && (
											<img
												src={item.images[0]}
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
									<label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
										Travel Itinerary
									</label>
									<Textarea
										name="itinerary"
										value={form.itinerary}
										onChange={handleInputChange}
										placeholder="Day 1: Arrival and check-in...&#10;Day 2: Beach visit...&#10;Day 3: Cultural tour..."
										rows={6}
										disabled={uploadState.uploading}
										className="w-full"
									/>
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

						{/* Action Buttons */}
						<div className="flex gap-3">
							<Button
								onClick={handleSubmit}
								disabled={uploadState.uploading}
								className="flex-1 gap-2 bg-linear-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600"
							>
								<Save className="w-4 h-4" />
								{isEditing ? 'Update' : 'Create'}
							</Button>
							<Button
								onClick={handleReset}
								variant="outline"
								disabled={uploadState.uploading}
								className="flex-1"
							>
								{isEditing ? 'Discard Changes' : 'Reset'}
							</Button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
