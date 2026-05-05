package org.marly.mavigo.service.journey;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.marly.mavigo.client.prim.PrimApiClient;
import org.marly.mavigo.client.prim.PrimApiException;
import org.marly.mavigo.client.prim.dto.PrimJourneyPlanDto;
import org.marly.mavigo.client.prim.model.PrimJourneyRequest;
import org.marly.mavigo.models.disruption.Disruption;
import org.marly.mavigo.models.disruption.DisruptionType;
import org.marly.mavigo.models.journey.Journey;
import org.marly.mavigo.models.journey.JourneySegment;
import org.marly.mavigo.models.journey.JourneyStatus;
import org.marly.mavigo.models.journey.SegmentType;
import org.marly.mavigo.models.journey.TransitMode;
import org.marly.mavigo.models.shared.GeoPoint;
import org.marly.mavigo.models.stoparea.StopArea;
import org.marly.mavigo.models.user.User;
import org.marly.mavigo.repository.JourneyRepository;
import org.marly.mavigo.repository.UserRepository;
import org.marly.mavigo.service.journey.dto.JourneyPlanningContext;
import org.marly.mavigo.service.journey.dto.JourneyPlanningParameters;
import org.marly.mavigo.service.journey.dto.JourneyPreferences;
import org.marly.mavigo.service.stoparea.StopAreaService;

@DisplayName("Tests unitaires - JourneyPlanningServiceImpl")
class JourneyPlanningServiceImplTest {

        private PrimApiClient primApiClient;
        private StopAreaService stopAreaService;
        private JourneyRepository journeyRepository;
        private UserRepository userRepository;
        private JourneyAssembler journeyAssembler;
        private PrimJourneyRequestFactory primJourneyRequestFactory;
        private JourneyResultFilter journeyResultFilter;
        private JourneyPlanningServiceImpl service;

        private User testUser;
        private StopArea originStopArea;
        private StopArea destinationStopArea;

        @BeforeEach
        void setUp() {
                primApiClient = mock(PrimApiClient.class);
                stopAreaService = mock(StopAreaService.class);
                journeyRepository = mock(JourneyRepository.class);
                userRepository = mock(UserRepository.class);
                journeyAssembler = mock(JourneyAssembler.class);
                primJourneyRequestFactory = mock(PrimJourneyRequestFactory.class);
                journeyResultFilter = mock(JourneyResultFilter.class);

                service = new JourneyPlanningServiceImpl(
                                primApiClient,
                                stopAreaService,
                                journeyRepository,
                                userRepository,
                                journeyAssembler,
                                primJourneyRequestFactory,
                                journeyResultFilter);

                testUser = new User("ext-123", "test@example.com", "Test User");
                testUser.setId(UUID.randomUUID());

                originStopArea = new StopArea("stop:origin", "Gare de Lyon", new GeoPoint(48.8443, 2.3730));
                destinationStopArea = new StopArea("stop:destination", "Châtelet", new GeoPoint(48.8584, 2.3470));
        }

        @Test
        @DisplayName("planAndPersist devrait planifier et sauvegarder les trajets")
        void planAndPersist_shouldPlanAndSaveJourneys() {
                // Given
                JourneyPreferences preferences = JourneyPreferences.disabled();
                JourneyPlanningParameters parameters = new JourneyPlanningParameters(
                                testUser.getId(),
                                "Gare de Lyon",
                                "Châtelet",
                                LocalDateTime.now(),
                                preferences,
                                false,
                                false);

                PrimJourneyPlanDto journeyPlan = createMockJourneyPlan("journey-1");
                Journey mockJourney = createMockJourney();

                when(stopAreaService.findOrCreateByQuery("Gare de Lyon")).thenReturn(originStopArea);
                when(stopAreaService.findOrCreateByQuery("Châtelet")).thenReturn(destinationStopArea);
                when(userRepository.findById(testUser.getId())).thenReturn(Optional.of(testUser));
                when(primJourneyRequestFactory.create(any(JourneyPlanningContext.class)))
                                .thenReturn(new PrimJourneyRequest("stop:origin", "stop:destination",
                                                LocalDateTime.now()));
                when(primApiClient.calculateJourneyPlans(any(PrimJourneyRequest.class)))
                                .thenReturn(List.of(journeyPlan));
                when(journeyResultFilter.filterByComfortProfile(anyList(), any(JourneyPlanningContext.class),
                                anyBoolean()))
                                .thenReturn(List.of(journeyPlan));
                when(journeyAssembler.assemble(any(User.class), any(StopArea.class), any(StopArea.class),
                                any(PrimJourneyPlanDto.class), any(JourneyPreferences.class)))
                                .thenReturn(mockJourney);
                when(journeyRepository.save(any(Journey.class))).thenAnswer(i -> i.getArguments()[0]);

                // When
                List<Journey> result = service.planAndPersist(parameters);

                // Then
                assertNotNull(result);
                assertFalse(result.isEmpty());
                assertEquals(1, result.size());
                verify(journeyRepository, times(1)).save(any(Journey.class));
        }

