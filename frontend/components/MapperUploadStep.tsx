'use client';

import { useState, useCallback, useRef } from 'react';
import { Upload, X, FileSpreadsheet, Loader2, CheckCircle, AlertCircle, ShoppingBag, Store } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface MapperUploadStepProps {
    onSuccess: (data: any) => void;
}

export default function MapperUploadStep({ onSuccess }: MapperUploadStepProps) {
    const [files, setFiles] = useState<{ file: File; type: 'shopify' | 'etsy' | 'unknown' }[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Platform detection heuristic
    const detectPlatform = (filename: string): 'shopify' | 'etsy' | 'unknown' => {
        const lower = filename.toLowerCase();
        if (lower.includes('shopify') || lower.includes('product_export')) return 'shopify';
        if (lower.includes('etsy')) return 'etsy';
        return 'unknown';
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            processFiles(Array.from(e.target.files));
        }
    };

    const processFiles = (newFiles: File[]) => {
        setError(null);

        let validFiles: { file: File; type: 'shopify' | 'etsy' | 'unknown' }[] = [...files];

        for (const file of newFiles) {
            // Check Limits
            if (validFiles.length >= 2) {
                setError('maximum 2 files allowed.');
                break;
            }
            // Check Size (3MB)
            if (file.size > 3 * 1024 * 1024) {
                setError(`${file.name} is too large (max 3MB).`);
                continue;
            }
            // Check Type
            if (!file.name.endsWith('.csv')) {
                setError('Only CSV files are allowed.');
                continue;
            }

            // Detect & Add
            const type = detectPlatform(file.name);
            validFiles.push({ file, type });
        }

        // Auto-assign types if we have 2 files and they are ambiguous
        if (validFiles.length === 2) {
            const hasShopify = validFiles.some(f => f.type === 'shopify');
            const hasEtsy = validFiles.some(f => f.type === 'etsy');

            // If we're missing explicit types, try to infer by slot
            if (!hasShopify && !hasEtsy) {
                validFiles[0].type = 'shopify';
                validFiles[1].type = 'etsy';
            } else if (!hasShopify && hasEtsy) {
                validFiles.find(f => f.type === 'unknown')!.type = 'shopify';
            } else if (hasShopify && !hasEtsy) {
                validFiles.find(f => f.type === 'unknown')!.type = 'etsy';
            }
        }

        setFiles(validFiles);
        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
        setError(null);
    };

    const handleUpload = async () => {
        if (files.length !== 2) return;

        setIsLoading(true);
        setError(null);

        const formData = new FormData();

        // Find specific files or fallback to index
        const shopifyFile = files.find(f => f.type === 'shopify')?.file || files[0].file;
        const etsyFile = files.find(f => f.type === 'etsy')?.file || files[1].file;

        formData.append('shopify_csv', shopifyFile);
        formData.append('etsy_csv', etsyFile);

        try {
            const response = await fetch('https://api.mercsync.com/webhook/match-products', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) throw new Error('Upload failed');

            const data = await response.json();

            // Artificial delay for "premium feel" if response is too fast
            await new Promise(r => setTimeout(r, 800));

            onSuccess(data);
        } catch (err) {
            console.error(err);
            setError('Failed to analyze files. Please check compatibility.');
        } finally {
            setIsLoading(false);
        }
    };

    // Drag handlers
    const [isDragging, setIsDragging] = useState(false);
    const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
    const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        processFiles(Array.from(e.dataTransfer.files));
    };

    return (
        <div className="w-full max-w-2xl mx-auto">
            <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Upload Inventory Files</h2>
                <p className="text-gray-500 text-sm">Upload your Shopify and Etsy CSV exports to start matching.</p>
            </div>

            {/* Drop Zone */}
            <motion.div
                layout
                className={`
                    relative border-2 border-dashed rounded-3xl p-10 text-center transition-all duration-300
                    flex flex-col items-center justify-center min-h-[250px]
                    ${isDragging ? 'border-blue-500 bg-blue-50/50 scale-[1.02]' : 'border-gray-200 bg-white hover:border-gray-300'}
                    ${error ? 'border-red-300 bg-red-50/30' : ''}
                `}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
            >
                <input
                    type="file"
                    id="file-upload"
                    multiple
                    accept=".csv"
                    onChange={handleFileSelect}
                    className="hidden"
                    ref={fileInputRef}
                />

                <AnimatePresence>
                    {files.length < 2 ? (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="flex flex-col items-center pointer-events-none"
                        >
                            <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-6 shadow-sm ring-8 ring-blue-50/50">
                                <Upload className="w-10 h-10" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Drag & Drop files here</h3>
                            <p className="text-sm text-gray-500 mb-6 max-w-xs mx-auto leading-relaxed">
                                Support .csv files up to 3MB. <br />
                                <span className="text-xs text-gray-400">Required: 1 Shopify Export, 1 Etsy Export</span>
                            </p>
                            <label
                                htmlFor="file-upload"
                                className="pointer-events-auto px-6 py-2.5 bg-white border border-gray-200 text-gray-700 font-semibold rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-sm cursor-pointer"
                            >
                                Select Files
                            </label>
                        </motion.div>
                    ) : (
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="flex flex-col items-center"
                        >
                            <div className="w-20 h-20 bg-green-50 text-green-600 rounded-full flex items-center justify-center mb-4 shadow-sm ring-8 ring-green-50/50">
                                <CheckCircle className="w-10 h-10" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900">Ready to Analyze</h3>
                            <p className="text-sm text-gray-500 mt-2">All files loaded successfully.</p>
                        </motion.div>
                    )}
                </AnimatePresence>

            </motion.div>

            {/* File List */}
            <div className="mt-8 space-y-3">
                <AnimatePresence>
                    {files.map((file, index) => (
                        <motion.div
                            key={`${file.file.name}-${index}`}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                            className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm flex items-center gap-4 group hover:shadow-md transition-shadow"
                        >
                            {/* Icon based on Type */}
                            <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${file.type === 'shopify' ? 'bg-green-50 text-green-600' :
                                    file.type === 'etsy' ? 'bg-orange-50 text-orange-600' : 'bg-gray-100 text-gray-500'
                                }`}>
                                {file.type === 'shopify' ? <ShoppingBag className="w-6 h-6" /> :
                                    file.type === 'etsy' ? <Store className="w-6 h-6" /> :
                                        <FileSpreadsheet className="w-6 h-6" />}
                            </div>

                            <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-semibold text-gray-900 truncate">{file.file.name}</h4>
                                <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                                    <span className="uppercase font-bold tracking-wider text-[10px] bg-gray-100 px-1.5 py-0.5 rounded">
                                        {(file.file.size / 1024 / 1024).toFixed(2)} MB
                                    </span>
                                    <span>•</span>
                                    <span className={`capitalize font-medium ${file.type === 'shopify' ? 'text-green-600' :
                                            file.type === 'etsy' ? 'text-orange-600' : 'text-gray-400'
                                        }`}>
                                        {file.type === 'unknown' ? 'Unknown Source' : `${file.type} Export`}
                                    </span>
                                </div>
                            </div>

                            <button
                                onClick={() => removeFile(index)}
                                className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Error Message */}
            <AnimatePresence>
                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="mt-4 p-4 bg-red-50 rounded-xl flex items-start gap-3 text-red-700"
                    >
                        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                        <div className="text-sm font-medium">{error}</div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Action Button */}
            <motion.div className="mt-8" layout>
                <button
                    onClick={handleUpload}
                    disabled={isLoading || files.length !== 2}
                    className="w-full py-4 bg-gray-900 hover:bg-black text-white rounded-2xl font-bold text-lg shadow-xl shadow-gray-200 disabled:opacity-50 disabled:shadow-none hover:-translate-y-1 active:translate-y-0 transition-all flex items-center justify-center gap-3"
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Processing Inventory...
                        </>
                    ) : (
                        'Start Mapping'
                    )}
                </button>
            </motion.div>

        </div>
    );
}
