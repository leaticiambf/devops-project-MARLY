"use client";

import { useState } from "react";
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
import type { NamedComfortSetting } from "@/lib/types/api";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";

export function ComfortPresetsWorkspace() {
  const queryClient = useQueryClient();
  const { user, token } = useAuth();
  const { toast } = useToast();
  const [comfortForm, setComfortForm] = useState<ComfortFormState>(defaultComfortForm);
  const [editingComfortId, setEditingComfortId] = useState<string | null>(null);
  const [showComfortForm, setShowComfortForm] = useState(false);

  const comfortSettingsQuery = useQuery({
    queryKey: ["comfort-settings", user?.userId],
    queryFn: () => usersApi.listComfortSettings(user!.userId, token!),
    enabled: Boolean(user?.userId && token),
  });

  const saveComfortSetting = useMutation({
    mutationFn: async () => {
      const payload = {
        name: comfortForm.name.trim(),
        comfortProfile: formToComfortProfile(comfortForm),
      };

      if (editingComfortId) {
        return usersApi.updateComfortSetting(
          user!.userId,
          editingComfortId,
          payload,
          token!,
        );
      }

      return usersApi.createComfortSetting(user!.userId, payload, token!);
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
      usersApi.deleteComfortSetting(user!.userId, settingId, token!),
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
    <div className="grid gap-4 lg:gap-6">
      <section className="rounded-[1.25rem] border border-line bg-surface px-4 py-4 sm:rounded-[2rem] sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent" className="px-2.5 py-0.5 text-[0.62rem]">
            Comfort
          </Badge>
          <Badge variant="muted" className="px-2.5 py-0.5 text-[0.62rem]">
            Mobile ready
          </Badge>
        </div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-4xl">
          Comfort presets
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-secondary sm:text-base">
          Save route preferences once, then reuse them in the journey planner.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[1.25rem] border border-line bg-surface px-4 py-4 sm:rounded-[2rem] sm:px-6 sm:py-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-foreground">Saved presets</h2>
              <p className="mt-1 text-sm text-secondary">Choose one to edit it.</p>
            </div>
            <Button variant="ghost" onClick={() => startEditingSetting()}>
              New
            </Button>
          </div>

          <div className="mt-4 grid gap-2">
            {comfortSettingsQuery.isLoading ? (
              <StatePanel title="Loading presets" description="Your profiles are on the way." />
            ) : comfortSettingsQuery.data?.length ? (
              comfortSettingsQuery.data.map((setting) => (
                <button
                  key={setting.id}
                  type="button"
                  onClick={() => startEditingSetting(setting)}
                  className="rounded-2xl border border-line bg-surface-strong px-4 py-3 text-left transition hover:border-brand/30 hover:bg-surface"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate font-semibold text-foreground">{setting.name}</p>
                    <span className="shrink-0 text-xs uppercase tracking-[0.16em] text-secondary">
                      Edit
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-secondary">
                    {setting.comfortProfile.directPath || "Flexible route"} ·{" "}
                    {setting.comfortProfile.maxNbTransfers != null
                      ? `${setting.comfortProfile.maxNbTransfers} transfer max`
                      : "Flexible transfers"}
                  </p>
                </button>
              ))
            ) : (
              <StatePanel
                title="No preset saved yet"
                description="Create one profile and it will appear in the planner selector."
              />
            )}
          </div>
        </div>

        <div className="rounded-[1.25rem] border border-line bg-surface px-4 py-4 sm:rounded-[2rem] sm:px-6 sm:py-6">
          {showComfortForm ? (
            <div className="grid gap-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">
                    {editingComfortId ? "Edit preset" : "Create preset"}
                  </p>
                  <h2 className="mt-1 text-lg font-bold text-foreground">
                    {editingComfortId ? "Update preferences" : "New comfort profile"}
                  </h2>
                </div>
                <Button variant="ghost" onClick={clearComfortEditor}>
                  Close
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
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
                    className="rounded-lg border border-line bg-surface-strong px-4 py-3 text-sm text-foreground font-mono outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-soft"
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
                  label="Max waiting"
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
                  label="Max walking"
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
                <div className="grid gap-2 rounded-xl border border-line bg-surface-strong px-4 py-3 text-sm text-foreground">
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
                    Air conditioning
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

              <div className="grid gap-2 sm:flex sm:flex-wrap">
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
                    Delete
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <StatePanel
              title="Select or create a preset"
              description="Tap New or choose an existing profile to edit route comfort preferences."
            />
          )}
        </div>
      </section>
    </div>
  );
}