        @Test
        @DisplayName("planAndPersist devrait retourner un trajet marche si PRIM échoue sur deux coordonnées proches")
        void planAndPersist_shouldFallbackToWalkingForShortCoordinateJourney() {
                // Given
                StopArea closeOrigin = new StopArea(
                                "2.215807;48.902667",
                                "Allée de la Gare, Nanterre",
                                new GeoPoint(48.902667, 2.215807));
                StopArea closeDestination = new StopArea(
                                "2.215220;48.901120",
                                "33 boulevard Provinces Françaises, Nanterre",
                                new GeoPoint(48.901120, 2.215220));
                JourneyPlanningParameters parameters = new JourneyPlanningParameters(
                                testUser.getId(),
                                "48.902667, 2.215807",
                                "48.901120, 2.215220",
                                LocalDateTime.of(2026, 5, 5, 14, 0),
                                JourneyPreferences.disabled(),
                                false,
                                false);

                when(stopAreaService.findOrCreateByQuery(parameters.originQuery())).thenReturn(closeOrigin);
                when(stopAreaService.findOrCreateByQuery(parameters.destinationQuery())).thenReturn(closeDestination);
                when(userRepository.findById(testUser.getId())).thenReturn(Optional.of(testUser));
                when(primJourneyRequestFactory.create(any(JourneyPlanningContext.class)))
                                .thenReturn(new PrimJourneyRequest(
                                                closeOrigin.getExternalId(),
                                                closeDestination.getExternalId(),
                                                parameters.departureDateTime()));
                when(primApiClient.calculateJourneyPlans(any(PrimJourneyRequest.class)))
                                .thenThrow(new PrimApiException("No journey options match"));
                when(journeyRepository.save(any(Journey.class))).thenAnswer(i -> i.getArguments()[0]);

                // When
                List<Journey> result = service.planAndPersist(parameters);

                // Then
                assertEquals(1, result.size());
                Journey fallback = result.get(0);
                assertEquals("direct-walking-fallback", fallback.getPrimItineraryId());
                assertEquals(1, fallback.getSegments().size());
                JourneySegment segment = fallback.getSegments().get(0);
                assertEquals(SegmentType.WALKING, segment.getSegmentType());
                assertEquals(TransitMode.WALK, segment.getTransitMode());
                assertEquals(2, segment.getPoints().size());
                assertTrue(segment.getDistanceMeters() > 0);
                verify(journeyAssembler, never()).assemble(any(), any(), any(), any(), any());
                verify(journeyRepository).save(any(Journey.class));
        }

        @Test
        @DisplayName("planAndPersist devrait lever une exception si l'utilisateur n'est pas trouvé")
        void planAndPersist_shouldThrowExceptionWhenUserNotFound() {
                // Given
                JourneyPlanningParameters parameters = new JourneyPlanningParameters(
                                UUID.randomUUID(),
                                "Gare de Lyon",
                                "Châtelet",
                                LocalDateTime.now(),
                                JourneyPreferences.disabled(),
                                false,
                                false);

                when(stopAreaService.findOrCreateByQuery(anyString())).thenReturn(originStopArea);
                when(userRepository.findById(any(UUID.class))).thenReturn(Optional.empty());

                // When/Then
                assertThrows(IllegalArgumentException.class, () -> service.planAndPersist(parameters));
        }

