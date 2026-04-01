import type {
  ComfortProfile,
  DirectPathPreference,
  NamedComfortSetting,
} from "@/lib/types/api";

export const directPathOptions: Array<{
  value: DirectPathPreference;
  label: string;
  description: string;
}> = [
  {
    value: "indifferent",
    label: "Flexible",
    description: "Allow direct and transfer-heavy routes.",
  },
  {
    value: "only",
    label: "Direct only",
    description: "Prefer direct paths only.",
  },
  {
    value: "only_with_alternatives",
    label: "Direct if possible",
    description: "Prefer direct paths but keep alternatives.",
  },
  {
    value: "none",
    label: "Transfers welcome",
    description: "Do not bias toward direct paths.",
  },
];

export type ComfortFormState = {
  name: string;
  directPath: DirectPathPreference;
  requireAirConditioning: boolean;
  maxNbTransfers: string;
  maxWaitingDuration: string;
  maxWalkingDuration: string;
  wheelchairAccessible: boolean;
};

export const defaultComfortForm: ComfortFormState = {
  name: "",
  directPath: "indifferent",
  requireAirConditioning: false,
  maxNbTransfers: "",
  maxWaitingDuration: "",
  maxWalkingDuration: "",
  wheelchairAccessible: false,
};

export function comfortProfileToForm(
  setting?: NamedComfortSetting | null,
): ComfortFormState {
  return {
    name: setting?.name ?? "",
    directPath:
      (setting?.comfortProfile.directPath as DirectPathPreference) ?? "indifferent",
    requireAirConditioning: Boolean(setting?.comfortProfile.requireAirConditioning),
    maxNbTransfers:
      setting?.comfortProfile.maxNbTransfers != null
        ? String(setting.comfortProfile.maxNbTransfers)
        : "",
    maxWaitingDuration:
      setting?.comfortProfile.maxWaitingDuration != null
        ? String(Math.round(setting.comfortProfile.maxWaitingDuration / 60))
        : "",
    maxWalkingDuration:
      setting?.comfortProfile.maxWalkingDuration != null
        ? String(Math.round(setting.comfortProfile.maxWalkingDuration / 60))
        : "",
    wheelchairAccessible: Boolean(setting?.comfortProfile.wheelchairAccessible),
  };
}

export function formToComfortProfile(form: ComfortFormState): ComfortProfile {
  return {
    directPath: form.directPath,
    requireAirConditioning: form.requireAirConditioning,
    maxNbTransfers: form.maxNbTransfers ? Number(form.maxNbTransfers) : null,
    maxWaitingDuration: form.maxWaitingDuration
      ? Number(form.maxWaitingDuration) * 60
      : null,
    maxWalkingDuration: form.maxWalkingDuration
      ? Number(form.maxWalkingDuration) * 60
      : null,
    wheelchairAccessible: form.wheelchairAccessible,
  };
}
