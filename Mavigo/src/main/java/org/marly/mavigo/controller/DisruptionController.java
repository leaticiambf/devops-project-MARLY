package org.marly.mavigo.controller;

import java.util.List;
import java.util.UUID;

import org.marly.mavigo.controller.dto.LineDisruptionRequest;
import org.marly.mavigo.controller.dto.LineInfoResponse;
import org.marly.mavigo.controller.dto.RerouteResponse;
import org.marly.mavigo.controller.dto.StationDisruptionRequest;
import org.marly.mavigo.controller.dto.StopInfoResponse;
import org.marly.mavigo.security.RequestOwnershipGuard;
import org.marly.mavigo.service.disruption.DisruptionReportingService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/journeys/{journeyId}")
public class DisruptionController {

    private final DisruptionReportingService disruptionService;
    private final RequestOwnershipGuard requestOwnershipGuard;

    public DisruptionController(DisruptionReportingService disruptionService) {
        this(disruptionService, null);
    }

    @Autowired
    public DisruptionController(DisruptionReportingService disruptionService, RequestOwnershipGuard requestOwnershipGuard) {
        this.disruptionService = disruptionService;
        this.requestOwnershipGuard = requestOwnershipGuard;
    }

    @GetMapping("/lines")
    public ResponseEntity<List<LineInfoResponse>> getLines(@PathVariable UUID journeyId, Authentication authentication) {
        requireJourneyAccess(journeyId, authentication);
        var lines = disruptionService.getLinesForJourney(journeyId).stream()
                .map(LineInfoResponse::from)
                .toList();
        return ResponseEntity.ok(lines);
    }

    @GetMapping("/stops")
    public ResponseEntity<List<StopInfoResponse>> getStops(@PathVariable UUID journeyId, Authentication authentication) {
        requireJourneyAccess(journeyId, authentication);
        var stops = disruptionService.getStopsForJourney(journeyId).stream()
                .map(StopInfoResponse::from)
                .toList();
        return ResponseEntity.ok(stops);
    }

    @PostMapping("/disruptions/station")
    public ResponseEntity<RerouteResponse> reportStation(
            @PathVariable UUID journeyId,
            @RequestBody StationDisruptionRequest request,
            Authentication authentication) {
        requireJourneyAccess(journeyId, authentication);
        if (request.stopPointId() == null || request.stopPointId().isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        var result = disruptionService.reportStationDisruption(journeyId, request.stopPointId());
        return ResponseEntity.ok(RerouteResponse.from(result));
    }

    @PostMapping("/disruptions/line")
    public ResponseEntity<RerouteResponse> reportLine(
            @PathVariable UUID journeyId,
            @RequestBody LineDisruptionRequest request,
            Authentication authentication) {
        requireJourneyAccess(journeyId, authentication);
        if (request.lineCode() == null || request.lineCode().isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        var result = disruptionService.reportLineDisruption(journeyId, request.lineCode());
        return ResponseEntity.ok(RerouteResponse.from(result));
    }

    private void requireJourneyAccess(UUID journeyId, Authentication authentication) {
        if (requestOwnershipGuard != null) {
            requestOwnershipGuard.requireJourneyAccess(journeyId, authentication);
        }
    }
}
