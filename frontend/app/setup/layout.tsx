import { redirect } from 'next/navigation';
import { getSetupStatus } from '../actions/staging';

export default async function SetupLayout({ children }: { children: React.ReactNode }) {
    // RUNS ON THE SERVER = NO FLASHING OR JANK IN THE UI
    try {
        const wizardStatus = await getSetupStatus();

        // Security / Routing Guard: If setup is already finished, do not let them linger in setup.
        // Send them to the Billing step immediately.
        if (wizardStatus.isComplete) {
            redirect('/billing');
        }

        return <>{children}</>;

    } catch (e) {
        console.error('SERVER GUARD: Error checking setup state:', e);
        redirect('/login');
    }
}
