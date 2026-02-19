"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { trpc } from "@/lib/trpc/client";

interface FundingModalProps {
  accountId: number;
  onClose: () => void;
  onSuccess: () => void;
}

type FundingFormData = {
  amount: string;
  fundingType: "card" | "bank";
  accountNumber: string;
  routingNumber?: string;
};

// Luhn algorithm for credit card validation
const validateCardNumber = (cardNumber: string): boolean => {
  const digits = cardNumber.replace(/\D/g, "");
  if (digits.length !== 16) return false;
  
  let sum = 0;
  let isEven = false;
  
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10);
    
    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    
    sum += digit;
    isEven = !isEven;
  }
  
  return sum % 10 === 0;
};

// Card type detection based on IIN ranges
const detectCardType = (cardNumber: string): string | null => {
  const digits = cardNumber.replace(/\D/g, "");
  
  // Visa: starts with 4
  if (/^4/.test(digits)) return "Visa";
  
  // Mastercard: 51-55, 2221-2720
  if (/^5[1-5]/.test(digits) || /^2(22[1-9]|2[3-9][0-9]|[3-6][0-9]{2}|7[0-1][0-9]|720)/.test(digits)) return "Mastercard";
  
  // American Express: 34, 37
  if (/^3[47]/.test(digits)) return "American Express";
  
  // Discover: 6011, 622126-622925, 644-649, 65
  if (/^(6011|65|64[4-9]|622)/.test(digits)) return "Discover";
  
  // Diners Club: 300-305, 36, 38
  if (/^(30[0-5]|36|38)/.test(digits)) return "Diners Club";
  
  // JCB: 3528-3589
  if (/^35(2[89]|[3-8][0-9])/.test(digits)) return "JCB";
  
  return null;
};

export function FundingModal({ accountId, onClose, onSuccess }: FundingModalProps) {
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FundingFormData>({
    defaultValues: {
      fundingType: "card",
    },
  });

  const fundingType = watch("fundingType");
  const fundAccountMutation = trpc.account.fundAccount.useMutation();

  const onSubmit = async (data: FundingFormData) => {
    setError("");

    try {
      const amount = parseFloat(data.amount);

      await fundAccountMutation.mutateAsync({
        accountId,
        amount,
        fundingSource: {
          type: data.fundingType,
          accountNumber: data.accountNumber,
          routingNumber: data.routingNumber,
        },
      });

      onSuccess();
    } catch (err: any) {
      setError(err.message || "Failed to fund account");
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Fund Your Account</h3>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Amount</label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="text-gray-500 dark:text-gray-400 sm:text-sm">$</span>
              </div>
              <input
                {...register("amount", {  
                  required: "Amount is required",
                  pattern: {
                    value: /^(0|[1-9]\d*)(\.\d{0,2})?$/,
                    message: "Invalid amount format (no leading zeros)",
                  },
                  validate: {
                    minAmount: (value) => {
                      const amount = parseFloat(value);
                      return amount > 0 || "Amount must be greater than $0.00";
                    },
                    maxAmount: (value) => {
                      const amount = parseFloat(value);
                      return amount <= 10000 || "Amount cannot exceed $10,000";
                    },
                    noLeadingZeros: (value) => {
                      return !/^0\d/.test(value) || "Amount cannot have leading zeros";
                    },
                  },
                })}
                type="text"
                className="pl-7 block w-full rounded-md border-gray-300 focus:ring-blue-500 focus:border-blue-500 sm:text-sm p-2 border bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="0.00"
              />
            </div>
            {errors.amount && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.amount.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Funding Source</label>
            <div className="space-y-2">
              <label className="flex items-center text-gray-900 dark:text-gray-300">
                <input {...register("fundingType")} type="radio" value="card" className="mr-2" />
                <span>Credit/Debit Card</span>
              </label>
              <label className="flex items-center text-gray-900 dark:text-gray-300">
                <input {...register("fundingType")} type="radio" value="bank" className="mr-2" />
                <span>Bank Account</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {fundingType === "card" ? "Card Number" : "Account Number"}
            </label>
            <input
              {...register("accountNumber", {
                required: `${fundingType === "card" ? "Card" : "Account"} number is required`,
                pattern: {
                  value: fundingType === "card" ? /^\d{16}$/ : /^\d+$/,
                  message: fundingType === "card" ? "Card number must be 16 digits" : "Invalid account number",
                },
                validate: {
                  validCard: (value) => {
                    if (fundingType !== "card") return true;
                    
                    // Detect card type
                    const cardType = detectCardType(value);
                    if (!cardType) {
                      return "Card number is not recognized as a valid card type";
                    }
                    
                    // Validate with Luhn algorithm
                    if (!validateCardNumber(value)) {
                      return "Invalid card number (failed checksum validation)";
                    }
                    
                    return true;
                  },
                },
              })}
              type="text"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder={fundingType === "card" ? "1234567812345678" : "123456789"}
            />
            {errors.accountNumber && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.accountNumber.message}</p>}
          </div>

          {fundingType === "bank" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Routing Number <span className="text-red-500">*</span></label>
              <input
                {...register("routingNumber", {
                  required: fundingType === "bank" ? "Routing number is required for bank transfers" : false,
                  pattern: {
                    value: /^\d{9}$/,
                    message: "Routing number must be exactly 9 digits",
                  },
                  validate: {
                    notAllZeros: (value) => {
                      if (!value) return true;
                      return value !== "000000000" || "Invalid routing number";
                    },
                  },
                })}
                type="text"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="123456789"
              />
              {errors.routingNumber && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.routingNumber.message}</p>}
            </div>
          )}

          {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={fundAccountMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {fundAccountMutation.isPending ? "Processing..." : "Fund Account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
