'use client';

import { useState } from 'react';
import {
    LayoutDashboard, LogOut, Settings, Bell,
    RefreshCw, Box, History, Layers
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';

export default function DashboardShell({ children }: { children: React.ReactNode }) {
    const { supabase, user } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    const handleRefresh = () => {
        setIsRefreshing(true);
        window.location.reload();
    };

    const navLinks = [
        { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
        { href: '/dashboard/products', label: 'Products', icon: Box },
        { href: '/dashboard/inventory', label: 'Inventory', icon: Layers },
        { href: '/dashboard/history', label: 'Sync History', icon: History },
        { href: '/dashboard/settings', label: 'Integrations', icon: Settings },
    ];

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900 font-sans flex">
            {/* Sidebar */}
            <aside className="w-64 bg-white border-r border-gray-200 hidden md:flex flex-col fixed top-0 left-0 h-screen z-20">
                <div className="h-16 flex items-center px-6 border-b border-gray-100">
                    <Link href="/" className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center text-white font-bold text-sm">M</div>
                        <span className="text-xl font-bold tracking-tight">MerSync</span>
                    </Link>
                </div>

                <nav className="p-4 space-y-1 flex-1">
                    {navLinks.map((link) => {
                        const Icon = link.icon;
                        const isActive = pathname === link.href;

                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${isActive
                                    ? 'bg-blue-50 text-blue-700'
                                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                    }`}
                            >
                                <Icon className="w-5 h-5" />
                                {link.label}
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-gray-100">
                    <button
                        onClick={handleSignOut}
                        className="flex items-center gap-3 px-4 py-3 w-full text-red-600 hover:bg-red-50 rounded-xl font-medium transition-colors"
                    >
                        <LogOut className="w-5 h-5" />
                        Sign Out
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 min-w-0 md:ml-64">
                {/* Global Header */}
                <header className="bg-white border-b border-gray-200 sticky top-0 z-10 h-16 flex items-center justify-between px-4 sm:px-8">
                    <div>
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
                            {/* <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border border-white"></span> */}
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