        @Test
        @DisplayName("planAndPersist devrait lever une exception si aucun trajet ne correspond aux critères")
        void planAndPersist_shouldThrowExceptionWhenNoJourneysMatchCriteria() {
                // Given
                JourneyPlanningParameters parameters = new JourneyPlanningParameters(
                                testUser.getId(),
                                "Gare de Lyon",
                                "Châtelet",
                                LocalDateTime.now(),
                                JourneyPreferences.disabled(),
                                false,
                                false);

                when(stopAreaService.findOrCreateByQuery("Gare de Lyon")).thenReturn(originStopArea);
                when(stopAreaService.findOrCreateByQuery("Châtelet")).thenReturn(destinationStopArea);
                when(userRepository.findById(testUser.getId())).thenReturn(Optional.of(testUser));
                when(primJourneyRequestFactory.create(any(JourneyPlanningContext.class)))
                                .thenReturn(new PrimJourneyRequest("stop:origin", "stop:destination",
                                                LocalDateTime.now()));
                when(primApiClient.calculateJourneyPlans(any(PrimJourneyRequest.class)))
                                .thenReturn(List.of(createMockJourneyPlan("journey-1")));
                when(journeyResultFilter.filterByComfortProfile(anyList(), any(JourneyPlanningContext.class),
                                anyBoolean()))
                                .thenReturn(List.of()); // Empty list after filtering

                // When/Then
                assertThrows(PrimApiException.class, () -> service.planAndPersist(parameters));
        }

        @Test
        @DisplayName("planAndPersist devrait retourner au maximum 3 trajets")
        void planAndPersist_shouldReturnMaxThreeJourneys() {
                // Given
                JourneyPlanningParameters parameters = new JourneyPlanningParameters(
                                testUser.getId(),
                                "Gare de Lyon",
                                "Châtelet",
                                LocalDateTime.now(),
                                JourneyPreferences.disabled(),
                                false,
                                false);

                List<PrimJourneyPlanDto> manyJourneyPlans = List.of(
                                createMockJourneyPlan("journey-1"),
                                createMockJourneyPlan("journey-2"),
                                createMockJourneyPlan("journey-3"),
                                createMockJourneyPlan("journey-4"),
                                createMockJourneyPlan("journey-5"));

                when(stopAreaService.findOrCreateByQuery("Gare de Lyon")).thenReturn(originStopArea);
                when(stopAreaService.findOrCreateByQuery("Châtelet")).thenReturn(destinationStopArea);
                when(userRepository.findById(testUser.getId())).thenReturn(Optional.of(testUser));
                when(primJourneyRequestFactory.create(any(JourneyPlanningContext.class)))
                                .thenReturn(new PrimJourneyRequest("stop:origin", "stop:destination",
                                                LocalDateTime.now()));
                when(primApiClient.calculateJourneyPlans(any(PrimJourneyRequest.class)))
                                .thenReturn(manyJourneyPlans);
                when(journeyResultFilter.filterByComfortProfile(anyList(), any(JourneyPlanningContext.class),
                                anyBoolean()))
                                .thenReturn(manyJourneyPlans);
                when(journeyAssembler.assemble(any(User.class), any(StopArea.class), any(StopArea.class),
                                any(PrimJourneyPlanDto.class), any(JourneyPreferences.class)))
                                .thenReturn(createMockJourney());
                when(journeyRepository.save(any(Journey.class))).thenAnswer(i -> i.getArguments()[0]);

                // When
                List<Journey> result = service.planAndPersist(parameters);

                // Then
                assertEquals(3, result.size());
                verify(journeyRepository, times(3)).save(any(Journey.class));
        }

        @Test
        @DisplayName("updateJourneyWithDisruption devrait ajouter la disruption au trajet")
        void updateJourneyWithDisruption_shouldAddDisruptionToJourney() {
                // Given
                UUID journeyId = UUID.randomUUID();
                Journey existingJourney = createMockJourneyWithSegments();
                existingJourney.setUser(testUser);
                existingJourney.setOriginLabel("Gare de Lyon");
                existingJourney.setDestinationLabel("Châtelet");

                Disruption disruption = Disruption.lineDisruption(existingJourney, "M1", testUser);

                when(journeyRepository.findWithSegmentsById(journeyId)).thenReturn(Optional.of(existingJourney));
                when(stopAreaService.findOrCreateByQuery(anyString())).thenReturn(originStopArea);
                when(primJourneyRequestFactory.create(any(JourneyPlanningContext.class)))
                                .thenReturn(new PrimJourneyRequest("stop:origin", "stop:destination",
                                                LocalDateTime.now()));
                when(primApiClient.calculateJourneyPlans(any(PrimJourneyRequest.class)))
                                .thenReturn(List.of(createMockJourneyPlan("journey-new")));
                when(journeyResultFilter.filterByComfortProfile(anyList(), any(JourneyPlanningContext.class),
                                anyBoolean()))
                                .thenReturn(List.of(createMockJourneyPlan("journey-new")));
                when(journeyAssembler.assemble(any(User.class), any(StopArea.class), any(StopArea.class),
                                any(PrimJourneyPlanDto.class), any(JourneyPreferences.class)))
                                .thenReturn(createMockJourney());
                when(journeyRepository.save(any(Journey.class))).thenAnswer(i -> i.getArguments()[0]);

                // When
                List<Journey> result = service.updateJourneyWithDisruption(journeyId, disruption, null, null, null);

                // Then
                assertNotNull(result);
                assertFalse(result.isEmpty());
        }

