import { useState, useEffect, useMemo } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  Globe2,
  Languages,
  Loader2,
  Lock,
  Mail,
  Phone,
  RefreshCw,
  ShieldCheck,
  User,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const COUNTRIES = ["India", "USA", "UAE", "UK", "Singapore", "Australia"] as const;
const LANGUAGES = ["English", "Hindi", "Tamil", "Gujarati", "Bengali"] as const;

const countryMobileRules: Record<(typeof COUNTRIES)[number], RegExp> = {
  India: /^[6-9]\d{9}$/,
  USA: /^[2-9]\d{2}[2-9]\d{6}$/,
  UAE: /^5\d{8}$/,
  UK: /^7\d{9}$/,
  Singapore: /^[689]\d{7}$/,
  Australia: /^4\d{8}$/,
};

const normalizeMobile = (value: string) => value.replace(/[^\d]/g, "");

const passwordRules = [
  { label: "8 characters", test: (value: string) => value.length >= 8 },
  { label: "1 uppercase", test: (value: string) => /[A-Z]/.test(value) },
  { label: "1 lowercase", test: (value: string) => /[a-z]/.test(value) },
  { label: "1 number", test: (value: string) => /\d/.test(value) },
  { label: "1 special character", test: (value: string) => /[^A-Za-z0-9]/.test(value) },
];

const isStrongPassword = (value: string) => passwordRules.every((rule) => rule.test(value));

const loginSchema = z.object({
  email: z.string().email("Valid email address required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const signUpSchema = z
  .object({
    fullName: z.string().trim().min(2, "Full name must be at least 2 characters").max(100, "Full name must be 100 characters or less"),
    mobile: z.string().trim().min(1, "Mobile number is required"),
    email: z.string().trim().email("Valid email address required"),
    password: z.string().refine(isStrongPassword, "Password does not meet the strength rules"),
    country: z.enum(COUNTRIES, { required_error: "Country is required" }),
    language: z.enum(LANGUAGES, { required_error: "Preferred language is required" }),
    termsAccepted: z.boolean().refine((value) => value === true, "Terms & Privacy Policy acceptance is required"),
    companyName: z.string().optional(),
    formStartedAt: z.number(),
  })
  .superRefine((data, ctx) => {
    const mobile = normalizeMobile(data.mobile);
    if (!countryMobileRules[data.country].test(mobile)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mobile"],
        message: `Enter a valid mobile number for ${data.country}`,
      });
    }
    if (data.companyName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["companyName"],
