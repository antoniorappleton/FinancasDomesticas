# Wisebudget PWA Fixes - TODO List

## Phase 1: Core Infrastructure (DONE)
- [x] Create src/lib/helpers.js with shared utility functions
- [x] Convert src/lib/validators.js to ES6 export
- [x] Convert src/lib/repo.js to ES6 export
- [x] Centralize shared formatting (money, dates) in helpers.js

## Phase 2: Screen Refactoring (DONE/IN PROGRESS)
- [x] Update imports in src/screens/settings.js
- [x] Update imports in src/screens/Movimentos.js
- [x] Update imports in src/screens/dashboard.js
- [x] Update imports in src/screens/nova.js
- [x] Update imports in src/screens/health.js
- [x] Update imports in src/screens/Metas.js
- [x] Fix CSV import header mapping and error handling in settings.js

## Phase 3: Testing & Verification
- [ ] Regression test: CSV import functionality with different file types
- [ ] Regression test: PDF report generation in settings
- [ ] Verify all module imports work correctly without global dependency issues
- [ ] Check for remaining global pollution in window object
- [ ] Stress test: App performance with large datasets on mobile

## Technical Debt (Ongoing)
- [ ] Standardize modal and toast usage across all screens using ui.js
- [ ] Improve Supabase RLS error handling in repo.js
- [ ] Document the new module architecture in a README.md inside src/
