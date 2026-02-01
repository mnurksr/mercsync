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
                    <p className="mb-4">
                        At MercSync, we value your privacy. We collect only necessary information such as your email address and store name to provide our automation services. Your data is encrypted and never shared with third parties. We use AWS SES for system notifications and comply with GDPR standards to ensure your data rights are protected.
                    </p>
                </div>
            </div>
        </div>
    );
}
