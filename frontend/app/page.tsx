import Link from 'next/link';
import { ArrowRight, Check, Zap, ShieldCheck, Activity, BarChart3 } from 'lucide-react';
import { EtsyIcon, ShopifyIcon } from '@/components/PlatformIcons';
import { createAdminClient } from '@/utils/supabase/admin';
import { redirect } from 'next/navigation';
import { getSetupStatus } from '@/app/actions/staging';
export default async function LandingPage(props: { searchParams?: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const searchParams = await props.searchParams;
  const shop = searchParams?.shop;

  // Akıllı Yönlendirme & Tanıtım Sayfasını Gizleme
  if (typeof shop === 'string') {
    // RLS bypass via Admin client for unauthenticated but cookie-verified requests
    const supabase = createAdminClient();
    const { data: shopData } = await supabase
      .from('shops')
      .select('is_active, plan_type, shopify_connected, access_token')
      .eq('shop_domain', shop)
      .single();

    // Preserve URL params (including charge_id, host, etc) to prevent 404s breaking
    const params = new URLSearchParams();
    if (searchParams) {
      Object.entries(searchParams).forEach(([key, value]) => {
        if (typeof value === 'string') params.append(key, value);
      });
    }
    const queryString = params.toString() ? `?${params.toString()}` : '';

    if (shopData) {
      if (!shopData.is_active || !shopData.shopify_connected || !shopData.access_token) {
        redirect(`/reauth?shop=${encodeURIComponent(shop)}&target=${encodeURIComponent('/dashboard')}`);
      }

      const setupStatus = await getSetupStatus(shop);

      if (!setupStatus.isComplete) {
        redirect(`/setup${queryString}`);
      } else if (!shopData.plan_type || ['guest', 'none', 'pending', 'basic'].includes(shopData.plan_type.toLowerCase())) {
        redirect(`/billing${queryString}`);
      } else {
        redirect(`/dashboard${queryString}`);
      }
    } else {
      redirect(`/setup${queryString}`);
    }
  }

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans selection:bg-blue-100">

      {/* Header */}
      <header className="fixed w-full bg-white/90 backdrop-blur-md border-b border-gray-100 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <img src="/logo.png" alt="MercSync" width={32} height={32} className="rounded-lg" />
            <span className="text-xl font-bold tracking-tight">MercSync</span>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            <Link href="#how-it-works" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">How It Works</Link>
            <Link href="#features" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Features</Link>
            <Link href="/pricing" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Pricing</Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
              Sign In
            </Link>
            <Link
              href="/login"
              className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <main>

        {/* Hero Section - Clean & Minimal */}
        <section className="pt-32 pb-20 md:pt-40 md:pb-28">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">

            <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-gray-900 mb-6 leading-[1.1]">
              Stop Overselling Between
              <span className="block mt-2">
                <span className="text-[#F56400]">Etsy</span>
                {' & '}
                <span className="text-[#95BF47]">Shopify</span>
              </span>
            </h1>

            <p className="text-lg md:text-xl text-gray-600 mb-10 max-w-2xl mx-auto leading-relaxed">
              Automatic inventory synchronization between Shopify and Etsy. Sell on both platforms without the fear of overselling.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/login"
                className="group px-8 py-4 bg-gray-900 text-white rounded-xl font-semibold hover:bg-gray-800 transition-all flex items-center gap-2"
              >
                Start Free Trial
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <Link
                href="/pricing"
                className="px-8 py-4 text-gray-700 font-semibold hover:text-gray-900 transition-colors flex items-center gap-2"
              >
                View Pricing →
              </Link>
            </div>

            {/* Trust Indicators */}
            <div className="mt-12 flex items-center justify-center gap-8 text-sm text-gray-500">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                No credit card required
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                7-day free trial
              </div>
              <div className="hidden sm:flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                Cancel anytime
              </div>
            </div>
          </div>
        </section>

        {/* Platform Logos */}
        <section className="py-8 border-y border-gray-100">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <p className="text-center text-xs font-semibold text-gray-400 uppercase tracking-widest mb-6">Seamlessly Connects</p>
            <div className="flex items-center justify-center gap-16">
              <div className="flex items-center gap-2">
                <EtsyIcon size={28} />
                <span className="text-xl font-bold text-gray-800">Etsy</span>
              </div>
              <div className="w-8 h-[2px] bg-gray-200"></div>
              <div className="flex items-center gap-2">
                <ShopifyIcon size={28} />
                <span className="text-xl font-bold text-gray-800">Shopify</span>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="py-20 bg-gray-50">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">How It Works</h2>
              <p className="text-gray-600 max-w-xl mx-auto">Three simple steps to protect your business from overselling.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              <StepCard
                number="1"
                title="Connect Your Stores"
                description="Securely link your Shopify and Etsy accounts using official OAuth. Your credentials are never stored."
              />
              <StepCard
                number="2"
                title="Match Your Products"
                description="MercSync automatically links products between platforms using SKU and title similarity. Review matches in the staging area and confirm."
              />
              <StepCard
                number="3"
                title="Sync Automatically"
                description="Once matched, inventory syncs automatically across both platforms via webhooks and scheduled jobs. Set it and forget it."
              />
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="py-20">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Built for Multi-Channel Sellers</h2>
              <p className="text-gray-600 max-w-xl mx-auto">Everything you need to sync inventory and prevent costly overselling.</p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <FeatureItem
                icon={<Activity className="w-5 h-5 text-blue-600" />}
                title="Real-Time Inventory Sync"
                description="Stock levels update across Shopify and Etsy automatically when orders are placed, items restocked, or quantities adjusted."
              />
              <FeatureItem
                icon={<ShieldCheck className="w-5 h-5 text-green-600" />}
                title="Overselling Protection"
                description="Automatic stock deduction prevents selling products you don't have. Save on refunds and protect your seller reputation."
              />
              <FeatureItem
                icon={<Zap className="w-5 h-5 text-yellow-600" />}
                title="Smart Product Matching"
                description="Links products between Shopify and Etsy using SKU matching and title similarity scoring with ~95% accuracy."
              />
              <FeatureItem
                icon={<BarChart3 className="w-5 h-5 text-purple-600" />}
                title="Multi-Location & Price Rules"
                description="Tracks inventory across multiple Shopify locations and supports cross-platform price rules with percentage or fixed adjustments."
              />
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-20">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
              Ready to Stop Losing Money?
            </h2>
            <p className="text-lg text-gray-600 mb-10 max-w-xl mx-auto">
              Join sellers who protect their business with real-time inventory sync. Start your free trial today.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/login"
                className="px-8 py-4 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-800 transition-all"
              >
                Start 7-Day Free Trial
              </Link>
              <Link
                href="/pricing"
                className="px-8 py-4 text-gray-700 font-semibold hover:text-gray-900 transition-colors"
              >
                View Pricing
              </Link>
            </div>
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="bg-gray-50 border-t border-gray-100 py-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-start gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <img src="/logo.png" alt="MercSync" width={24} height={24} className="rounded" />
                <span className="text-lg font-bold text-gray-900">MercSync</span>
              </div>
              <p className="text-sm text-gray-500 max-w-xs">
                Real-time inventory sync for Shopify and Etsy sellers.
              </p>
            </div>

            <div className="flex gap-12">
              <div>
                <h4 className="font-semibold text-gray-900 mb-3 text-sm">Product</h4>
                <ul className="space-y-2">
                  <li><Link href="/pricing" className="text-sm text-gray-500 hover:text-gray-900">Pricing</Link></li>
                  <li><Link href="/login" className="text-sm text-gray-500 hover:text-gray-900">Dashboard</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 mb-3 text-sm">Legal</h4>
                <ul className="space-y-2">
                  <li><Link href="/privacy" className="text-sm text-gray-500 hover:text-gray-900">Privacy</Link></li>
                  <li><Link href="/terms" className="text-sm text-gray-500 hover:text-gray-900">Terms</Link></li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-gray-200">
            <p className="text-sm text-gray-400 text-center">
              © {new Date().getFullYear()} MercSync. All rights reserved.
            </p>
            <p className="text-xs text-gray-400 text-center mt-2">
              The term &apos;Etsy&apos; is a trademark of Etsy, Inc. This application uses the Etsy API but is not endorsed or certified by Etsy, Inc.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function StepCard({ number, title, description }: { number: string, title: string, description: string }) {
  return (
    <div className="text-center">
      <div className="w-12 h-12 bg-gray-900 text-white rounded-full flex items-center justify-center text-lg font-bold mx-auto mb-6">
        {number}
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600 text-sm leading-relaxed">{description}</p>
    </div>
  );
}

function FeatureItem({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="flex gap-4 p-6 bg-gray-50 rounded-xl">
      <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shrink-0 shadow-sm">
        {icon}
      </div>
      <div>
        <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
        <p className="text-gray-600 text-sm leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
