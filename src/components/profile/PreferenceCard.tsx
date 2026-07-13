import { Preferences } from "@/hooks/useProfileData";
import { Sun, Moon, Monitor, Globe, CalendarDays, DollarSign } from "lucide-react";

interface Props {
  preferences?: Preferences;
}

const PreferenceCard = ({ preferences }: Props) => {
  // Default preferences if none provided
  const defaultPrefs: Preferences = {
    theme: "light",
    language: "English",
    date_format: "DD/MM/YYYY",
    currency: "INR",
  };

  // Merge provided preferences with defaults
  const prefs = { ...defaultPrefs, ...preferences };

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
            {themeIcon[prefs.theme] || themeIcon.light} Theme
          </span>
          <span className="capitalize">{prefs.theme}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-muted-foreground">
            <Globe className="h-4 w-4" /> Language
          </span>
          <span>{prefs.language}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-muted-foreground">
            <CalendarDays className="h-4 w-4" /> Date Format
          </span>
          <span>{prefs.date_format}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-muted-foreground">
            <DollarSign className="h-4 w-4" /> Currency
          </span>
          <span>{prefs.currency}</span>
        </div>
      </div>
    </div>
  );
};

export default PreferenceCard;
