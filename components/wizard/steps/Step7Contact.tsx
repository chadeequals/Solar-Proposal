"use client";

/**
 * Step 7: Contact Information
 * First, last, email, phone
 */

import { UseFormRegister, FieldErrors } from "react-hook-form";
import type { Intake } from "@/lib/types";

interface Props {
  register: UseFormRegister<Intake>;
  errors: FieldErrors<Intake>;
}

export default function Step7Contact({ register, errors }: Props) {
  return (
    <div className="space-y-4">
      {/* Name row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold tracking-wide text-slate-400 uppercase mb-1.5">
            First Name
          </label>
          <input
            {...register("first", { required: "First name is required" })}
            className="input-dark w-full px-4 py-3 text-sm"
            placeholder="Jane"
            autoComplete="given-name"
            autoFocus
          />
          {errors.first && (
            <p className="mt-1 text-xs text-red-400">{errors.first.message}</p>
          )}
        </div>
        <div>
          <label className="block text-xs font-semibold tracking-wide text-slate-400 uppercase mb-1.5">
            Last Name
          </label>
          <input
            {...register("last", { required: "Last name is required" })}
            className="input-dark w-full px-4 py-3 text-sm"
            placeholder="Smith"
            autoComplete="family-name"
          />
          {errors.last && (
            <p className="mt-1 text-xs text-red-400">{errors.last.message}</p>
          )}
        </div>
      </div>

      {/* Email */}
      <div>
        <label className="block text-xs font-semibold tracking-wide text-slate-400 uppercase mb-1.5">
          Email Address
        </label>
        <input
          {...register("email", {
            required: "Email is required",
            pattern: {
              value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
              message: "Enter a valid email address",
            },
          })}
          type="email"
          className="input-dark w-full px-4 py-3 text-sm"
          placeholder="jane@example.com"
          autoComplete="email"
        />
        {errors.email && (
          <p className="mt-1 text-xs text-red-400">{errors.email.message}</p>
        )}
      </div>

      {/* Phone */}
      <div>
        <label className="block text-xs font-semibold tracking-wide text-slate-400 uppercase mb-1.5">
          Mobile Phone
        </label>
        <input
          {...register("phone", {
            required: "Phone number is required",
            pattern: {
              value: /^[\d\s\-().+]{10,}$/,
              message: "Enter a valid phone number",
            },
          })}
          type="tel"
          className="input-dark w-full px-4 py-3 text-sm"
          placeholder="(512) 555-0100"
          autoComplete="tel"
          inputMode="tel"
        />
        {errors.phone && (
          <p className="mt-1 text-xs text-red-400">{errors.phone.message}</p>
        )}
      </div>

      {/* Trust signals */}
      <div className="mt-4 p-4 rounded-lg bg-navy-800/50 border border-white/5 space-y-2">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span>Your information is encrypted and never sold to third parties</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span>Your proposal will be ready in about 60 seconds</span>
        </div>
      </div>
    </div>
  );
}