        @Test
        @DisplayName("updateJourneyWithDisruption devrait lever une exception si le trajet n'est pas trouvé")
        void updateJourneyWithDisruption_shouldThrowExceptionWhenJourneyNotFound() {
                // Given
                UUID journeyId = UUID.randomUUID();
                Disruption disruption = new Disruption();

                when(journeyRepository.findWithSegmentsById(journeyId)).thenReturn(Optional.empty());

                // When/Then
                assertThrows(IllegalArgumentException.class,
                                () -> service.updateJourneyWithDisruption(journeyId, disruption, null, null, null));
        }

        @Test
        @DisplayName("recalculateFromNewOrigin devrait recalculer le trajet depuis une nouvelle origine")
        void recalculateFromNewOrigin_shouldRecalculateJourney() {
                // Given
                UUID userId = testUser.getId();
                String newOriginId = "stop:new-origin";
                String destinationId = "stop:destination";
                JourneyPreferences preferences = JourneyPreferences.disabled();

                StopArea newOrigin = new StopArea(newOriginId, "Nation", new GeoPoint(48.8483, 2.3952));

                when(userRepository.findById(userId)).thenReturn(Optional.of(testUser));
                when(stopAreaService.findOrCreateByQuery(newOriginId)).thenReturn(newOrigin);
                when(stopAreaService.findOrCreateByQuery(destinationId)).thenReturn(destinationStopArea);
                when(primApiClient.calculateJourneyPlans(any(PrimJourneyRequest.class)))
                                .thenReturn(List.of(createMockJourneyPlan("journey-recalc")));
                when(journeyResultFilter.filterByComfortProfile(anyList(), any(JourneyPlanningContext.class),
                                anyBoolean()))
                                .thenReturn(List.of(createMockJourneyPlan("journey-recalc")));
                when(journeyAssembler.assemble(any(User.class), any(StopArea.class), any(StopArea.class),
                                any(PrimJourneyPlanDto.class), any(JourneyPreferences.class)))
                                .thenReturn(createMockJourney());
                when(journeyRepository.save(any(Journey.class))).thenAnswer(i -> i.getArguments()[0]);

                // When
                List<Journey> result = service.recalculateFromNewOrigin(userId, newOriginId, destinationId,
                                preferences);

                // Then
                assertNotNull(result);
                assertFalse(result.isEmpty());
        }

        @Test
        @DisplayName("recalculateFromNewOrigin devrait lever une exception si aucune option n'est trouvée")
        void recalculateFromNewOrigin_shouldThrowExceptionWhenNoOptionsFound() {
                // Given
                UUID userId = testUser.getId();
                String newOriginId = "stop:new-origin";
                String destinationId = "stop:destination";

                StopArea newOrigin = new StopArea(newOriginId, "Nation", new GeoPoint(48.8483, 2.3952));

                when(userRepository.findById(userId)).thenReturn(Optional.of(testUser));
                when(stopAreaService.findOrCreateByQuery(newOriginId)).thenReturn(newOrigin);
                when(stopAreaService.findOrCreateByQuery(destinationId)).thenReturn(destinationStopArea);
                when(primApiClient.calculateJourneyPlans(any(PrimJourneyRequest.class)))
                                .thenReturn(List.of());
                when(journeyResultFilter.filterByComfortProfile(anyList(), any(JourneyPlanningContext.class),
                                anyBoolean()))
                                .thenReturn(List.of());

                // When/Then
                assertThrows(PrimApiException.class,
                                () -> service.recalculateFromNewOrigin(userId, newOriginId, destinationId, null));
        }

