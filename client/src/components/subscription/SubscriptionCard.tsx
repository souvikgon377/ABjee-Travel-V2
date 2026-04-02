import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, Crown, Star, Zap } from 'lucide-react';

interface SubscriptionPlan {
  type: 'free' | 'pro' | 'premium';
  name: string;
  price: {
    amount: number;
    currency: string;
    interval?: 'monthly' | 'yearly';
  };
  yearlyPrice?: {
    amount: number;
    currency: string;
    interval: 'yearly';
  };
  features: {
    privateChatAccess: boolean;
    maxPrivateChats: number;
    travelPartnerRequests: number;
    prioritySupport: boolean;
    advancedFilters: boolean;
    profileBoost: boolean;
    fileUploadLimit: number;
    customDestinations: boolean;
  };
}

interface SubscriptionCardProps {
  plan: SubscriptionPlan;
  currentPlan?: string;
  isYearly?: boolean;
  onUpgrade: (planType: string, interval: string) => void;
  loading?: boolean;
}

const SubscriptionCard: React.FC<SubscriptionCardProps> = ({
  plan,
  currentPlan,
  isYearly = false,
  onUpgrade,
  loading = false
}) => {
  const isCurrentPlan = currentPlan === plan.type;
  const isUpgrade = currentPlan === 'free' && plan.type !== 'free';
  
  const monthlyPrice = isYearly && plan.yearlyPrice 
    ? Math.round(plan.yearlyPrice.amount / 12) 
    : plan.price.amount;

  const getIcon = () => {
    switch (plan.type) {
      case 'free':
        return <Star className="h-6 w-6" />;
      case 'pro':
        return <Zap className="h-6 w-6" />;
      case 'premium':
        return <Crown className="h-6 w-6" />;
      default:
        return <Star className="h-6 w-6" />;
    }
  };

  const getFeatureList = () => {
    const features = [];
    
    if (plan.features.privateChatAccess) {
      const chatLimit = plan.features.maxPrivateChats === -1 
        ? 'Unlimited' 
        : plan.features.maxPrivateChats;
      features.push(`${chatLimit} private chats`);
    } else {
      features.push('No private chat access');
    }

    const requestLimit = plan.features.travelPartnerRequests === -1 
      ? 'Unlimited' 
      : plan.features.travelPartnerRequests;
    features.push(`${requestLimit} travel partner requests`);

    features.push(`${plan.features.fileUploadLimit}MB file uploads`);

    if (plan.features.prioritySupport) {
      features.push('Priority support');
    }

    if (plan.features.advancedFilters) {
      features.push('Advanced search filters');
    }

    if (plan.features.profileBoost) {
      features.push('Profile boost');
    }

    if (plan.features.customDestinations) {
      features.push('Custom destinations');
    }

    return features;
  };

  const handleUpgrade = () => {
    const interval = isYearly ? 'yearly' : 'monthly';
    onUpgrade(plan.type, interval);
  };

  return (
    <Card className={`relative ${plan.type === 'pro' ? 'border-primary shadow-lg' : ''}`}>
      {plan.type === 'pro' && (
        <Badge className="absolute -top-2 left-1/2 transform -translate-x-1/2">
          Most Popular
        </Badge>
      )}
      
      <CardHeader className="text-center">
        <div className="flex justify-center mb-2">
          {getIcon()}
        </div>
        <CardTitle className="text-2xl">{plan.name}</CardTitle>
        <CardDescription>
          {plan.type === 'free' && 'Perfect for getting started'}
          {plan.type === 'pro' && 'Best for active travelers'}
          {plan.type === 'premium' && 'For travel enthusiasts'}
        </CardDescription>
      </CardHeader>

      <CardContent className="text-center">
        <div className="mb-6">
          {plan.type === 'free' ? (
            <div className="text-3xl font-bold">Free</div>
          ) : (
            <div>
              <div className="text-3xl font-bold">
                ${monthlyPrice}
                <span className="text-lg font-normal text-muted-foreground">/month</span>
              </div>
              {isYearly && plan.yearlyPrice && (
                <div className="text-sm text-muted-foreground">
                  Billed ${plan.yearlyPrice.amount} yearly
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-3 text-left">
          {getFeatureList().map((feature, index) => (
            <div key={index} className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-500 shrink-0" />
              <span className="text-sm">{feature}</span>
            </div>
          ))}
        </div>
      </CardContent>

      <CardFooter>
        {isCurrentPlan ? (
          <Button className="w-full" disabled>
            Current Plan
          </Button>
        ) : plan.type === 'free' ? (
          <Button variant="outline" className="w-full" disabled>
            Free Forever
          </Button>
        ) : (
          <Button 
            className="w-full" 
            onClick={handleUpgrade}
            disabled={loading}
          >
            {loading ? 'Processing...' : isUpgrade ? 'Upgrade Now' : 'Switch Plan'}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};

export default SubscriptionCard;
