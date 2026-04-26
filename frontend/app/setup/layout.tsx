import { redirect } from 'next/navigation';
import { getConnectedShop } from '../actions/shop';
import { getSetupStatus } from '../actions/staging';
import EmbeddedAdminRedirect from '@/components/EmbeddedAdminRedirect';

export default async function SetupLayout({ children }: { children: React.ReactNode }) {
    // RUNS ON THE SERVER = NO FLASHING OR JANK IN THE UI
    let wizardStatus;
    let shopify;

    try {
        [wizardStatus, shopify] = await Promise.all([
            getSetupStatus(),
            getConnectedShop('shopify')
        ]);
    } catch (e) {
        console.error('SERVER GUARD: Error checking setup state:', e);
        redirect('/login');
    }

    if (!shopify.connected) {
        if (shopify.shop_domain) {
            redirect(`/login?shop=${encodeURIComponent(shopify.shop_domain)}`);
        }
        redirect('/login');
    }

    if (!shopify.plan_type || ['guest', 'none', 'pending', 'basic'].includes(shopify.plan_type.toLowerCase())) {
        redirect('/billing');
    }

    // Security / Routing Guard: If setup is already finished, do not let them linger in setup.
    if (wizardStatus.isComplete) {
        redirect('/dashboard');
    }

    return (
        <>
            <EmbeddedAdminRedirect shopDomain={shopify.shop_domain} />
            {children}
        </>
    );
}
