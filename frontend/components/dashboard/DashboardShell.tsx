'use client';

import { useState, useEffect, useRef } from 'react';
import {
    Settings,
    RefreshCw, Box, History, Layers, LayoutDashboard
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { usePathname, useRouter } from 'next/navigation';
import NotificationBell from './NotificationBell';

export default function DashboardShell({ children }: { children: React.ReactNode }) {
    const { supabase, user } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const [isRefreshing, setIsRefreshing] = useState(false);
    const navRef = useRef<HTMLDivElement>(null);

    const handleRefresh = () => {
        setIsRefreshing(true);
        window.location.reload();
    };

    const navLinks = [
        { href: '/dashboard', label: 'Overview', rel: 'home' },
        { href: '/dashboard/products', label: 'Products' },
        { href: '/dashboard/inventory', label: 'Inventory' },
        { href: '/dashboard/history', label: 'Sync History' },
        { href: '/dashboard/settings', label: 'Settings' },
    ];

    // Build Shopify App Bridge <ui-nav-menu> via DOM.
    // App Bridge CDN is loaded globally in layout.tsx <head>, so it's already available.
    useEffect(() => {
        const container = navRef.current;
        if (!container) return;

        if (window.top === window.self) return;

        // Remove any previously created menu
        const existing = container.querySelector('ui-nav-menu');
        if (existing) existing.remove();

        try {
            const menu = document.createElement('ui-nav-menu');
            navLinks.forEach((link) => {
                const a = document.createElement('a');
                a.href = link.href;
                a.textContent = link.label;
                if (link.rel) a.setAttribute('rel', link.rel);
                menu.appendChild(a);
            });
            container.appendChild(menu);
        } catch (error) {
            console.error('DashboardShell: failed to mount ui-nav-menu', error);
        }

        return () => {
            const old = container.querySelector('ui-nav-menu');
            if (old) old.remove();
        };
    }, []);

    // Page title
    const pageTitle = navLinks.find(l => l.href === pathname)?.label || 'Dashboard';

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900 font-sans flex flex-col">
            {/* Container for Shopify App Bridge ui-nav-menu */}
            <div ref={navRef} />

            {/* Main Content Area */}
            <main className="flex-1 min-w-0 w-full">
                {/* Global Header */}
                <header className="bg-white border-b border-gray-200 sticky top-0 z-10 h-16 flex items-center justify-between px-4 sm:px-6">
                    <div className="flex items-center gap-4">
                        <h1 className="text-xl font-bold text-gray-800 tracking-tight">
                            {pageTitle}
                        </h1>
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={handleRefresh}
                            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                            <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
                        </button>
                        <NotificationBell />
                    </div>
                </header>

                {/* Page Specific Content */}
                <div className="mx-auto px-4 sm:px-8 py-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
