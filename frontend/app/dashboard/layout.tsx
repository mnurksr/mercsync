import { redirect } from 'next/navigation';
import { getConnectedShop } from '../actions/shop';
import { getSetupStatus } from '../actions/staging';
import DashboardShell from '@/components/dashboard/DashboardShell';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
    // RUNS ON THE SERVER = NO FLASHING OR JANK IN THE UI
    try {
        const [shopify, wizardStatus] = await Promise.all([
            getConnectedShop('shopify'),
            getSetupStatus() // uses getValidatedUserContext() internally
        ]);

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
            <DashboardShell>
                {children}
            </DashboardShell>
        );

    } catch (e) {
        console.error('SERVER GUARD: Error checking dashboard state:', e);
        // Fallback: Allow client to handle it or redirect to login
        redirect('/login');
    }
}
