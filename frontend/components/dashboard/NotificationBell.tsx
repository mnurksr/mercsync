'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, Clock, AlertTriangle, AlertCircle, RefreshCw, PackageX, KeyRound, TrendingDown } from 'lucide-react';
import { getNotifications, markAsRead, markAllAsRead, type NotificationItem } from '@/app/actions/notifications';
import { useRouter } from 'next/navigation';

export default function NotificationBell() {
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();
    const dropdownRef = useRef<HTMLDivElement>(null);

    const unreadCount = notifications.filter(n => !n.is_read).length;

    const loadNotifications = useCallback(async () => {
        try {
            const data = await getNotifications();
            setNotifications(data);
        } catch (error) {
            console.error('Failed to load notifications:', error);
        }
    }, []);

    useEffect(() => {
        const initialLoad = setTimeout(loadNotifications, 0);
        
        // Polling every 1 minute for new notifications
        const interval = setInterval(loadNotifications, 60000);
        
        // Click outside to close
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        
        return () => {
            clearTimeout(initialLoad);
            clearInterval(interval);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [loadNotifications]);

    const handleOpen = () => {
        if (!isOpen) { // Opening
            loadNotifications();
        }
        setIsOpen(!isOpen);
    };

    const handleReadTask = async (id: string, url: string | null) => {
        try {
            // Optimistic UI update
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
            await markAsRead(id);
            if (url) {
                setIsOpen(false);
                router.push(url);
            }
        } catch {}
    };

    const handleReadAll = async () => {
        if (unreadCount === 0) return;
        setIsLoading(true);
        try {
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            await markAllAsRead();
        } catch {}
        setIsLoading(false);
    };

    const timeAgo = (dateStr: string) => {
        const date = new Date(dateStr);
        const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
        if (seconds < 60) return `${seconds}s ago`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d ago`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'stock_zero': return <PackageX className="w-5 h-5 text-red-500" />;
            case 'sync_failed': return <AlertTriangle className="w-5 h-5 text-red-500" />;
            case 'oversell_risk': return <TrendingDown className="w-5 h-5 text-amber-500" />;
            case 'token_expiring': return <KeyRound className="w-5 h-5 text-violet-500" />;
            case 'system_alert': return <AlertCircle className="w-5 h-5 text-blue-500" />;
            default: return <Bell className="w-5 h-5 text-gray-500" />;
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={handleOpen}
                className="p-2 text-gray-400 hover:text-gray-600 transition-colors relative"
            >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                    <span className="absolute top-1 right-1.5 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full"></span>
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden z-50">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                        <div className="flex items-center gap-2">
                            <h3 className="font-bold text-gray-900">Notifications</h3>
                            {unreadCount > 0 && (
                                <span className="px-2 py-0.5 bg-red-100 text-red-600 text-[10px] font-black rounded-full">
                                    {unreadCount} NEW
                                </span>
                            )}
                        </div>
                        {unreadCount > 0 && (
                            <button
                                onClick={handleReadAll}
                                disabled={isLoading}
                                className="text-xs font-bold text-gray-500 hover:text-gray-900 transition-colors"
                            >
                                {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Mark all read'}
                            </button>
                        )}
                    </div>

                    <div className="max-h-[70vh] overflow-y-auto divide-y divide-gray-50">
                        {notifications.length === 0 ? (
                            <div className="p-8 text-center">
                                <Bell className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                                <p className="text-sm font-medium text-gray-400">You&apos;re all caught up!</p>
                            </div>
                        ) : (
                            notifications.map((item) => (
                                <div
                                    key={item.id}
                                    onClick={() => handleReadTask(item.id, item.action_url)}
                                    className={`p-4 flex gap-3 transition-colors ${item.action_url ? 'cursor-pointer hover:bg-gray-50' : ''} ${!item.is_read ? 'bg-blue-50/20' : ''}`}
                                >
                                    <div className={`mt-0.5 shrink-0 ${!item.is_read ? 'opacity-100' : 'opacity-50'}`}>
                                        {getIcon(item.type)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className={`text-sm ${!item.is_read ? 'font-bold text-gray-900' : 'font-medium text-gray-600'}`}>
                                            {item.title}
                                        </h4>
                                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">
                                            {item.message}
                                        </p>
                                        <div className="flex items-center gap-1.5 mt-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                            <Clock className="w-3 h-3" />
                                            {timeAgo(item.created_at)}
                                        </div>
                                    </div>
                                    {!item.is_read && (
                                        <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
