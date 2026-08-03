import { useEffect, useRef, useState } from "react";
import { User } from "@supabase/supabase-js";
import { Mail, Phone, Camera, Upload, Trash2 } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { toast } from "sonner";
import { Profile } from "@/hooks/useProfileData";
import { useAvatarUpload } from "@/hooks/useAvatarUpload";
import { validateAvatarFile } from "@/lib/avatar";
import { UserAvatar } from "@/components/common/UserAvatar";
import AvatarUploadDialog from "@/components/profile/AvatarUploadDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  profile: Profile | null;
  user: User | null;
}

const PersonalInfoCard = ({ profile, user }: Props) => {
  const fullName = profile?.full_name || user?.email?.split("@")[0] || "User";
  const email = user?.email || "";
  const mobile = profile?.mobile || "Not set";

  const [uploadedAvatarUrl, setUploadedAvatarUrl] = useState<string | null>(profile?.avatar_url ?? null);
  const [selectedImageSrc, setSelectedImageSrc] = useState<string | null>(null);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadAvatar, removeAvatar, uploading, removing } = useAvatarUpload();

  useEffect(() => {
    setUploadedAvatarUrl(profile?.avatar_url ?? null);
  }, [profile?.avatar_url]);

  const broadcastAvatarChange = (avatarUrl: string | null) => {
    window.dispatchEvent(new CustomEvent("rdpro:avatar-updated", { detail: { avatarUrl } }));
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later

    if (!file) return;

    const validationError = validateAvatarFile(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setSelectedImageSrc(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleCropCancel = () => {
    setSelectedImageSrc(null);
  };

  const handleCropSave = async (blob: Blob) => {
    if (!user) return;
    try {
      const newUrl = await uploadAvatar(user.id, blob);
      setUploadedAvatarUrl(newUrl);
      broadcastAvatarChange(newUrl);
      toast.success("Profile photo updated");
      setSelectedImageSrc(null);
    } catch (err) {
      console.error("Avatar upload failed:", err);
      toast.error("Couldn't upload your photo. Please try again.");
    }
  };

  const handleRemoveConfirmed = async () => {
    if (!user) return;
    try {
      await removeAvatar(user.id);
      setUploadedAvatarUrl(null);
      broadcastAvatarChange(null);
      toast.success("Profile photo removed");
    } catch (err) {
      console.error("Avatar removal failed:", err);
      toast.error("Couldn't remove your photo. Please try again.");
    } finally {
      setRemoveConfirmOpen(false);
    }
  };

  return (
    <div className="rounded-2xl bg-card border border-border shadow-soft p-6 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-start gap-6">
        {/* Avatar with upload */}
        <div className="relative flex-shrink-0">
          <UserAvatar
            user={user}
            avatarUrl={uploadedAvatarUrl}
            name={fullName}
            size="lg"
            shape="rounded"
            variant="gradient"
            className="border-2 border-border"
          />

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            className="hidden"
            onChange={handleFileSelected}
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={uploading || removing}
                className="absolute -bottom-1 -right-1 bg-primary text-white p-1.5 rounded-full shadow-md hover:bg-primary-hover transition-colors disabled:opacity-60"
                aria-label="Change profile photo"
              >
                {uploading || removing ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48 rounded-xl">
              <DropdownMenuItem className="gap-2" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4" /> Upload New Photo
              </DropdownMenuItem>
              {uploadedAvatarUrl && (
                <DropdownMenuItem
                  className="gap-2 text-destructive focus:text-destructive"
                  onClick={() => setRemoveConfirmOpen(true)}
                >
                  <Trash2 className="h-4 w-4" /> Remove Photo
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex-1 min-w-0 space-y-3">
          <div>
            <h2 className="font-display text-xl font-semibold truncate">{fullName}</h2>
            <p className="text-sm text-muted-foreground">{email}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="h-4 w-4" />
              <span className="truncate">{email}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="h-4 w-4" />
              <span>{mobile}</span>
            </div>
          </div>
        </div>
      </div>

      {selectedImageSrc && (
        <AvatarUploadDialog
          imageSrc={selectedImageSrc}
          open={!!selectedImageSrc}
          uploading={uploading}
          onCancel={handleCropCancel}
          onSave={handleCropSave}
        />
      )}

      <AlertDialog open={removeConfirmOpen} onOpenChange={setRemoveConfirmOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove profile photo?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes your uploaded photo. {user?.user_metadata?.avatar_url || user?.user_metadata?.picture
                ? "Your Google profile photo will show instead."
                : "Your initials will show instead."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveConfirmed}
              disabled={removing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removing && <LoadingSpinner size="sm" className="mr-2" />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PersonalInfoCard;
