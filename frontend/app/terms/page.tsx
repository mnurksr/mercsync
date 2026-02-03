import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function TermsPage() {
    return (
        <div className="min-h-screen bg-white text-gray-900 font-sans py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto">
                <div className="mb-8">
                    <Link href="/" className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Go Back
                    </Link>
                </div>

                <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-8">Terms of Service</h1>

                <div className="prose prose-blue max-w-none text-gray-600 leading-relaxed">
                    <p className="mb-4"><strong>Effective Date: February 03, 2026</strong></p>
                    <p className="mb-4">By installing or using MercSync, you agree to these Terms.</p>

                    <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">1. Service Scope</h2>
                    <p className="mb-4">MercSync provides automation tools for Shopify and Etsy. Our service is strictly a data connector between your store and your external systems.</p>

                    <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">2. Billing & Price Transparency</h2>
                    <p className="mb-4">In accordance with Shopify's 2026 Billing Transparency Requirements, we will provide you with at least 30 days' advance notice before implementing any price changes to your current subscription plan.</p>

                    <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">3. API Usage & Data Integrity</h2>
                    <p className="mb-4">We access your data via Shopify's official APIs and follow all security protocols, including HTTPS encryption and secure credential management. You are responsible for ensuring the accuracy of the external systems (ERP/Accounting) you connect.</p>

                    <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">4. Limitation of Liability</h2>
                    <p className="mb-4">MercSync shall not be liable for any indirect or consequential damages, including loss of profits or data, resulting from the use of the Service. We do not guarantee 100% uptime but strive for maximum stability.</p>

                    <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">5. Compliance</h2>
                    <p className="mb-4">You agree to use this Service only for lawful purposes and in compliance with all applicable privacy laws (GDPR, CCPA, etc.) and Shopify's API Terms.</p>
                </div>
            </div>
        </div>
    );
}
