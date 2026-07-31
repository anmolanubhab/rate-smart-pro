import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { getInitials, resolveAvatarSrc } from "@/lib/avatar";

const SIZE_CLASSES = {
  sm: "h-9 w-9",
  md: "h-16 w-16",
  lg: "h-24 w-24",
} as const;

interface UserAvatarProps {
  user?: { user_metadata?: Record<string, unknown> | null } | null;
  avatarUrl?: string | null;
  name: string;
  size?: keyof typeof SIZE_CLASSES;
  shape?: "circle" | "rounded";
  variant?: "subtle" | "gradient";
  className?: string;
}

export function UserAvatar({
  user,
  avatarUrl,
  name,
  size = "md",
  shape = "circle",
  variant = "subtle",
  className,
}: UserAvatarProps) {
  const src = resolveAvatarSrc({ avatarUrl, user });
  const shapeClass = shape === "rounded" ? "rounded-2xl" : "rounded-full";
  const fallbackClass =
    variant === "gradient"
      ? "gradient-primary text-white font-display font-bold shadow-elegant"
      : "bg-primary-light text-primary text-sm font-semibold";

  return (
    // Keyed on src so switching between an uploaded photo, a Google photo,
    // and no photo remounts the whole primitive: Radix's Avatar.Root tracks
    // image-loading status in context that does NOT reset when AvatarImage
    // unmounts, so without this the Fallback can get stuck hidden after an
    // image has loaded once, even after the src goes away.
    <Avatar key={src ?? "no-avatar"} className={cn(SIZE_CLASSES[size], shapeClass, className)}>
      {src && (
        <AvatarImage
          src={src}
          alt={name}
          loading="lazy"
          referrerPolicy="no-referrer"
          className={cn("object-cover", shapeClass)}
        />
      )}
      <AvatarFallback className={cn(shapeClass, fallbackClass)}>{getInitials(name)}</AvatarFallback>
    </Avatar>
  );
}
