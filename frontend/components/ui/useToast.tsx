'use client';

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { X, CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
    id: string;
    message: string;
    type: ToastType;
    duration?: number;
}

interface ToastContextType {
    toast: {
        success: (message: string, duration?: number) => void;
        error: (message: string, duration?: number) => void;
        warning: (message: string, duration?: number) => void;
        info: (message: string, duration?: number) => void;
    };
}

const ToastContext = createContext<ToastContextType | null>(null);

const TOAST_ICONS: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />,
    error: <XCircle className="w-5 h-5 text-red-500 shrink-0" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />,
    info: <Info className="w-5 h-5 text-blue-500 shrink-0" />,
};

const TOAST_STYLES: Record<ToastType, string> = {
    success: 'bg-white border-emerald-200 shadow-emerald-100/50',
    error: 'bg-white border-red-200 shadow-red-100/50',
    warning: 'bg-white border-amber-200 shadow-amber-100/50',
    info: 'bg-white border-blue-200 shadow-blue-100/50',
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
    const [isExiting, setIsExiting] = useState(false);

    useEffect(() => {
        const dur = toast.duration ?? 4000;
        const exitTimer = setTimeout(() => setIsExiting(true), dur - 300);
        const removeTimer = setTimeout(() => onDismiss(toast.id), dur);
        return () => { clearTimeout(exitTimer); clearTimeout(removeTimer); };
    }, [toast, onDismiss]);

    return (
        <div
            className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg backdrop-blur-sm transition-all duration-300 max-w-sm
                ${TOAST_STYLES[toast.type]}
                ${isExiting ? 'opacity-0 translate-x-4 scale-95' : 'opacity-100 translate-x-0 scale-100'}
            `}
            style={{ animation: isExiting ? undefined : 'slideInRight 0.3s ease-out' }}
        >
            {TOAST_ICONS[toast.type]}
            <p className="text-sm font-medium text-gray-800 flex-1 leading-snug">{toast.message}</p>
            <button
                onClick={() => { setIsExiting(true); setTimeout(() => onDismiss(toast.id), 200); }}
                className="p-0.5 hover:bg-gray-100 rounded-md transition-colors shrink-0"
            >
                <X className="w-3.5 h-3.5 text-gray-400" />
            </button>
        </div>
    );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const idCounter = useRef(0);

    const dismiss = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const addToast = useCallback((type: ToastType, message: string, duration?: number) => {
        const id = `toast-${++idCounter.current}-${Date.now()}`;
        setToasts(prev => [...prev.slice(-4), { id, message, type, duration }]);
    }, []);

    const toast = {
        success: (msg: string, dur?: number) => addToast('success', msg, dur),
        error: (msg: string, dur?: number) => addToast('error', msg, dur),
        warning: (msg: string, dur?: number) => addToast('warning', msg, dur),
        info: (msg: string, dur?: number) => addToast('info', msg, dur),
    };

    return (
        <ToastContext.Provider value={{ toast }}>
            {children}
            {/* Toast Container */}
            <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2.5 pointer-events-auto">
                {toasts.map(t => (
                    <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
                ))}
            </div>
            <style jsx global>{`
                @keyframes slideInRight {
                    from { opacity: 0; transform: translateX(1rem) scale(0.95); }
                    to { opacity: 1; transform: translateX(0) scale(1); }
                }
            `}</style>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used within ToastProvider');
    return ctx.toast;
}
