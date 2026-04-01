package org.marly.mavigo.controller.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

@JsonIgnoreProperties(ignoreUnknown = true)
public class PlanJourneyCommand {

    @NotNull
    @Valid
    private PlanJourneyRequest journey;

    @Valid
    private JourneyPreferencesRequest preferences;

    public PlanJourneyCommand() {
    }

    public PlanJourneyCommand(PlanJourneyRequest journey, JourneyPreferencesRequest preferences) {
        this.journey = journey;
        this.preferences = preferences;
    }

    public PlanJourneyRequest journey() {
        return journey;
    }

    public JourneyPreferencesRequest preferences() {
        return preferences;
    }

    public PlanJourneyRequest getJourney() {
        return journey;
    }

    public void setJourney(PlanJourneyRequest journey) {
        this.journey = journey;
    }

    public JourneyPreferencesRequest getPreferences() {
        return preferences;
    }

    public void setPreferences(JourneyPreferencesRequest preferences) {
        this.preferences = preferences;
    }
}
