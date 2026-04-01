"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatePanel } from "@/components/ui/state-panel";
import {
  comfortProfileToForm,
  defaultComfortForm,
  directPathOptions,
  formToComfortProfile,
  type ComfortFormState,
} from "@/features/journey/comfort-settings";
import { usersApi } from "@/lib/api/users";
import type { NamedComfortSetting, User } from "@/lib/types/api";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";

type UserMenuProps = {
  user: User;
  onLogout: () => Promise<void>;
};

export function UserMenu({ user, onLogout }: UserMenuProps) {
  const queryClient = useQueryClient();
  const { token, refreshUser } = useAuth();
  const { toast } = useToast();
  const menuRef = useRef<HTMLDivElement | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [homeAddressDraft, setHomeAddressDraft] = useState(user.homeAddress ?? "");
  const [comfortForm, setComfortForm] = useState<ComfortFormState>(defaultComfortForm);
  const [editingComfortId, setEditingComfortId] = useState<string | null>(null);
  const [showComfortForm, setShowComfortForm] = useState(false);

  useEffect(() => {
    setHomeAddressDraft(user.homeAddress ?? "");
  }, [user.homeAddress]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const comfortSettingsQuery = useQuery({
    queryKey: ["comfort-settings", user.userId],
    queryFn: () => usersApi.listComfortSettings(user.userId, token!),
    enabled: Boolean(user.userId && token),
  });

  const connectedLabel = useMemo(() => {
    if (user.googleAccountLinked) {
      return user.googleAccountEmail || "Google Tasks connected";
    }
    return "Google Tasks optional";
  }, [user.googleAccountEmail, user.googleAccountLinked]);

  const saveHomeAddress = useMutation({
    mutationFn: (value: string) => usersApi.updateHomeAddress(user.userId, value, token!),
    onSuccess: async (updatedUser) => {
      setHomeAddressDraft(updatedUser.homeAddress ?? "");
      await refreshUser();
      toast({
        title: updatedUser.homeAddress ? "Home saved" : "Home cleared",
        description: updatedUser.homeAddress
          ? "Smart suggestions can now prefill the planner."
          : "The saved home address was removed.",
        variant: "success",
      });
    },
    onError: (error) => {
      toast({
        title: "Home update failed",
        description:
          error instanceof Error ? error.message : "Could not save the home address.",
        variant: "error",
      });
    },
  });

  const saveComfortSetting = useMutation({
    mutationFn: async () => {
      const payload = {
        name: comfortForm.name.trim(),
        comfortProfile: formToComfortProfile(comfortForm),
      };

      if (editingComfortId) {
        return usersApi.updateComfortSetting(
          user.userId,
          editingComfortId,
          payload,
          token!,
        );
      }

      return usersApi.createComfortSetting(user.userId, payload, token!);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["comfort-settings"] });
      setComfortForm(defaultComfortForm);
      setEditingComfortId(null);
      setShowComfortForm(false);
      toast({
        title: "Comfort preset saved",
        description: "The planner can now reuse this preference profile.",
        variant: "success",
      });
    },
    onError: (error) => {
      toast({
        title: "Comfort preset failed",
        description:
          error instanceof Error ? error.message : "Could not save the preset.",
        variant: "error",
      });
    },
  });

  const deleteComfortSetting = useMutation({
    mutationFn: (settingId: string) =>
      usersApi.deleteComfortSetting(user.userId, settingId, token!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["comfort-settings"] });
      setComfortForm(defaultComfortForm);
      setEditingComfortId(null);
      setShowComfortForm(false);
      toast({
        title: "Comfort preset deleted",
        description: "The saved preset was removed.",
        variant: "success",
      });
    },
    onError: (error) => {
      toast({
        title: "Delete failed",
        description:
          error instanceof Error ? error.message : "Could not delete the preset.",
        variant: "error",
      });
    },
  });

  function startEditingSetting(setting?: NamedComfortSetting) {
    setEditingComfortId(setting?.id ?? null);
    setComfortForm(comfortProfileToForm(setting));
    setShowComfortForm(true);
  }

  function clearComfortEditor() {
    setEditingComfortId(null);
    setComfortForm(defaultComfortForm);
    setShowComfortForm(false);
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex min-w-[14rem] items-center justify-between gap-3 rounded-full border border-line bg-surface-strong/90 px-3 py-2 text-left transition hover:border-brand/40 hover:bg-surface"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
            {user.displayName
              .split(" ")
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {user.displayName}
            </p>
            <p className="truncate text-xs text-secondary">{connectedLabel}</p>
          </div>
        </div>
        <span className="text-lg leading-none text-secondary">{isOpen ? "−" : "+"}</span>
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-full z-50 mt-3 w-[min(28rem,calc(100vw-2rem))] overflow-hidden rounded-[1.75rem] border border-line bg-surface shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
          <div className="border-b border-line bg-[linear-gradient(135deg,rgba(0,155,72,0.16),rgba(56,189,248,0.08))] px-5 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-secondary">
                  Your account
                </p>
                <h2 className="mt-2 text-xl font-semibold text-foreground">
                  {user.displayName}
                </h2>
                <p className="mt-1 text-sm text-secondary">{user.email}</p>
              </div>
              <Badge variant={user.googleAccountLinked ? "success" : "muted"}>
                {user.googleAccountLinked ? "Google Tasks connected" : "Google Tasks optional"}
              </Badge>
            </div>
          </div>

          <div className="grid max-h-[75vh] gap-5 overflow-y-auto px-5 py-5">
            <section className="grid gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Home address</p>
                <p className="mt-1 text-sm text-secondary">
                  Used to prefill suggested trips in the journey planner.
                </p>
              </div>
              <Input
                label="Saved home"
                value={homeAddressDraft}
                onChange={(event) => setHomeAddressDraft(event.target.value)}
                placeholder="12 Rue de Rivoli, Paris"
              />
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="secondary"
                  onClick={() => saveHomeAddress.mutate(homeAddressDraft.trim())}
                  disabled={saveHomeAddress.isPending}
                >
                  Save home
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setHomeAddressDraft("");
                    saveHomeAddress.mutate("");
                  }}
                  disabled={saveHomeAddress.isPending}
                >
                  Clear
                </Button>
              </div>
            </section>

            <section className="grid gap-3 border-t border-line pt-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">Comfort presets</p>
                  <p className="mt-1 text-sm text-secondary">
                    Keep route preferences here instead of on the main journey page.
                  </p>
                </div>
                <Button variant="ghost" onClick={() => startEditingSetting()}>
                  New preset
                </Button>
              </div>

              <div className="grid gap-2">
                {comfortSettingsQuery.isLoading ? (
                  <StatePanel
                    title="Loading presets"
                    description="Your saved travel profiles are on the way."
                  />
                ) : comfortSettingsQuery.data?.length ? (
                  comfortSettingsQuery.data.map((setting) => (
                    <button
                      key={setting.id}
                      type="button"
                      onClick={() => startEditingSetting(setting)}
                      className="rounded-2xl border border-line bg-surface-strong px-4 py-3 text-left transition hover:border-brand/30 hover:bg-surface"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-foreground">{setting.name}</p>
                        <span className="text-xs uppercase tracking-[0.18em] text-secondary">
                          Edit
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-secondary">
                        {setting.comfortProfile.directPath || "Flexible route"} ·{" "}
                        {setting.comfortProfile.requireAirConditioning
                          ? "Air conditioning"
                          : "No AC constraint"}{" "}
                        ·{" "}
                        {setting.comfortProfile.maxNbTransfers != null
                          ? `${setting.comfortProfile.maxNbTransfers} transfer max`
                          : "Flexible transfers"}
                      </p>
                    </button>
                  ))
                ) : (
                  <StatePanel
                    title="No preset saved yet"
                    description="Create one profile here and it will appear in the planner selector."
                  />
                )}
              </div>

              {showComfortForm ? (
                <div className="grid gap-4 rounded-[1.5rem] border border-line bg-surface-strong p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.24em] text-secondary">
                        {editingComfortId ? "Edit preset" : "Create preset"}
                      </p>
                      <h3 className="mt-1 text-lg font-semibold text-foreground">
                        {editingComfortId ? "Update comfort preset" : "Create a comfort preset"}
                      </h3>
                    </div>
                    <Button variant="ghost" onClick={clearComfortEditor}>
                      Close
                    </Button>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      label="Preset name"
                      value={comfortForm.name}
                      onChange={(event) =>
                        setComfortForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      placeholder="Morning commute"
                    />
                    <label className="grid gap-2 text-sm font-medium text-secondary">
                      <span>Direct path preference</span>
                      <select
                        value={comfortForm.directPath}
                        onChange={(event) =>
                          setComfortForm((current) => ({
                            ...current,
                            directPath: event.target.value as ComfortFormState["directPath"],
                          }))
                        }
                        className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-foreground font-mono outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-soft"
                      >
                        {directPathOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Input
                      label="Max transfers"
                      type="number"
                      min={0}
                      max={10}
                      value={comfortForm.maxNbTransfers}
                      onChange={(event) =>
                        setComfortForm((current) => ({
                          ...current,
                          maxNbTransfers: event.target.value,
                        }))
                      }
                    />
                    <Input
                      label="Max waiting (minutes)"
                      type="number"
                      min={0}
                      max={120}
                      value={comfortForm.maxWaitingDuration}
                      onChange={(event) =>
                        setComfortForm((current) => ({
                          ...current,
                          maxWaitingDuration: event.target.value,
                        }))
                      }
                    />
                    <Input
                      label="Max walking (minutes)"
                      type="number"
                      min={0}
                      max={120}
                      value={comfortForm.maxWalkingDuration}
                      onChange={(event) =>
                        setComfortForm((current) => ({
                          ...current,
                          maxWalkingDuration: event.target.value,
                        }))
                      }
                    />
                    <div className="grid gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-foreground">
                      <label className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={comfortForm.requireAirConditioning}
                          onChange={(event) =>
                            setComfortForm((current) => ({
                              ...current,
                              requireAirConditioning: event.target.checked,
                            }))
                          }
                        />
                        Require air conditioning
                      </label>
                      <label className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={comfortForm.wheelchairAccessible}
                          onChange={(event) =>
                            setComfortForm((current) => ({
                              ...current,
                              wheelchairAccessible: event.target.checked,
                            }))
                          }
                        />
                        Wheelchair accessible
                      </label>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button
                      onClick={() => saveComfortSetting.mutate()}
                      disabled={saveComfortSetting.isPending || !comfortForm.name.trim()}
                    >
                      {saveComfortSetting.isPending ? "Saving..." : "Save preset"}
                    </Button>
                    {editingComfortId ? (
                      <Button
                        variant="danger"
                        onClick={() => deleteComfortSetting.mutate(editingComfortId)}
                        disabled={deleteComfortSetting.isPending}
                      >
                        Delete preset
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </section>

            <section className="border-t border-line pt-5">
              <Button className="w-full" variant="ghost" onClick={() => void onLogout()}>
                Log out
              </Button>
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
