import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-white text-gray-900 font-sans py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto">
                <div className="mb-8">
                    <Link href="/" className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Go Back
                    </Link>
                </div>

                <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-8">Privacy Policy</h1>

                <div className="prose prose-blue max-w-none text-gray-600 leading-relaxed">
                    <p className="mb-4"><strong>Effective Date: February 03, 2026</strong></p>
                    <p className="mb-4">This Privacy Policy describes how MercSync ("the App," "we," "us," or "our") collects, uses, and discloses your Personal Information when you install or use the App in connection with your Shopify-supported store.</p>

                    <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">1. Personal Information We Collect</h2>
                    <p className="mb-4">We only request the minimum data necessary to provide our services. When you install the App, we automatically access certain types of information from your Shopify account:</p>
                    <ul className="list-disc pl-5 mb-4 space-y-2">
                        <li><strong>Merchant Information:</strong> Name, email, shop URL, and phone number to provide technical support.</li>
                        <li><strong>Protected Customer Data (PCD):</strong> To enable order fulfillment and ERP synchronization, we process the following customer details:
                            <ul className="list-disc pl-5 mt-2 space-y-1">
                                <li>Full Name and Shipping/Billing Addresses.</li>
                                <li>Email address and Phone number.</li>
                                <li>Order transaction details and line items.</li>
                            </ul>
                        </li>
                    </ul>

                    <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">2. How We Use Your Personal Information</h2>
                    <p className="mb-4">We use the information strictly to:</p>
                    <ul className="list-disc pl-5 mb-4 space-y-2">
                        <li>Automate inventory synchronization across your platforms.</li>
                        <li>Facilitate order fulfillment by syncing data to your external ERP/Accounting systems.</li>
                        <li>Comply with applicable legal requirements.</li>
                    </ul>

                    <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">3. Strict AI & Machine Learning Restrictions</h2>
                    <p className="mb-4">In compliance with the Shopify Partner Program Agreement (v.2026), we explicitly affirm that <strong>Merchant Data and Customer Data will NOT be used</strong> to develop, train, or improve any artificial intelligence or machine learning models without explicit written consent from Shopify and the merchant.</p>

                    <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">4. Data Retention & Deletion</h2>
                    <p className="mb-4">We retain order and customer data only for the duration necessary to perform the App's functions. When you uninstall the App, we automatically delete all stored personal data within 30 days, in accordance with Shopify's mandatory data deletion webhooks.</p>

                    <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">5. Data Rights (GDPR / CCPA / 2026 US State Laws)</h2>
                    <p className="mb-4">Depending on your location, you and your customers have the right to access, correct, or delete personal data. We provide tools to honor these requests promptly.</p>

                    <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">6. Contact & Physical Address</h2>
                    <p className="mb-4">For inquiries, contact us at <strong>info@mercsync.com</strong>.</p>
                    <p className="mb-4">
                        Physical Office: Basak Mahallesi Ordu Caddesi No2, Istanbul, Turkiye.
                    </p>
                </div>
            </div>
        </div>
    );
}
