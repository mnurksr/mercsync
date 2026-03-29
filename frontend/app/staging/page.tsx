import StagingInterface from '@/components/staging/StagingInterface';
import { getUserId } from '@/app/actions/inventory';
import { redirect } from 'next/navigation';

export default async function StagingPage() {
    const userId = await getUserId();
    
    if (!userId) {
        redirect('/login');
    }

    return (
        <StagingInterface userId={userId} />
    );
}