        @Test
        @DisplayName("filterJourneysExcludingLine devrait filtrer les trajets utilisant une ligne spécifique")
        void filterJourneysExcludingLine_shouldFilterJourneysUsingLine() {
                // Given
                Journey journeyWithM1 = createMockJourneyWithLineCode("M1");
                Journey journeyWithM4 = createMockJourneyWithLineCode("M4");
                Journey journeyWithRERB = createMockJourneyWithLineCode("RER-B");

                List<Journey> journeys = List.of(journeyWithM1, journeyWithM4, journeyWithRERB);

                // When
                List<Journey> result = service.filterJourneysExcludingLine(journeys, "M1");

                // Then
                assertEquals(2, result.size());
                assertTrue(result.stream().noneMatch(j -> j.isLineUsed("M1")));
        }

        @Test
        @DisplayName("updateJourneyWithDisruption devrait gérer l'origine GPS")
        @SuppressWarnings("unchecked")
        void updateJourneyWithDisruption_shouldHandleGpsOrigin() {
                // Given
                UUID journeyId = UUID.randomUUID();
                Journey existingJourney = createMockJourneyWithSegments();
                existingJourney.setUser(testUser);
                
                Disruption disruption = Disruption.lineDisruption(existingJourney, "M1", testUser);
                
                when(journeyRepository.findWithSegmentsById(journeyId)).thenReturn(Optional.of(existingJourney));
                when(stopAreaService.findOrCreateByQuery(anyString())).thenReturn(destinationStopArea);
                when(primJourneyRequestFactory.create(any(JourneyPlanningContext.class)))
                                .thenReturn(new PrimJourneyRequest("coord:2.3522;48.8566", "stop:destination", LocalDateTime.now()));
                when(primApiClient.calculateJourneyPlans(any(PrimJourneyRequest.class)))
                                .thenReturn(List.of(createMockJourneyPlan("journey-gps")));
                when(journeyResultFilter.filterByComfortProfile(anyList(), any(JourneyPlanningContext.class), anyBoolean()))
                                .thenReturn(List.of(createMockJourneyPlan("journey-gps")));
                when(journeyAssembler.assemble(any(), any(), any(), any(), any())).thenReturn(createMockJourney());
                when(journeyRepository.save(any(Journey.class))).thenAnswer(i -> i.getArguments()[0]);

                // When
                List<Journey> result = service.updateJourneyWithDisruption(journeyId, disruption, 48.8566, 2.3522, null);

                // Then
                assertNotNull(result);
                assertFalse(result.isEmpty());
                // Verify that the origin in the context was "Current Location" (this would be deeper verification, but status OK)
        }

        @Test
        @DisplayName("updateJourneyWithDisruption devrait gérer l'origine manuelle")
        void updateJourneyWithDisruption_shouldHandleManualOrigin() {
                // Given
                UUID journeyId = UUID.randomUUID();
                Journey existingJourney = createMockJourneyWithSegments();
                existingJourney.setUser(testUser);
                
                Disruption disruption = Disruption.lineDisruption(existingJourney, "M1", testUser);
                
                when(journeyRepository.findWithSegmentsById(journeyId)).thenReturn(Optional.of(existingJourney));
                when(stopAreaService.findOrCreateByQuery("Manual Station")).thenReturn(new StopArea("stop:manual", "Manual Station", null));
                when(stopAreaService.findOrCreateByQuery(anyString())).thenReturn(destinationStopArea);
                when(primJourneyRequestFactory.create(any(JourneyPlanningContext.class)))
                                .thenReturn(new PrimJourneyRequest("stop:manual", "stop:destination", LocalDateTime.now()));
                when(primApiClient.calculateJourneyPlans(any(PrimJourneyRequest.class)))
                                .thenReturn(List.of(createMockJourneyPlan("journey-manual")));
                when(journeyResultFilter.filterByComfortProfile(anyList(), any(JourneyPlanningContext.class), anyBoolean()))
                                .thenReturn(List.of(createMockJourneyPlan("journey-manual")));
                when(journeyAssembler.assemble(any(), any(), any(), any(), any())).thenReturn(createMockJourney());
                when(journeyRepository.save(any(Journey.class))).thenAnswer(i -> i.getArguments()[0]);

                // When
                List<Journey> result = service.updateJourneyWithDisruption(journeyId, disruption, null, null, "Manual Station");

                // Then
                assertNotNull(result);
                verify(stopAreaService).findOrCreateByQuery("Manual Station");
        }

