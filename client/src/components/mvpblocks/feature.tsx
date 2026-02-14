import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";
import { Plane, Hotel, Car, CreditCard, Sparkles } from "lucide-react";

export function FeatureBlock3() {
  const features = [
    {
      icon: Plane,
      title: "Custom Tour Packages",
      description:
        "Tailor-made travel experiences to suit your interests, budget, and schedule. Perfect for individuals, families, or groups.",
      badge: "Popular",
      badgeVariant: "default" as const,
    },
    {
      icon: Hotel,
      title: "Stay Bookings",
      description:
        "Easy booking for hotels, hostels, and homestays with verified reviews and flexible cancellation policies.",
      badge: "New",
      badgeVariant: "secondary" as const,
    },
    {
      icon: Car,
      title: "Vehicle Rentals",
      description:
        "Rent bikes or cars at your destination with affordable rates, doorstep delivery, and 24/7 support.",
      badge: "Convenient",
      badgeVariant: "outline" as const,
    },
    {
      icon: CreditCard,
      title: "Secure Payments",
      description:
        "Multiple payment options with strong encryption, easy refunds, and EMI support for travel expenses.",
      badge: "Safe",
      badgeVariant: "destructive" as const,
    },
    {
      icon: Sparkles,
      title: "Premium Member Benefits",
      description:
        "Exciting offers, early access to deals, and VIP support for our premium members.",
      badge: "Exclusive",
      badgeVariant: "secondary" as const,
    },
    {
      icon: Users,
      title: "Travel Community",
      description:
        "Join our chat community to share experiences, get recommendations, and meet fellow travelers.",
      badge: "Social",
      badgeVariant: "outline" as const,
    },
  ];

  return (
    <section className="w-full py-20 md:py-32">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-xl sm:text-2xl md:text-4xl font-bold tracking-wide sm:tracking-normal bg-gradient-to-r from-rose-600 to-pink-500 bg-clip-text text-transparent text-center pb-5">
            Explore the World with Smart & Seamless Travel Solutions with ABjee
          </h2>

          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            From hotel bookings to custom tour packages, ABjee Travel brings you
            everything you need for a memorable journey — all in one place.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <Card
              key={index}
              className="group hover:shadow-lg transition-all duration-300 border-2 hover:border-primary/20"
            >
              <CardHeader className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="p-3 bg-primary/10 rounded-full group-hover:bg-primary/20 transition-colors">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <Badge variant={feature.badgeVariant}>{feature.badge}</Badge>
                </div>
                <CardTitle className="text-xl">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">{feature.description}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full group-hover:bg-primary/10"
                >
                  Learn More
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-center mt-16">
          <Button size="lg" className="gap-2">
            Explore All Features
          </Button>
        </div>
      </div>
    </section>
  );
}
