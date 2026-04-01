package org.marly.mavigo.controller.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * DTO pour une tâche issue de Google Tasks, envoyée par le frontend
 * pour l'optimisation de trajet (sans stockage en base).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class TaskDetailDto {

    private String id;
    private String title;
    private String locationQuery;
    private Double lat;
    private Double lng;
    private boolean completed;

    public TaskDetailDto() {
    }

    public TaskDetailDto(String id, String title, String locationQuery, Double lat, Double lng, boolean completed) {
        this.id = id;
        this.title = title;
        this.locationQuery = locationQuery;
        this.lat = lat;
        this.lng = lng;
        this.completed = completed;
    }

    public String id() {
        return id;
    }

    public String title() {
        return title;
    }

    public String locationQuery() {
        return locationQuery;
    }

    public Double lat() {
        return lat;
    }

    public Double lng() {
        return lng;
    }

    public boolean completed() {
        return completed;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getLocationQuery() {
        return locationQuery;
    }

    public void setLocationQuery(String locationQuery) {
        this.locationQuery = locationQuery;
    }

    public Double getLat() {
        return lat;
    }

    public void setLat(Double lat) {
        this.lat = lat;
    }

    public Double getLng() {
        return lng;
    }

    public void setLng(Double lng) {
        this.lng = lng;
    }

    public boolean isCompleted() {
        return completed;
    }

    public void setCompleted(boolean completed) {
        this.completed = completed;
    }
}
