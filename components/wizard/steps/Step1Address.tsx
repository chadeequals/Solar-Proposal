"use client";

/**
 * Step 1: Address
 * Collects street, city, state, zip
 */

import { UseFormRegister, FieldErrors } from "react-hook-form";
import type { Intake } from "@/lib/types";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

interface Props {
  register: UseFormRegister<Intake>;
  errors: FieldErrors<Intake>;
}

export default function Step1Address({ register, errors }: Props) {
  return (
    <div className="space-y-4">
      {/* Street */}
      <div>
        <label className="block text-xs font-semibold tracking-wide text-slate-400 uppercase mb-1.5">
          Street Address
        </label>
        <input
          {...register("street", { required: "Street address is required" })}
          className="input-dark w-full px-4 py-3 text-sm"
          placeholder="123 Solar Lane"
          autoComplete="street-address"
          autoFocus
        />
        {errors.street && (
          <p className="mt-1 text-xs text-red-400">{errors.street.message}</p>
        )}
      </div>

      {/* City + State row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold tracking-wide text-slate-400 uppercase mb-1.5">
            City
          </label>
          <input
            {...register("city", { required: "City is required" })}
            className="input-dark w-full px-4 py-3 text-sm"
            placeholder="Austin"
            autoComplete="address-level2"
          />
          {errors.city && (
            <p className="mt-1 text-xs text-red-400">{errors.city.message}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold tracking-wide text-slate-400 uppercase mb-1.5">
            State
          </label>
          <select
            {...register("state", { required: "State is required" })}
            className="input-dark select-dark w-full px-4 py-3 text-sm"
          >
            <option value="">Select state</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {errors.state && (
            <p className="mt-1 text-xs text-red-400">{errors.state.message}</p>
          )}
        </div>
      </div>

      {/* ZIP */}
      <div>
        <label className="block text-xs font-semibold tracking-wide text-slate-400 uppercase mb-1.5">
          ZIP Code
        </label>
        <input
          {...register("zip", {
            required: "ZIP code is required",
            pattern: { value: /^\d{5}(-\d{4})?$/, message: "Enter a valid ZIP code" },
          })}
          className="input-dark w-full px-4 py-3 text-sm"
          placeholder="78701"
          autoComplete="postal-code"
          inputMode="numeric"
          maxLength={10}
        />
        {errors.zip && (
          <p className="mt-1 text-xs text-red-400">{errors.zip.message}</p>
        )}
      </div>

      {/* Privacy note */}
      <p className="text-xs text-slate-500 flex items-center gap-1.5">
        <svg className="w-3.5 h-3.5 text-amber-500/60 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        Your address is used only to analyze your roof&apos;s solar potential. Never sold.
      </p>
    </div>
  );
}
