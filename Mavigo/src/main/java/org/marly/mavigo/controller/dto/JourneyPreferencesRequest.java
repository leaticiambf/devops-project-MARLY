package org.marly.mavigo.controller.dto;

import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public class JourneyPreferencesRequest {

    private boolean comfortMode;
    private UUID namedComfortSettingId;

    public JourneyPreferencesRequest() {
    }

    public JourneyPreferencesRequest(boolean comfortMode, UUID namedComfortSettingId) {
        this.comfortMode = comfortMode;
        this.namedComfortSettingId = namedComfortSettingId;
    }

    public boolean comfortMode() {
        return comfortMode;
    }

    public UUID namedComfortSettingId() {
        return namedComfortSettingId;
    }

    public boolean isComfortMode() {
        return comfortMode;
    }

    public void setComfortMode(boolean comfortMode) {
        this.comfortMode = comfortMode;
    }

    public UUID getNamedComfortSettingId() {
        return namedComfortSettingId;
    }

    public void setNamedComfortSettingId(UUID namedComfortSettingId) {
        this.namedComfortSettingId = namedComfortSettingId;
    }
}
