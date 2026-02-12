# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.4] - 2026-02-13

### Added
- Time range restrictions for showcase mode stats display
- Backend switching capability in showcase mode
- Enhanced rule chain flow visualization with zero-traffic chain merging

### Changed
- Improved Traffic Trend skeleton loading to prevent empty state flickering
- Refined Top Domains/Proxies/Regions skeleton heights to match actual content

### Fixed
- Hydration Mismatch error caused by `Math.random()` in skeleton screens

## [1.2.0] - 2026-02-12

### Added
- **Token-based Authentication System**
  - New login dialog
  - Auth Guard for route protection
  - Corresponding backend authentication services
- **Showcase Mode**
  - Restrict backend operations and configuration changes
  - URL masking for enhanced security
  - Standardized forbidden error messages
  - Improved access control checks
- WebSocket token verification for secure real-time communication

### Changed
- Updated project description
- Refined UI layouts for improved responsiveness
- Added Windows detection hook

## [1.1.0] - 2026-02-11

### Changed
- **Project Rebranding**: Renamed from "Clash Master" to "Neko Master"
  - Updated all assets and branding materials
  - Changed package scope from `@clashmaster` to `@neko-master`
  - Cleanup of legacy references
- Restructured web app components into `common`, `layout`, and `features` directories
- Migrated API routes from monolithic `api.ts` to dedicated controllers
- Introduced new `collector` service for backend data management

### Added
- Skeleton loading for better UX
- Domain preview with copy functionality

## [1.0.5] - 2026-02-07

### Changed
- **Upgraded to Next.js 16**
- Migrated manifest to dynamic generation

### Fixed
- Ensured manifest is properly emitted in HTML head
- Added dev image tags for Docker

## [1.0.4] - 2026-02-08 ~ 2026-02-10

### Added
- **WebSocket Real-time Data Support**
  - WebSocket push interval control
  - Service worker caching for connection robustness
  - Client-side push interval control
- Country traffic list sorting (by traffic and connections)
- `useStableTimeRange` hook for consistent time range handling
- `keepPreviousByIdentity` query placeholder
- `ExpandReveal` UI component
- Auto-refresh spinning animation

### Performance
- Optimized WebSocket data payloads and push frequency
- Improved GeoIP lookup efficiency through batching
- Optimized rule chain flow rendering with component memoization
- Throttled data updates for better performance
- Conditional fetching based on active tab

### Changed
- Migrated data fetching to `@tanstack/react-query` for improved state management and caching
- Enhanced Top Domains Chart with stacked traffic and self-fetching data
- Added flag fonts for country/region display

## [1.0.3] - 2026-02-07 ~ 2026-02-08

### Added
- **Interactive Rule Statistics**
  - Paginated domain/IP tables
  - Proxy chain tracking
  - Zero-traffic rules display
- **Device Statistics** with dedicated tables and backend collection
- **IP Statistics** with detailed information
- **Domain Statistics** with filtering capabilities
- Time range filtering for interactive stats
- `CountryFlag` component for visual country/region representation
- Real-time traffic statistics collection
- Zooming support in rule chain flow visualization
- Custom date range display formatting
- Calendar layout refactored to use CSS Grid

### Changed
- Refactored data cleanup to use minute-level statistics
- Enhanced version status display in about dialog

## [1.0.2] - 2026-02-06 ~ 2026-02-07

### Added
- **PWA (Progressive Web App) Support**
  - Service worker implementation
  - Manifest file
  - PWA install functionality
- **Interactive Proxy Statistics**
  - Detailed domain and IP tables
  - Sorting and pagination
  - Per-proxy traffic breakdown
- Database data retention management
- Favicon provider selection
- Docker health checks
- Backend configuration verification
- Toast notifications for better UX
- About dialog with version information
- API endpoint to test existing backend connections by ID

### Changed
- Standardized port environment variables across Dockerfile, docker-compose, and Next.js configuration
- Added package.json version to Docker image tags
- Automated Docker Hub description updates
- Enhanced dashboard mobile experience for tables
- Improved scrollbar and backend error handling UI

### Infrastructure
- Added CI/CD workflows
  - Dev branch hygiene workflow
  - Preview branch creation workflow
  - Enhanced Docker image tagging strategy

## [1.0.1] - 2026-02-06

### Added
- English README documentation
- Language selection support in main README

### Changed
- Enhanced README with first-use setup screenshot
- Updated README header styling with larger logo
- Updated Docker deployment instructions to use pre-built images from Docker Hub

## [1.0.0] - 2026-02-06

### Added
- Initial release of Clash Master
- Modern traffic analytics dashboard for edge gateways
- Real-time network traffic visualization
- Backend management and configuration
- Docker deployment support
- Multi-backend support
- Traffic statistics overview
- Country traffic distribution
- Proxy traffic statistics
- Rule-based traffic analysis
