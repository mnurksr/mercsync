'use client';

import { useState, useRef, useEffect } from 'react';
import {
    LayoutDashboard, LogOut, Settings, Bell,
    RefreshCw, Box, History, Layers
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { usePathname, useRouter } from 'next/navigation';

export default function DashboardShell({ children }: { children: React.ReactNode }) {
    const { supabase, user } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const [isRefreshing, setIsRefreshing] = useState(false);
    const navMenuRef = useRef<HTMLDivElement>(null);

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    const handleRefresh = () => {
        setIsRefreshing(true);
        window.location.reload();
    };

    const navLinks = [
        { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, rel: 'home' },
        { href: '/dashboard/products', label: 'Products', icon: Box },
        { href: '/dashboard/inventory', label: 'Inventory', icon: Layers },
        { href: '/dashboard/history', label: 'Sync History', icon: History },
        { href: '/dashboard/settings', label: 'Integrations', icon: Settings },
    ];

    // Build the native Shopify App Bridge <ui-nav-menu> via DOM
    useEffect(() => {
        if (!navMenuRef.current) return;

        const container = navMenuRef.current;
        // Clear previous
        container.innerHTML = '';

        const menu = document.createElement('ui-nav-menu');
        navLinks.forEach((link) => {
            const a = document.createElement('a');
            a.href = link.href;
            a.textContent = link.label;
            if (link.rel) a.rel = link.rel;
            menu.appendChild(a);
        });
        container.appendChild(menu);
    }, [pathname]);

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900 font-sans flex flex-col">
            {/* Native Shopify App Bridge Navigation (rendered via DOM) */}
            <div ref={navMenuRef} style={{ display: 'none' }} />

            {/* Main Content Area */}
            <main className="flex-1 min-w-0 w-full">
                {/* Global Header */}
                <header className="bg-white border-b border-gray-200 sticky top-0 z-10 h-16 flex items-center justify-between px-4 sm:px-6">
                    <div className="flex items-center gap-4">
                        <h1 className="text-xl font-bold text-gray-800 tracking-tight">
                            {navLinks.find(l => l.href === pathname)?.label || 'Dashboard'}
                        </h1>
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={handleRefresh}
                            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                            <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
                        </button>
                        <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors relative">
                            <Bell className="w-5 h-5" />
                        </button>
                        <div className="h-8 w-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-sm font-semibold text-white">
                            {user?.email?.charAt(0).toUpperCase() || 'U'}
                        </div>
                    </div>
                </header>

                {/* Page Specific Content */}
                <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
