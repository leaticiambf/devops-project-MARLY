"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .regex(/[A-Z]/, "Password must contain an uppercase letter.")
  .regex(/[a-z]/, "Password must contain a lowercase letter.")
  .regex(/[0-9]/, "Password must contain a digit.");

const registerSchema = z
  .object({
    firstName: z.string().min(1, "First name is required."),
    lastName: z.string().min(1, "Last name is required."),
    email: z.email("Enter a valid email address."),
    password: passwordSchema,
    passwordConfirm: z.string().min(1, "Confirm your password."),
    homeAddress: z.string().optional(),
  })
  .refine((values) => values.password === values.passwordConfirm, {
    message: "Password and confirmation do not match.",
    path: ["passwordConfirm"],
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

export function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { register: registerUser } = useAuth();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      passwordConfirm: "",
      homeAddress: "",
    },
  });

  function onSubmit(values: RegisterFormValues) {
    startTransition(async () => {
      try {
        await registerUser(values);
        toast({
          title: "Account created",
          description: "Your account is ready to use.",
          variant: "success",
        });
        router.push(searchParams.get("next") || "/");
      } catch (error) {
        toast({
          title: "Registration failed",
          description:
            error instanceof Error ? error.message : "Unable to create account.",
          variant: "error",
        });
      }
    });
  }

  return (
    <form className="grid gap-5" onSubmit={handleSubmit(onSubmit)}>
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-secondary">
          Register
        </p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
          Start planning with confidence
        </h2>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Input label="First name" error={errors.firstName?.message} {...register("firstName")} />
        <Input label="Last name" error={errors.lastName?.message} {...register("lastName")} />
      </div>
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register("email")}
      />
      <Input
        label="Password"
        type="password"
        autoComplete="new-password"
        error={errors.password?.message}
        {...register("password")}
      />
      <Input
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        error={errors.passwordConfirm?.message}
        {...register("passwordConfirm")}
      />
      <Input
        label="Home address"
        hint="Optional. Used to prefill future journey suggestions."
        error={errors.homeAddress?.message}
        {...register("homeAddress")}
      />

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Creating account..." : "Create account"}
      </Button>
    </form>
  );
}
