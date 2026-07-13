import { Preferences } from "@/hooks/useProfileData";
import { Sun, Moon, Monitor, Globe, CalendarDays, DollarSign } from "lucide-react";

interface Props {
  preferences: Preferences;
}

const PreferenceCard = ({ preferences }: Props) => {
  const themeIcon = {
    light: <Sun className="h-4 w-4" />,
    dark: <Moon className="h-4 w-4" />,
    system: <Monitor className="h-4 w-4" />,
  };

  return (
    <div className="rounded-2xl bg-card border border-border shadow-soft p-6 space-y-3">
      <h4 className="text-sm font-medium text-muted-foreground">Preferences</h4>
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-muted-foreground">
            {themeIcon[preferences.theme]} Theme
          </span>
          <span className="capitalize">{preferences.theme}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-muted-foreground">
            <Globe className="h-4 w-4" /> Language
          </span>
          <span>{preferences.language}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-muted-foreground">
            <CalendarDays className="h-4 w-4" /> Date Format
          </span>
          <span>{preferences.date_format}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-muted-foreground">
            <DollarSign className="h-4 w-4" /> Currency
          </span>
          <span>{preferences.currency}</span>
        </div>
      </div>
    </div>
  );
};

export default PreferenceCard;
