import { z } from "zod";

// Mirrors the complexity rule enforced server-side in api/src/modules/auth/auth.dto.ts.
// Client-side validation only improves UX; see the SECURITY COMMENT in the
// login page for why the server must never trust this alone.
const PASSWORD_COMPLEXITY_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/;

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export type LoginFormData = z.infer<typeof loginSchema>;

const newPasswordField = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(72, "Password must not exceed 72 characters")
  .regex(PASSWORD_COMPLEXITY_REGEX, "Must contain uppercase, lowercase, number, and special character");

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: newPasswordField,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;

export const mfaTokenSchema = z.object({
  token: z.string().length(6, "Code must be 6 digits").regex(/^\d+$/, "Code must contain only digits"),
});

export type MfaTokenFormData = z.infer<typeof mfaTokenSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    newPassword: newPasswordField,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;
