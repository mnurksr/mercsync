export type PlanId = 'starter' | 'growth' | 'pro';

export type PlanConfig = {
    id: PlanId;
    name: string;
    price: number;
    annualPrice: number;
    trialDays: number;
    description: string;
    limits: {
        matchedItems: number;
        monthlyOrderSyncs: number;
        maxTrackedLocations: number;
    };
    capabilities: {
        productCloning: boolean;
        priceRules: boolean;
        multiLocationInventory: boolean;
        merchantAlerts: boolean;
        emailNotifications: boolean;
        prioritySupport: boolean;
    };
    features: string[];
};

export const PLAN_ORDER: PlanId[] = ['starter', 'growth', 'pro'];

export const PLAN_CONFIG: Record<PlanId, PlanConfig> = {
    starter: {
        id: 'starter',
        name: 'Starter',
        price: 19,
        annualPrice: 190,
        trialDays: 7,
        description: 'For small sellers starting Shopify + Etsy inventory sync',
        limits: {
            matchedItems: 100,
            monthlyOrderSyncs: 100,
            maxTrackedLocations: 1,
        },
        capabilities: {
            productCloning: false,
            priceRules: false,
            multiLocationInventory: false,
            merchantAlerts: false,
            emailNotifications: false,
            prioritySupport: false,
        },
        features: [
            'Up to 100 matched products',
            'Up to 100 synced orders/month',
            'Shopify and Etsy inventory sync',
            'Product import and matching',
            'Basic email support',
        ],
    },
    growth: {
        id: 'growth',
        name: 'Growth',
        price: 39,
        annualPrice: 390,
        trialDays: 7,
        description: 'For growing sellers who need automation and stronger controls',
        limits: {
            matchedItems: 1000,
            monthlyOrderSyncs: 500,
            maxTrackedLocations: 99,
        },
        capabilities: {
            productCloning: true,
            priceRules: true,
            multiLocationInventory: true,
            merchantAlerts: true,
            emailNotifications: true,
            prioritySupport: false,
        },
        features: [
            'Up to 1,000 matched products',
            'Up to 500 synced orders/month',
            'Everything in Starter',
            'Product cloning',
            'Price rules',
            'Multi-location inventory sync',
            'Stock zero and low stock alerts',
            'Email notifications',
        ],
    },
    pro: {
        id: 'pro',
        name: 'Pro',
        price: 79,
        annualPrice: 790,
        trialDays: 7,
        description: 'For higher-volume sellers who need more sync capacity',
        limits: {
            matchedItems: 5000,
            monthlyOrderSyncs: 2500,
            maxTrackedLocations: 99,
        },
        capabilities: {
            productCloning: true,
            priceRules: true,
            multiLocationInventory: true,
            merchantAlerts: true,
            emailNotifications: true,
            prioritySupport: true,
        },
        features: [
            'Up to 5,000 matched products',
            'Up to 2,500 synced orders/month',
            'Everything in Growth',
            'Priority support',
        ],
    },
};

export function normalizePlanId(value?: string | null): PlanId | null {
    const plan = (value || '').toLowerCase().trim();
    if (plan === 'starter') return 'starter';
    if (plan === 'growth' || plan === 'professional') return 'growth';
    if (plan === 'pro' || plan === 'enterprise' || plan === 'unlimited') return 'pro';
    return null;
}

export function getPlanConfig(value?: string | null): PlanConfig | null {
    const id = normalizePlanId(value);
    return id ? PLAN_CONFIG[id] : null;
}
