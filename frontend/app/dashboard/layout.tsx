import { redirect } from 'next/navigation';
import { getConnectedShop } from '../actions/shop';
import { getSetupStatus } from '../actions/staging';
import DashboardShell from '@/components/dashboard/DashboardShell';
import EmbeddedAdminRedirect from '@/components/EmbeddedAdminRedirect';
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
        redirect(`/reauth?shop=${encodeURIComponent(shopify.shop_domain)}&target=${encodeURIComponent('/dashboard')}`);
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
