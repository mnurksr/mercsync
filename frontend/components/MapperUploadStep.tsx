'use client';

import { useState, useRef } from 'react';
import { Upload, X, FileSpreadsheet, Loader2, AlertCircle, ShoppingBag, Store, ChevronDown, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface MapperUploadStepProps {
    onSuccess: (data: any) => void;
}

type PlatformType = 'shopify' | 'etsy' | null;

interface UploadedFile {
    id: string;
    file: File;
    type: PlatformType;
}

export default function MapperUploadStep({ onSuccess }: MapperUploadStepProps) {
    const [files, setFiles] = useState<UploadedFile[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            processFiles(Array.from(e.target.files));
        }
    };

    const processFiles = (newFiles: File[]) => {
        setError(null);
        let updatedFiles: UploadedFile[] = [...files];

        for (const file of newFiles) {
            if (updatedFiles.length >= 2) {
                setError('Maximum 2 files allowed.');
                break;
            }
            if (file.size > 3 * 1024 * 1024) {
                setError(`${file.name} is too large (max 3MB).`);
                continue;
            }
            if (!file.name.endsWith('.csv')) {
                setError('Only CSV files are allowed.');
                continue;
            }

            // Smart Detection Logic (Visual Gesture Only)
            let detectedType: PlatformType = null;
            const lowerName = file.name.toLowerCase();
            if (lowerName.includes('etsy')) {
                detectedType = 'etsy';
            } else if (lowerName.includes('shopify') || lowerName.includes('product_export')) {
                detectedType = 'shopify';
            }

            updatedFiles.push({
                id: Math.random().toString(36).substr(2, 9),
                file,
                type: detectedType
            });
        }
        setFiles(updatedFiles);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const removeFile = (id: string) => {
        setFiles(prev => prev.filter(f => f.id !== id));
        setError(null);
    };

    const handleUpload = async () => {
        if (files.length !== 2) {
            setError('Please upload exactly 2 files (Shopify & Etsy).');
            return;
        }

        setIsLoading(true);
        setError(null);

        const formData = new FormData();

        // Intelligent Mapping based on detected type, fallback to order
        const shopifyFile = files.find(f => f.type === 'shopify') || files[0];
        const etsyFile = files.find(f => f.type === 'etsy') || files[1];

        // If both happen to be the same file due to fallback logic above (e.g. both unknown), ensure we send distinct files
        // This is a basic heuristic. Ideally n8n handles the keys.
        if (shopifyFile.id === etsyFile.id) {
            formData.append('shopify_csv', files[0].file);
            formData.append('etsy_csv', files[1].file);
        } else {
            formData.append('shopify_csv', shopifyFile.file);
            formData.append('etsy_csv', etsyFile.file);
        }

        try {
            const response = await fetch('https://api.mercsync.com/webhook/match-products', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) throw new Error('Upload failed');

            const data = await response.json();
            // Artificial delay for premium feel
            await new Promise(r => setTimeout(r, 1500));
            onSuccess(data);
        } catch (err) {
            console.error(err);
            setError('Failed to analyze files. Please ensure you uploaded the correct formats.');
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

    const isReady = files.length === 2;

    return (
        <div className="w-full max-w-2xl mx-auto">
            <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Upload Inventory Files</h2>
                <p className="text-gray-500 text-sm">Upload your <b>product_export</b> and <b>EtsyListingsDownload</b> files.</p>
            </div>

            {/* Drop Zone */}
            <motion.div
                layout
                className={`
                    relative border-2 border-dashed rounded-3xl p-8 text-center transition-all duration-300
                    flex flex-col items-center justify-center min-h-[200px]
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

                <div className="pointer-events-none">
                    <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4 mx-auto shadow-sm">
                        <Upload className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-1">Drag & Drop files</h3>
                    <p className="text-xs text-gray-400 mb-4">
                        Max 2 files, 3MB each
                    </p>
                </div>

                <label
                    htmlFor="file-upload"
                    className="px-6 py-2.5 bg-white border border-gray-200 text-gray-700 font-semibold rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-sm cursor-pointer z-10"
                >
                    Select Files
                </label>
            </motion.div>

            {/* File List */}
            <div className="mt-8 space-y-3">
                <AnimatePresence>
                    {files.map((file) => (
                        <motion.div
                            key={file.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                            className={`bg-white rounded-xl border p-2 pr-4 shadow-sm flex items-center gap-4 transition-colors ${file.type === 'shopify' ? 'border-green-200 bg-green-50/30' :
                                    file.type === 'etsy' ? 'border-orange-200 bg-orange-50/30' :
                                        'border-gray-200'
                                }`}
                        >
                            {/* Visual Indicator - Gesture Only */}
                            <div className={`w-14 h-14 rounded-lg flex items-center justify-center shrink-0 transition-colors ${file.type === 'shopify' ? 'bg-green-100 text-green-600' :
                                    file.type === 'etsy' ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-400'
                                }`}>
                                {file.type === 'shopify' ? <ShoppingBag className="w-6 h-6" /> :
                                    file.type === 'etsy' ? <Store className="w-6 h-6" /> :
                                        <FileSpreadsheet className="w-6 h-6" />}
                            </div>

                            <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-semibold text-gray-900 truncate">{file.file.name}</h4>
                                <div className="flex items-center gap-3 mt-1.5">
                                    {/* Gesture Badges */}
                                    {file.type ? (
                                        <div className="flex items-center gap-1.5">
                                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wide flex items-center gap-1 ${file.type === 'shopify' ? 'bg-white text-green-700 shadow-sm' : 'bg-white text-orange-700 shadow-sm'
                                                }`}>
                                                {file.type === 'shopify' ? 'Shopify' : 'Etsy'}
                                            </span>
                                        </div>
                                    ) : (
                                        <span className="text-[10px] text-gray-400 font-medium bg-gray-100 px-2 py-0.5 rounded-full">
                                            Ready to Upload
                                        </span>
                                    )}
                                    <span className="text-[10px] text-gray-400 font-mono ml-auto">
                                        {(file.file.size / 1024).toFixed(0)}KB
                                    </span>
                                </div>
                            </div>

                            <button
                                onClick={() => removeFile(file.id)}
                                className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            <AnimatePresence>
                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="mt-4 p-4 bg-red-50 rounded-xl flex items-start gap-3 text-red-700"
                    >
                        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                        <div className="text-sm font-medium">{error}</div>
                    </motion.div>
                )}
            </AnimatePresence>

            <motion.div className="mt-8" layout>
                <button
                    onClick={handleUpload}
                    disabled={isLoading || !isReady}
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
