"use client";

import { useRef, useState } from "react";
import { Upload, Loader2, X } from "lucide-react";
import { menuApi } from "../../lib/api";

interface ImageUploadProps {
  currentImageUrl?: string | null;
  onUpload: (url: string) => void;
  onDelete?: () => void;
  disabled?: boolean;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 2 * 1024 * 1024;

export function ImageUpload({ currentImageUrl, onUpload, onDelete, disabled }: ImageUploadProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const displayUrl = preview ?? (currentImageUrl ? `${API_URL}${currentImageUrl}` : null);

  function handleBoxClick(): void {
    if (disabled || isUploading) return;
    inputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    // Reset so selecting the exact same file again still fires onChange.
    e.target.value = "";
    if (!file) return;

    setError(null);

    // SECURITY COMMENT:
    // Client-side validation is UX only — prevents wasted round-trips
    // for obviously invalid files. The server independently validates
    // type, size, and magic bytes regardless of what the client sends
    // (see api/src/modules/upload/upload.service.ts).
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Only JPEG, PNG and WebP images are allowed");
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError("Image must be under 2MB");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setIsUploading(true);

    try {
      const { imageUrl } = await menuApi.uploadMenuItemImage(file);
      onUpload(imageUrl);
      // Parent now owns the uploaded URL via its own state/prop update -
      // drop the local blob preview in favour of the server URL.
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setPreview(null);
    } finally {
      setIsUploading(false);
      URL.revokeObjectURL(objectUrl);
    }
  }

  async function handleDeleteClick(e: React.MouseEvent): Promise<void> {
    e.stopPropagation();
    if (disabled || isUploading) return;

    setError(null);
    const filename = currentImageUrl?.split("/").pop();

    if (filename) {
      try {
        await menuApi.deleteMenuItemImage(filename);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete image");
        return;
      }
    }

    setPreview(null);
    onDelete?.();
  }

  return (
    <div>
      <div className="image-upload-box" onClick={handleBoxClick}>
        {displayUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={displayUrl} alt="Menu item" />
            {!isUploading && (
              <div className="image-upload-overlay">
                <button
                  type="button"
                  className="btn btn-icon btn-secondary"
                  onClick={(e) => void handleDeleteClick(e)}
                  aria-label="Remove image"
                  disabled={disabled}
                >
                  <X size={16} />
                </button>
              </div>
            )}
            {isUploading && (
              <div className="image-upload-overlay" style={{ opacity: 1 }}>
                <Loader2 size={22} className="spin" style={{ color: "white" }} />
              </div>
            )}
          </>
        ) : isUploading ? (
          <Loader2 size={22} className="spin" style={{ color: "var(--text-muted)" }} />
        ) : (
          <>
            <Upload size={22} style={{ color: "var(--text-muted)" }} />
            <span className="text-muted text-sm">Click to upload</span>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => void handleFileChange(e)}
        style={{ display: "none" }}
        disabled={disabled}
      />
      {error && (
        <p className="form-error" style={{ marginTop: "0.375rem" }}>
          {error}
        </p>
      )}
    </div>
  );
}
