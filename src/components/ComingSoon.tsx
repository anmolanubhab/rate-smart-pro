import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

export const ComingSoon = ({
  title,
  category,
  description,
  children,
}: {
  title: string;
  category: string;
  description: string;
  children?: ReactNode;
}) => (
  <div className="max-w-4xl mx-auto space-y-6 animate-fade-in-up">
    <header>
      <p className="text-sm text-muted-foreground font-medium">{category}</p>
      <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">{title}</h1>
      <p className="text-muted-foreground mt-1">{description}</p>
    </header>
    <div className="rounded-2xl border border-border bg-card p-10 text-center shadow-soft">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl gradient-primary shadow-glow mb-4">
        <Sparkles className="h-6 w-6 text-white" />
      </div>
      <h3 className="font-display font-semibold text-lg">Module ready, UI coming next</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
        Foundation is in place. The full interface for this module is being rolled out in the next milestone.
      </p>
      {children && <div className="mt-6">{children}</div>}
      <div className="mt-6 flex justify-center gap-2">
        <Button asChild variant="outline"><Link to="/dashboard">Go to Dashboard</Link></Button>
        <Button asChild className="gradient-primary text-white border-0"><Link to="/orders/new">Create an Order</Link></Button>
      </div>
    </div>
  </div>
);

export default ComingSoon;
