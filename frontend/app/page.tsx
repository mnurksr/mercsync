import Link from 'next/link';
import { ArrowRight, Box, Zap, Globe2, BarChart3 } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans selection:bg-blue-100">

      {/* Header */}
      <header className="fixed w-full bg-white/80 backdrop-blur-md border-b border-gray-100 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">M</div>
            <span className="text-xl font-bold tracking-tight">MercSync</span>
          </div>
          <nav className="flex items-center gap-6">
            <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors">
              Sign In
            </Link>
            <Link
              href="/login"
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200"
            >
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      <main className="pt-32 pb-16">

        {/* Hero Section */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold uppercase tracking-wider mb-6 border border-blue-100">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            Automation 2.0 Is Live
          </div>

          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-gray-900 mb-6 max-w-4xl mx-auto leading-tight">
            Real-Time Inventory Sync for <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">Shopify & Etsy Sellers</span>
          </h1>

          <p className="text-lg text-gray-600 mb-10 max-w-2xl mx-auto leading-relaxed">
            Stop overselling. Automatically synchronize stock levels and orders between your Shopify store and Etsy shop in milliseconds. No more manual CSV uploads.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/login"
              className="group px-8 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center gap-2"
            >
              Connect Your Stores
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <a
              href="#features"
              className="px-8 py-3 bg-gray-50 text-gray-700 rounded-xl font-medium hover:bg-gray-100 transition-colors border border-gray-200"
            >
              Learn More
            </a>
          </div>

          {/* Hero Image / Dashboard Preview */}
          <div className="mt-16 relative mx-auto max-w-5xl">
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-2xl blur opacity-30"></div>
            <div className="relative bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden aspect-[16/9] bg-gray-50 flex flex-col">
              {/* Mock Browser Header */}
              <div className="h-8 bg-gray-100 border-b border-gray-200 flex items-center px-4 gap-2">
                <div className="w-3 h-3 rounded-full bg-red-400"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                <div className="w-3 h-3 rounded-full bg-green-400"></div>
              </div>

              {/* Mock Dashboard Content */}
              <div className="flex-1 p-6 flex gap-6">
                {/* Sidebar */}
                <div className="w-48 bg-gray-50 rounded-lg border border-gray-100 hidden sm:block p-4 space-y-3">
                  <div className="h-8 bg-blue-100 rounded w-3/4 mb-4"></div>
                  <div className="h-6 bg-gray-200 rounded w-full"></div>
                  <div className="h-6 bg-gray-200 rounded w-full"></div>
                  <div className="h-6 bg-gray-200 rounded w-5/6"></div>
                </div>

                {/* Main Area */}
                <div className="flex-1 space-y-6">
                  {/* Stats Header */}
                  <div className="flex gap-4">
                    <div className="flex-1 h-24 bg-white rounded-lg border border-gray-100 p-4 shadow-sm">
                      <div className="h-4 bg-gray-100 rounded w-1/2 mb-2"></div>
                      <div className="h-8 bg-blue-50 rounded w-1/3"></div>
                    </div>
                    <div className="flex-1 h-24 bg-white rounded-lg border border-gray-100 p-4 shadow-sm">
                      <div className="h-4 bg-gray-100 rounded w-1/2 mb-2"></div>
                      <div className="h-8 bg-green-50 rounded w-1/3"></div>
                    </div>
                    <div className="flex-1 h-24 bg-white rounded-lg border border-gray-100 p-4 shadow-sm">
                      <div className="h-4 bg-gray-100 rounded w-1/2 mb-2"></div>
                      <div className="h-8 bg-yellow-50 rounded w-1/3"></div>
                    </div>
                  </div>

                  {/* Table Mock */}
                  <div className="bg-white rounded-lg border border-gray-100 shadow-sm flex-1 p-4 space-y-3">
                    <div className="flex justify-between mb-4">
                      <div className="h-6 bg-gray-100 rounded w-1/4"></div>
                      <div className="h-6 bg-green-100 rounded w-16"></div>
                    </div>
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="flex gap-4 items-center">
                        <div className="h-8 w-8 bg-gray-100 rounded"></div>
                        <div className="flex-1 h-4 bg-gray-50 rounded"></div>
                        <div className="w-20 h-4 bg-gray-50 rounded"></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Brand/Integration Logos */}
        <div className="mt-24 py-10 border-y border-gray-100 bg-gray-50/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <p className="text-center text-sm font-semibold text-gray-400 uppercase tracking-widest mb-8">Integrations</p>
            <div className="flex flex-wrap justify-center gap-12 md:gap-24 opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
              <span className="text-2xl font-bold text-gray-700">Shopify</span>
              <span className="text-2xl font-bold text-gray-700">Etsy</span>
            </div>
          </div>
        </div>

        {/* Features Section */}
        <div id="features" className="py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Why MercSync?</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Designed for the speed and reliability modern e-commerce needs.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              icon={<Zap className="w-6 h-6 text-yellow-500" />}
              title="Instant Sync"
              description="Your inventory and order data updates between marketplaces in milliseconds."
            />
            <FeatureCard
              icon={<Box className="w-6 h-6 text-blue-500" />}
              title="Central Management"
              description="Control your products and inventory across all platforms from a single panel."
            />
            <FeatureCard
              icon={<Globe2 className="w-6 h-6 text-green-500" />}
              title="Global Scale"
              description="Fully compatible with worldwide marketplaces and logistics networks."
            />
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-100 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-gray-900 rounded flex items-center justify-center text-white text-xs font-bold">M</div>
            <span className="text-lg font-bold text-gray-900">MercSync</span>
          </div>
          <div className="text-sm text-gray-500">
            &copy; {new Date().getFullYear()} MercSync. All rights reserved.
          </div>
          <div className="flex gap-6">
            <Link href="/privacy" className="text-gray-400 hover:text-gray-900 transition-colors text-sm">Privacy Policy</Link>
            <Link href="/terms" className="text-gray-400 hover:text-gray-900 transition-colors text-sm">Terms of Service</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="p-6 rounded-2xl bg-white border border-gray-100 hover:border-blue-100 hover:shadow-lg hover:shadow-blue-50 transition-all group">
      <div className="w-12 h-12 rounded-lg bg-gray-50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600 leading-relaxed">
        {description}
      </p>
    </div>
  )
}
