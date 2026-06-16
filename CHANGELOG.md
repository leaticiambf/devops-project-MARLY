# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v1.2.1] - 2026-06-15

### Added
- Live map display on the Journey page before a journey is planned.
- Dedicated mobile `Comfort Presets` page for creating, editing, and deleting saved route preferences.
- Mavigo logo component reused across the app shell and authentication screens.
- Mobile bottom navigation for Journey, Explore, Tasks, Eco Score, and Comfort Presets.

### Changed
- Polished the responsive Journey workspace while preserving existing feature behavior.
- Compacted the mobile header, active journey controls, trip options, Eco Score cards, and badge collection.
- Moved comfort preset editing out of the account popover and into a dedicated mobile-friendly page.
- Kept toast notifications within the phone viewport above the bottom navigation.
- Improved restoring-access and login visual consistency.
- Updated the application version to `1.2.1` for release automation.

### Fixed
- Prevented the map from displaying demo itinerary segments when no journey is planned.
- Restored the mobile initials account menu by simplifying the floating panel and raising its stacking layer.
- Made disruption reporting controls visible and actionable in the desktop active-journey layout.
- Avoided showing the restoring-access badge in the header on authentication pages.

## [v1.2.0] - 2026-05-04

### Added
- Interactive transport map experience in the Next.js frontend.
- Dedicated transport map page and workspace.
- Mapbox-based transport map rendering with reusable map utilities and legend components.
- Reverse geocoding support for map interactions.
- Journey task waypoints displayed on the route map and in the journey panel.

### Changed
- Improved journey workspace map behavior and route presentation.
- Added map-related frontend dependencies and page coverage.
- Updated README badges and project visibility metadata.

### Fixed
- Improved map availability error handling and user feedback.
- Allowed SonarQube analysis to continue on error in CI.

## [v1.1.0] - 2026-04-22

### Added
- Tourist mode for restaurant suggestions near a journey.
- Yelp-backed tourism suggestion service and tourism API endpoints.
- Next.js App Router frontend in `maview/`, replacing the older static frontend.
- Frontend routes for login, registration, journey planning, tasks, tourism exploration, and eco-score.
- Frontend tests with Vitest and Playwright smoke coverage.
- Request ownership guard for user and journey access checks.
- Local environment examples for the split frontend/backend setup.

### Changed
- Split the application into a Spring Boot backend and a Next.js frontend.
- Updated frontend authentication to store the JWT session client-side and call the backend through Next rewrites.
- Refreshed the journey planning UI and related API client layer.
- Expanded journey, disruption, Google Tasks, and DTO coverage.
- Updated README and technical documentation for the split runtime topology.

### Removed
- Removed the legacy static frontend assets from the Spring Boot resources directory.
- Removed Selenium page-object UI tests that targeted the old static frontend.

## [v1.0beta] - 2026-02-27

### Added
- **Multi-stop journey planning (Via routing)**: Plan journeys with an intermediate stop, including optional departure time at the via station
- **Disruption rerouting for multi-stop journeys**: When a disruption occurs on a journey with an intermediate stop, the rerouting engine now preserves the via stop and recalculates both legs accordingly
- **Via stop UI**: Collapsible "Intermediate stop (Via)" accordion in the journey planner with via station and departure time inputs, including client-side validation
- **Journey model**: New `intermediateQuery` and `intermediateDepartureTime` fields on the Journey entity, exposed through the API response DTO
- **New tests**: `DisruptionIntermediateStopTest` covering station and line disruption scenarios with pending intermediate stops
- **Branding**: Added Mavigo logo (`logo.png`) as favicon and on the landing page

### Changed
- **Google Tasks panel redesign**: Refreshed tasks UI with overview box layout, inline toolbar with refresh icon, and `#mavigo:[location]` tip card
- **CI pipeline improvements**:
  - Added concurrency group with `cancel-in-progress` to avoid redundant workflow runs
  - Tightened permissions (`contents: read` by default, `contents: write` scoped to release job only)
  - Improved cache keys for Sonar and Gradle (now includes `*.gradle.kts` and `gradle.properties`)
  - Release job now depends on `ui-tests` in addition to `build` and `documentation`
  - Fixed build date interpolation in GitHub Release body
- **Security config**: Added `/images/**` to the public permit list
- **PRIM API client**: Added support for `forbidden_id[]` query parameter (excluded lines) and minor formatting cleanup
- **StopAreaServiceImpl**: Refactored query normalization and place-matching logic with improved formatting and locale handling

### Fixed
- **First leg origin for address-based journeys**: Corrected coordinate format from `coord:lon;lat` to `lon;lat` when building the origin ID for disruption rerouting from a non-station origin

### Testing
- Updated existing controller and service tests to accommodate the new `intermediateQuery`/`intermediateDepartureTime` fields and constructor changes

## [v1.0a] - 2026-02-24

### Changed
- Updated frontend flows across sign-in/login, journey search, and departure time handling
- Accessibility profiles now start with no profile enabled by default
- Google Tasks controller cleanup

### Security
- Hardened password validation against regex-based vulnerability issues
- Improved OAuth/JWT security wiring (authorized client persistence and JWT filter behavior)
- Fixed blocker-level issues in eco-score flow and related geocoding paths

### Testing
- Expanded and refactored automated test coverage (including parameterized controller/geocoding tests)
- Fixed failing UI tests in journey optimization flows

### CI/CD & Documentation
- Updated CI workflow configuration
- Refreshed v0.3 documentation artifacts on the dev line

## [v0.3] - 2026-02-17

### Added
- Green mode with eco-score dashboard and gamification features
- Badges and accessibility-related UI improvements
- Smart journey suggestions based on user preferences
- JWT authentication support
- New tests for journey optimization, deserialization, and UI

### Changed
- Renamed comfort mode to comfort/accessibility profiles
- Added wheelchair support with frontend toggle
- Restructured JavaScript files and updated security configurations
- Updated v0.3 documentation
- Improved SonarQube coverage reporting

### Fixed
- Broken UI tests
- Added JWT security mocks to controller tests
- Removed dead code
- Boosted overall test coverage to 92%

## [v0.2] - 2026-02-01

### Added
- Comfort mode (#12)
- Preferences (#15)

### Changed
- Routing refactor (#13)

### Fixed
- Dev fix task in path (#17)

## [v0.1] - 2025-12-27

### Added
- **Journey Planning**: Integration with PRIM API (Ile-de-France Mobilites) for real-time journey planning in Paris
- **User Management**: User authentication and profile management with OAuth2 Google integration
- **Google Tasks Integration**: Create and manage tasks linked to your journeys
- **Real-time Perturbations**: Live disruption alerts and reroutage suggestions
- **Progress Tracking**: Track your current journey with live location updates
- **Metro/Bus Display**: Show number of metro and bus connections in journey plans
- **Frontend**: Responsive web interface for journey planning and task management

### Features
- Journey planning with departure/arrival selection
- Real-time disruption notifications
- Live reroutage when perturbations occur
- Google Tasks synchronization
- Location-aware task management
- User location tracking during journeys
- Progress bar for current journey

### Technical
- Spring Boot 3.5.7 backend with Java 21
- H2 database for development
- OAuth2 authentication with Google
- PRIM API client for journey data
- Disruption API client for real-time alerts
- RESTful API endpoints for all features

### Infrastructure
- GitHub Actions CI/CD pipeline
- Automated build and test workflow
- Apache License 2.0
