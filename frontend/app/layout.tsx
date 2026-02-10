'use client';

import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { Package, Settings, LogOut } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { usePathname } from "next/navigation";

const inter = Inter({ subsets: ["latin"] });

// Separate Shell component to use hooks
const AppShell = ({ children }: { children: React.ReactNode }) => {
  const { user, supabase } = useAuth();
  const pathname = usePathname();

  // Hide global header on these routes as they have their own implementation
  const hideHeaderRoutes = ['/login', '/', '/dashboard', '/privacy', '/terms', '/setup'];
  const shouldHideHeader = hideHeaderRoutes.includes(pathname) || pathname.startsWith('/dashboard');

  if (shouldHideHeader) return <>{children}</>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Navbar */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">S</div>
            <span className="font-bold text-gray-800 text-lg">MercSync</span>
          </div>

          {user && (
            <nav className="flex items-center gap-6">
              <Link href="/" className={`flex items-center gap-2 text-sm font-medium ${pathname === '/' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-900'}`}>
                <Package className="w-4 h-4" /> Dashboard
              </Link>
              <Link href="/settings" className={`flex items-center gap-2 text-sm font-medium ${pathname === '/settings' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-900'}`}>
                <Settings className="w-4 h-4" /> Entegrasyonlar
              </Link>
              <button onClick={() => supabase.auth.signOut()} className="flex items-center gap-2 text-sm font-medium text-red-500 hover:text-red-700 ml-4">
                <LogOut className="w-4 h-4" /> Çıkış
              </button>
            </nav>
          )}
        </div>
      </header>

      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
