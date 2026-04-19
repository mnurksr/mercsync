import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-white text-gray-900 font-sans py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto">
                <div className="mb-8">
                    <Link href="/" className="inline-flex items-center text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Go Back
                    </Link>
                </div>

                <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-8">Privacy Policy</h1>

                <div className="prose prose-blue max-w-none text-gray-600 leading-relaxed">
                    <p className="mb-4"><strong>Last Updated: February 10, 2026</strong></p>

                    <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">1. INTRODUCTION</h2>
                    <p className="mb-4">MercSync (“we”, “us”, or “our”) welcomes you to our inventory management platform (the “Service”). We are committed to protecting your personal information and your business data. This Privacy Policy explains how we collect, use, and share information when you use our app to sync data between Shopify and Etsy.</p>

                    <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">2. INFORMATION WE COLLECT</h2>
                    <p className="mb-4">We collect two types of information:</p>
                    <ul className="list-disc pl-5 mb-4 space-y-2">
                        <li><strong>Merchant Information:</strong> When you install MercSync, we collect your name, email address, phone number, and shop URLs (Shopify and Etsy) to create your account and provide customer support.</li>
                        <li><strong>Platform Data (Shopify & Etsy):</strong> To perform inventory synchronization, we access and process:
                            <ul className="list-disc pl-5 mt-2 space-y-1">
                                <li>Product Listings (Titles, SKUs, Stock Levels, Prices).</li>
                                <li>Order Information (Customer shipping details, order status) needed for fulfillment.</li>
                            </ul>
                        </li>
                    </ul>

                    <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">3. HOW WE USE YOUR INFORMATION</h2>
                    <p className="mb-4">We use your information strictly for the following purposes:</p>
                    <ul className="list-disc pl-5 mb-4 space-y-2">
                        <li><strong>Synchronization:</strong> To sync inventory levels and orders between your connected platforms in real-time.</li>
                        <li><strong>Service Operation:</strong> To authenticate your access and troubleshoot technical issues.</li>
                        <li><strong>Compliance:</strong> To comply with legal obligations and platform (Shopify/Etsy) policies.</li>
                    </ul>

                    <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">4. ETSY API DATA USE & RETENTION</h2>
                    <p className="mb-4">MercSync uses Etsy API data only to provide the inventory synchronization, product matching, product cloning, pricing, and order-processing features selected by the merchant.</p>
                    <ul className="list-disc pl-5 mb-4 space-y-2">
                        <li><strong>Operational Data:</strong> We store product identifiers, listing identifiers, SKUs, titles, prices, quantities, images, and related sync metadata while your Etsy shop remains connected, as needed to operate the Service.</li>
                        <li><strong>Order Data:</strong> We process Etsy receipt and transaction identifiers and item quantities to synchronize inventory. We do not request or store buyer email addresses for this purpose.</li>
                        <li><strong>Data Minimization:</strong> We only store Etsy data needed to provide the features you use and troubleshoot synchronization issues.</li>
                        <li><strong>No Unauthorized Use:</strong> We do not sell Etsy data or use it for unrelated advertising or marketing.</li>
                    </ul>

                    <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">5. SHARING INFORMATION</h2>
                    <p className="mb-4">We do not sell your personal data. We only share information with:</p>
                    <ul className="list-disc pl-5 mb-4 space-y-2">
                        <li><strong>Service Providers:</strong> Third-party cloud hosting and database providers (e.g., Supabase, Hostinger) necessary to run our infrastructure.</li>
                        <li><strong>Legal Requirements:</strong> If required by law, subpoena, or to protect the rights of MercSync.</li>
                    </ul>

                    <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">6. DATA SECURITY & BREACH NOTIFICATION</h2>
                    <p className="mb-4">We employ industry-standard security measures (SSL encryption via TLS 1.2+, secure OAuth tokens, and HSTS enforcement) to protect your data.</p>
                    <p className="mb-4"><strong>Data Breach Notification:</strong> In accordance with Etsy API Terms of Use, if any Etsy Member data accessed via the API is compromised or suspected to be compromised, we will notify Etsy at dpo@etsy.com and the affected Etsy seller within 24 hours of discovery.</p>

                    <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">7. YOUR RIGHTS & DELETION</h2>
                    <p className="mb-4">You have the right to access, modify, or delete your personal information.</p>
                    <ul className="list-disc pl-5 mb-4 space-y-2">
                        <li><strong>Uninstall:</strong> When you uninstall MercSync from your Shopify store, access tokens are revoked or removed and shop-scoped operational sync data is removed from active use.</li>
                        <li><strong>Platform Deletion Requests:</strong> When Shopify or Etsy sends an applicable deletion or redaction request, we delete the related shop-scoped records according to that platform request.</li>
                        <li><strong>Request:</strong> You may contact us at any time to request immediate deletion of your data.</li>
                    </ul>

                    <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">8. CHANGES TO THIS POLICY</h2>
                    <p className="mb-4">We may update this policy to reflect changes in our practices or legal requirements. We will notify you of any material changes via email or a notice on our dashboard.</p>

                    <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">9. CONTACT US</h2>
                    <p className="mb-4">If you have questions about this Privacy Policy, please contact us at:</p>
                    <p className="mb-4">
                        <strong>MercSync</strong><br />
                        Email: info@mercsync.com<br />
                        Address: Basak Mahallesi, Ordu Caddesi No:2, Istanbul, Turkiye.
                    </p>
                </div>
            </div>
        </div>
    );
}
