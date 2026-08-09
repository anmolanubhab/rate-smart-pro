import { Construction } from "lucide-react";

export default function SalesmanComingSoon({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4">
      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <Construction className="h-6 w-6 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        This screen is being built in {phase} of the Salesman Portal rollout.
      </p>
    </div>
  );
}
