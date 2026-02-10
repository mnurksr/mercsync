import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function TermsPage() {
    return (
        <div className="min-h-screen bg-white text-gray-900 font-sans py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto">
                <div className="mb-8">
                    <Link href="/" className="inline-flex items-center text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Go Back
                    </Link>
                </div>

                <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-8">Terms of Service</h1>

                <div className="prose prose-blue max-w-none text-gray-600 leading-relaxed">
                    <p className="mb-4"><strong>Effective Date: February 10, 2026</strong></p>

                    <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">1. ACCEPTANCE OF TERMS</h2>
                    <p className="mb-4">This Terms of Service ("Agreement") constitutes a binding contract between MercSync ("we", "us", or "our"), located in Istanbul, Turkiye, and you ("Customer" or "you"). By installing or using the MercSync application (the "Service"), you agree to be bound by these terms.</p>

                    <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">2. SERVICE DESCRIPTION</h2>
                    <p className="mb-4">MercSync is an automation software designed to synchronize inventory, orders, and product data between e-commerce platforms, specifically Shopify and Etsy.</p>

                    <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">3. ETSY TRADEMARK USAGE & DISCLAIMER</h2>
                    <p className="mb-4">The term 'Etsy' is a trademark of Etsy, Inc. This application uses the Etsy API but is not endorsed or certified by Etsy, Inc. MercSync is an independent service provider.</p>

                    <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">4. COMPLIANCE WITH PLATFORM RULES</h2>
                    <p className="mb-4">You agree to use MercSync in full compliance with Etsy’s Terms of Use, House Rules, and Prohibited Items Policy. You are solely responsible for the content and products you list on your connected shops.</p>

                    <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">5. LICENSE & RESTRICTIONS</h2>
                    <p className="mb-4">We grant you a limited, non-exclusive, non-transferable right to use the Service for your internal business operations. You shall not:</p>
                    <ul className="list-disc pl-5 mb-4 space-y-2">
                        <li>Reverse engineer, decompile, or attempt to derive the source code of the Service.</li>
                        <li>Use the Service to build a competitive product.</li>
                        <li>Use the Service for any illegal activity or to violate the rights of others.</li>
                    </ul>

                    <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">6. FEES AND PAYMENTS</h2>
                    <ul className="list-disc pl-5 mb-4 space-y-2">
                        <li><strong>Shopify Billing:</strong> All fees for the Service are billed through the Shopify Billing API. You agree to pay the fees applicable to your selected subscription plan.</li>
                        <li><strong>Refunds:</strong> As we offer a free trial period for evaluation, fees paid are generally non-refundable, subject to Shopify's refund policies.</li>
                    </ul>

                    <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">7. SERVICE AVAILABILITY & WARRANTY DISCLAIMER</h2>
                    <p className="mb-4 uppercase font-semibold">THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE". WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE.</p>
                    <p className="mb-4 uppercase font-semibold">DISCLAIMER: THIS APPLICATION IS SOLELY PROVIDED BY MERCSYNC. YOU ACKNOWLEDGE THAT ETSY, INC. AND ITS AFFILIATES ARE NOT THE APPLICATION DEVELOPER, DO NOT PROVIDE THE APPLICATION SERVICE, AND MAKE NO WARRANTIES OF ANY KIND WITH RESPECT TO THE APPLICATION OR DATA ACCESSED THROUGH IT.</p>

                    <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">8. LIMITATION OF LIABILITY</h2>
                    <p className="mb-4 uppercase font-semibold">TO THE MAXIMUM EXTENT PERMITTED BY LAW, MERCSYNC SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES, INCLUDING LOSS OF PROFITS, SALES, OR DATA, ARISING FROM YOUR USE OF THE SERVICE.</p>

                    <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">9. INDEMNIFICATION</h2>
                    <p className="mb-4">You agree to indemnify and hold harmless MercSync and its founders from any claims, damages, or expenses arising from your violation of this Agreement or your misuse of the Service. Furthermore, you agree to release Etsy, Inc. from any claims, damages, or liabilities related to your use of the MercSync application.</p>

                    <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">10. GOVERNING LAW</h2>
                    <p className="mb-4">This Agreement shall be governed by the laws of the Republic of Turkiye. Any disputes arising from this Agreement shall be resolved exclusively in the competent courts of Istanbul (Caglayan).</p>

                    <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">11. CONTACT US</h2>
                    <p className="mb-4">For any legal notices or support inquiries, please contact us at:</p>
                    <p className="mb-4">
                        MercSync<br />
                        Email: info@mercsync.com<br />
                        Address: Basak Mahallesi, Ordu Caddesi No:2, Istanbul, Turkiye.
                    </p>
                </div>
            </div>
        </div>
    );
}
