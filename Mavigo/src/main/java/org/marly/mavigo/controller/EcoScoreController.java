package org.marly.mavigo.controller;

import org.marly.mavigo.controller.dto.EcoScoreResponse;
import org.marly.mavigo.security.RequestOwnershipGuard;
import org.marly.mavigo.models.tracking.UserBadge;
import org.marly.mavigo.service.tracking.GamificationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/eco")
public class EcoScoreController {

        private final GamificationService gamificationService;
        private final RequestOwnershipGuard requestOwnershipGuard;

        public EcoScoreController(GamificationService gamificationService) {
                this(gamificationService, null);
        }

        @Autowired
        public EcoScoreController(GamificationService gamificationService, RequestOwnershipGuard requestOwnershipGuard) {
                this.gamificationService = gamificationService;
                this.requestOwnershipGuard = requestOwnershipGuard;
        }

        @GetMapping("/dashboard")
        public ResponseEntity<EcoScoreResponse> getDashboard(@RequestParam UUID userId, Authentication authentication) {
                if (requestOwnershipGuard != null) {
                        requestOwnershipGuard.requireUserAccess(userId, authentication);
                }
                double totalCo2 = gamificationService.getTotalCo2Saved(userId);
                List<UserBadge> userBadges = gamificationService.getUserBadges(userId);

                List<EcoScoreResponse.BadgeResponse> earnedBadges = userBadges.stream()
                                .filter(ub -> ub.getBadge() != null)
                                .map(ub -> new EcoScoreResponse.BadgeResponse(
                                                ub.getBadge().getName(),
                                                ub.getBadge().getDescription(),
                                                ub.getBadge().getIcon(),
                                                ub.getEarnedAt()))
                                .toList();

                List<EcoScoreResponse.AllBadgeInfo> allBadges = gamificationService.getAllSystemBadges()
                                .stream()
                                .map(b -> new EcoScoreResponse.AllBadgeInfo(
                                                b.getName(),
                                                b.getDescription(),
                                                b.getIcon()))
                                .toList();

                List<EcoScoreResponse.JourneyActivityResponse> history = gamificationService.getJourneyHistory(userId)
                                .stream()
                                .map(ja -> new EcoScoreResponse.JourneyActivityResponse(
                                                ja.getJourneyId(),
                                                ja.getOrigin(),
                                                ja.getDestination(),
                                                ja.getDistanceMeters() != null ? ja.getDistanceMeters().doubleValue()
                                                                : 0.0,
                                                ja.getCo2SavedKg() != null ? ja.getCo2SavedKg() : 0.0,
                                                ja.getRecordedAt()))
                                .toList();

                return ResponseEntity.ok(
                                new EcoScoreResponse(totalCo2, userBadges.size(), earnedBadges, allBadges, history));
        }
}
