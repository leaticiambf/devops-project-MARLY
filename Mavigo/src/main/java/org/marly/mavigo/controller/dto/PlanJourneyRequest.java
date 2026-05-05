package org.marly.mavigo.controller.dto;

import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

@JsonIgnoreProperties(ignoreUnknown = true)
public class PlanJourneyRequest {

    @NotNull
    private UUID userId;

    @NotBlank
    private String originQuery;

    @NotBlank
    private String destinationQuery;

    private Double originLatitude;
    private Double originLongitude;
    private Double destinationLatitude;
    private Double destinationLongitude;
    private String source;

    @NotBlank
    private String departureTime;

    private Boolean ecoModeEnabled;
    private Boolean wheelchairAccessible;
    private List<UUID> taskIds;
    private List<TaskDetailDto> taskDetails;
    private String intermediateQuery;
    private String intermediateDepartureTime;

    public PlanJourneyRequest() {
    }

    public PlanJourneyRequest(
            UUID userId,
            String originQuery,
            String destinationQuery,
            String departureTime,
            Boolean ecoModeEnabled,
            Boolean wheelchairAccessible,
            List<UUID> taskIds,
            List<TaskDetailDto> taskDetails,
            String intermediateQuery,
            String intermediateDepartureTime) {
        this.userId = userId;
        this.originQuery = originQuery;
        this.destinationQuery = destinationQuery;
        this.departureTime = departureTime;
        this.ecoModeEnabled = ecoModeEnabled;
        this.wheelchairAccessible = wheelchairAccessible;
        this.taskIds = taskIds;
        this.taskDetails = taskDetails;
        this.intermediateQuery = intermediateQuery;
        this.intermediateDepartureTime = intermediateDepartureTime;
    }

    public UUID userId() {
        return userId;
    }

    public String originQuery() {
        return originQuery;
    }

    public String destinationQuery() {
        return destinationQuery;
    }

    public Double originLatitude() {
        return originLatitude;
    }

    public Double originLongitude() {
        return originLongitude;
    }

    public Double destinationLatitude() {
        return destinationLatitude;
    }

    public Double destinationLongitude() {
        return destinationLongitude;
    }

    public String source() {
        return source;
    }

    public String departureTime() {
        return departureTime;
    }

    public Boolean ecoModeEnabled() {
        return ecoModeEnabled;
    }

    public Boolean wheelchairAccessible() {
        return wheelchairAccessible;
    }

    public List<UUID> taskIds() {
        return taskIds;
    }

    public List<TaskDetailDto> taskDetails() {
        return taskDetails;
    }

    public String intermediateQuery() {
        return intermediateQuery;
    }

    public String intermediateDepartureTime() {
        return intermediateDepartureTime;
    }

    public UUID getUserId() {
        return userId;
    }

    public void setUserId(UUID userId) {
        this.userId = userId;
    }

    public String getOriginQuery() {
        return originQuery;
    }

    public void setOriginQuery(String originQuery) {
        this.originQuery = originQuery;
    }

    public String getDestinationQuery() {
        return destinationQuery;
    }

    public void setDestinationQuery(String destinationQuery) {
        this.destinationQuery = destinationQuery;
    }

    public Double getOriginLatitude() {
        return originLatitude;
    }

    public void setOriginLatitude(Double originLatitude) {
        this.originLatitude = originLatitude;
    }

    public Double getOriginLongitude() {
        return originLongitude;
    }

    public void setOriginLongitude(Double originLongitude) {
        this.originLongitude = originLongitude;
    }

    public Double getDestinationLatitude() {
        return destinationLatitude;
    }

    public void setDestinationLatitude(Double destinationLatitude) {
        this.destinationLatitude = destinationLatitude;
    }

    public Double getDestinationLongitude() {
        return destinationLongitude;
    }

    public void setDestinationLongitude(Double destinationLongitude) {
        this.destinationLongitude = destinationLongitude;
    }

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source;
    }

    public String getDepartureTime() {
        return departureTime;
    }

    public void setDepartureTime(String departureTime) {
        this.departureTime = departureTime;
    }

    public Boolean getEcoModeEnabled() {
        return ecoModeEnabled;
    }

    public void setEcoModeEnabled(Boolean ecoModeEnabled) {
        this.ecoModeEnabled = ecoModeEnabled;
    }

    public Boolean getWheelchairAccessible() {
        return wheelchairAccessible;
    }

    public void setWheelchairAccessible(Boolean wheelchairAccessible) {
        this.wheelchairAccessible = wheelchairAccessible;
    }

    public List<UUID> getTaskIds() {
        return taskIds;
    }

    public void setTaskIds(List<UUID> taskIds) {
        this.taskIds = taskIds;
    }

    public List<TaskDetailDto> getTaskDetails() {
        return taskDetails;
    }

    public void setTaskDetails(List<TaskDetailDto> taskDetails) {
        this.taskDetails = taskDetails;
    }

    public String getIntermediateQuery() {
        return intermediateQuery;
    }

    public void setIntermediateQuery(String intermediateQuery) {
        this.intermediateQuery = intermediateQuery;
    }

    public String getIntermediateDepartureTime() {
        return intermediateDepartureTime;
    }

    public void setIntermediateDepartureTime(String intermediateDepartureTime) {
        this.intermediateDepartureTime = intermediateDepartureTime;
    }
}
