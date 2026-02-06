import Link from 'next/link';
import { ArrowRight, Box, Zap, Globe2, ShieldCheck, ScanBarcode, Activity } from 'lucide-react';

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
        </div>

        {/* Free Tool CTA Section - New Addition */}
        <div className="mt-16 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-3xl p-8 md:p-12 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-white/10 transition-colors duration-700"></div>

            <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8 text-center md:text-left">
              <div className="flex-1">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-bold uppercase tracking-wider mb-4 border border-blue-500/30">
                  <Zap className="w-3 h-3 text-yellow-400" /> Free Tool
                </div>
                <h2 className="text-3xl font-bold text-white mb-3">Calculate Your Overselling Risk</h2>
                <p className="text-gray-300 text-lg">
                  Upload your inventory files and instantly see how much money you're losing to sync errors. <span className="font-semibold text-white">No sign up required.</span>
                </p>
              </div>
              <Link
                href="/dashboard/mapper"
                className="shrink-0 px-8 py-4 bg-white text-gray-900 font-bold rounded-xl hover:bg-gray-100 hover:scale-105 transition-all shadow-xl shadow-black/20 flex items-center gap-2"
              >
                Success Calculator
                <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </div>

        {/* How MercSync Works */}
        <div className="mt-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">How MercSync Works</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Secure, server-side synchronization logic designed for stability.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              icon={<ShieldCheck className="w-6 h-6 text-blue-600" />}
              title="1. Connect Securely"
              description="Link your Shopify and Etsy accounts using official OAuth 2.0 protocols. We never see or store your login credentials."
            />
            <FeatureCard
              icon={<ScanBarcode className="w-6 h-6 text-indigo-600" />}
              title="2. Smart SKU Mapping"
              description="MercSync automatically detects matching products between platforms using SKUs. No manual linking required."
            />
            <FeatureCard
              icon={<Activity className="w-6 h-6 text-green-600" />}
              title="3. Real-Time Webhooks"
              description="When a sale occurs on Shopify, we instantly catch the webhook and update your Etsy inventory within seconds to prevent overselling."
            />
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
              title="2-Way Inventory Sync"
              description="When a sale happens on Shopify, MercSync automatically updates your Etsy inventory quantity to prevent double-selling."
            />
            <FeatureCard
              icon={<Box className="w-6 h-6 text-blue-500" />}
              title="Order Synchronization"
              description="Automatically pull Etsy orders into your Shopify dashboard for centralized fulfillment and tracking."
            />
            <FeatureCard
              icon={<Globe2 className="w-6 h-6 text-green-500" />}
              title="SKU Mapping"
              description="Intelligently link your products between platforms using SKUs, titles, or manual mapping rules"
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
            <p className="mt-2 text-xs text-gray-400">
              The term 'Etsy' is a trademark of Etsy, Inc. This Application uses Etsy's API, but is not endorsed or certified by Etsy.
            </p>
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