        @Test
        @DisplayName("updateJourneyWithDisruption ne devrait pas recalculer si la ligne n'est pas impactée")
        void updateJourneyWithDisruption_shouldNotRecalculateIfNotImpacted() {
                // Given
                UUID journeyId = UUID.randomUUID();
                Journey existingJourney = createMockJourneyWithSegments(); // uses M1
                
                Disruption disruption = new Disruption();
                disruption.setEffectedLine("M4"); // Different line

                when(journeyRepository.findWithSegmentsById(journeyId)).thenReturn(Optional.of(existingJourney));

                // When
                List<Journey> result = service.updateJourneyWithDisruption(journeyId, disruption, null, null, null);

                // Then
                assertEquals(1, result.size());
                assertEquals(existingJourney, result.get(0));
                verify(primApiClient, never()).calculateJourneyPlans(any());
        }

        @Test
        @DisplayName("updateJourneyWithDisruption devrait gérer une disruption générale")
        void updateJourneyWithDisruption_shouldHandleGeneralDisruption() {
                // Given
                UUID journeyId = UUID.randomUUID();
                Journey existingJourney = createMockJourneyWithSegments();
                
                Disruption disruption = new Disruption();
                disruption.setEffectedLine("General Disruption");

                when(journeyRepository.findWithSegmentsById(journeyId)).thenReturn(Optional.of(existingJourney));
                when(stopAreaService.findOrCreateByQuery(anyString())).thenReturn(originStopArea);
                when(primJourneyRequestFactory.create(any(JourneyPlanningContext.class))).thenReturn(new PrimJourneyRequest("o", "d", LocalDateTime.now()));
                when(primApiClient.calculateJourneyPlans(any())).thenReturn(List.of(createMockJourneyPlan("j")));
                when(journeyResultFilter.filterByComfortProfile(anyList(), any(), anyBoolean())).thenReturn(List.of(createMockJourneyPlan("j")));
                when(journeyAssembler.assemble(any(), any(), any(), any(), any())).thenReturn(createMockJourney());
                when(journeyRepository.save(any(Journey.class))).thenAnswer(i -> i.getArguments()[0]);

                // When
                List<Journey> result = service.updateJourneyWithDisruption(journeyId, disruption, null, null, null);

                // Then
                assertNotNull(result);
                assertNotEquals(java.util.Collections.singletonList(existingJourney), result);
        }

        @Test
        @DisplayName("recalculateFromNewOrigin devrait utiliser les préférences par défaut si nulles")
        void recalculateFromNewOrigin_shouldUseDefaultPreferencesIfNull() {
                // Given
                UUID userId = testUser.getId();
                when(userRepository.findById(userId)).thenReturn(Optional.of(testUser));
                when(stopAreaService.findOrCreateByQuery(anyString())).thenReturn(originStopArea);
                when(primApiClient.calculateJourneyPlans(any())).thenReturn(List.of(createMockJourneyPlan("j")));
                when(journeyResultFilter.filterByComfortProfile(anyList(), any(), anyBoolean())).thenReturn(List.of(createMockJourneyPlan("j")));
                when(journeyAssembler.assemble(any(), any(), any(), any(), any())).thenReturn(createMockJourney());
                when(journeyRepository.save(any(Journey.class))).thenAnswer(i -> i.getArguments()[0]);

                // When
                List<Journey> result = service.recalculateFromNewOrigin(userId, "o", "d", null);

                // Then
                assertNotNull(result);
        }

        // Helper methods

        private PrimJourneyPlanDto createMockJourneyPlan(String journeyId) {
                return new PrimJourneyPlanDto(
                                journeyId,
                                OffsetDateTime.now(),
                                OffsetDateTime.now().plusHours(1),
                                3600,
                                1,
                                List.of());
        }

        private Journey createMockJourney() {
                Journey journey = new Journey(testUser, "Gare de Lyon", "Châtelet",
                                OffsetDateTime.now(), OffsetDateTime.now().plusHours(1));
                journey.setStatus(JourneyStatus.PLANNED);
                return journey;
        }

        private Journey createMockJourneyWithSegments() {
                Journey journey = createMockJourney();
                JourneySegment segment = new JourneySegment(journey, 1, SegmentType.PUBLIC_TRANSPORT);
                segment.setLineCode("M1");
                journey.addSegment(segment);
                return journey;
        }

        private Journey createMockJourneyWithLineCode(String lineCode) {
                Journey journey = createMockJourney();
                JourneySegment segment = new JourneySegment(journey, 1, SegmentType.PUBLIC_TRANSPORT);
                segment.setLineCode(lineCode);
                journey.addSegment(segment);
                return journey;
        }
}
