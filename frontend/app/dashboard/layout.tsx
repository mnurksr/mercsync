import { redirect } from 'next/navigation';
import { getConnectedShop } from '../actions/shop';
import { getSetupStatus } from '../actions/staging';
import DashboardShell from '@/components/dashboard/DashboardShell';
import EmbeddedAdminRedirect from '@/components/EmbeddedAdminRedirect';
import { buildAppOriginUrl, buildEmbeddedAppUrl } from '@/utils/shopifyApp';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
    // RUNS ON THE SERVER = NO FLASHING OR JANK IN THE UI
    const [shopify, wizardStatus] = await Promise.all([
        getConnectedShop('shopify'),
        getSetupStatus()
    ]);

    if (!shopify.shop_domain) {
        redirect('/login');
    }

    if (!shopify.connected) {
        const returnUrl = encodeURIComponent(buildEmbeddedAppUrl(shopify.shop_domain, '/dashboard'));
        redirect(`${buildAppOriginUrl('/api/auth/shopify/start')}?shop=${encodeURIComponent(shopify.shop_domain)}&return_url=${returnUrl}`);
    }

    // Security / Routing Guard 1: Not fully set up? Go to setup.
    if (!wizardStatus.isComplete) {
        redirect('/setup');
    }

    // Security / Routing Guard 2: Set up but haven't chosen a plan? Go to billing.
    if (!shopify.plan_type || shopify.plan_type === 'guest' || shopify.plan_type === 'none') {
        redirect('/billing');
    }

    // Passed all guards -> Render dashboard UI
    return (
        <>
            <EmbeddedAdminRedirect shopDomain={shopify.shop_domain} />
            <DashboardShell>
                {children}
            </DashboardShell>
        </>
    );
}
