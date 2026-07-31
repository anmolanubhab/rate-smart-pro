// src/components/company/CompanyAvatar.tsx
//
// The single reusable avatar for the active company/business — shows the
// uploaded logo (business.logo_url) or falls back to the first letter of the
// company name on an RD Pro branded gradient. Used everywhere the active
// company is displayed (sidebar company card, header company switcher,
// profile page) so all of them stay visually in sync automatically: they
// all read from the same useBusiness() react-query cache, so a change in
// one place re-renders every other instance without a page refresh.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export interface CompanyAvatarCompany {
  business_name?: string | null;
  logo_url?: string | null;
}

type Size = "sm" | "md" | "lg";

interface CompanyAvatarProps {
  company: CompanyAvatarCompany | null | undefined;
  size?: Size;
  clickable?: boolean;
  className?: string;
}

// Single source of truth for avatar pixel sizes — anything else in the app
// that needs to know the avatar's footprint (e.g. reserving layout space)
// should read this instead of hard-coding another number.
export const COMPANY_AVATAR_SIZE_PX: Record<Size, number> = { sm: 28, md: 40, lg: 64 };

// Tailwind can't read the px map above at build time (classes must be
// statically analyzable), so these are kept in lockstep with it by hand:
// sm -> h-7/w-7 (28px), md -> h-10/w-10 (40px), lg -> h-16/w-16 (64px).
const SIZE_CLASSES: Record<Size, string> = {
  sm: "h-7 w-7 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-xl",
};

function firstLetterOf(name?: string | null) {
  const trimmed = (name ?? "").trim();
  return trimmed ? trimmed[0].toUpperCase() : "?";
}

export default function CompanyAvatar({ company, size = "md", clickable, className }: CompanyAvatarProps) {
  const navigate = useNavigate();
  const logoUrl = company?.logo_url || null;
  const businessName = company?.business_name?.trim() || "Company";

  // Radix's AvatarImage only ever mounts an <img> once the browser reports
  // the image loaded — on error it just stays unmounted, so a broken/expired
  // logo_url can never show a broken-image icon. This local status is only
  // used to choose what the Fallback renders meanwhile (shimmer vs letter).
  const [status, setStatus] = useState<"idle" | "loading" | "loaded" | "error">(
    logoUrl ? "loading" : "idle",
  );
  useEffect(() => {
    setStatus(logoUrl ? "loading" : "idle");
  }, [logoUrl]);

  const avatar = (
    <Avatar className={cn("shrink-0 rounded-[10px] border border-primary/10 shadow-sm", SIZE_CLASSES[size], className)}>
      {logoUrl && (
        <AvatarImage
          src={logoUrl}
          alt={`${businessName} company logo`}
          loading="lazy"
          decoding="async"
          className="rounded-[10px] object-contain bg-card"
          onLoadingStatusChange={(s) => setStatus(s)}
        />
      )}
      <AvatarFallback
        className="rounded-[10px] bg-gradient-to-br from-primary to-primary-hover font-semibold text-primary-foreground"
        {...(status === "loading"
          ? { "aria-hidden": true }
          : { role: "img", "aria-label": `${businessName} company logo placeholder` })}
      >
        {status === "loading" ? (
          <span className="block h-full w-full animate-pulse rounded-[10px] bg-primary-foreground/25" />
        ) : (
          firstLetterOf(company?.business_name)
        )}
      </AvatarFallback>
    </Avatar>
  );

  if (!clickable) return avatar;

  return (
    <button
      type="button"
      title="Company Settings — Logo"
      onClick={() => navigate("/settings/business-profile")}
      className="shrink-0 rounded-[10px] transition-smooth hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      {avatar}
    </button>
  );
}
