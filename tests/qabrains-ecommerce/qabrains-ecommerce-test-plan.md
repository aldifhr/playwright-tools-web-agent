# QA Brains E-Commerce Practice Site

## 1. Project Information
| Field | Value |
| --- | --- |
| Project Name | QA Brains E-Commerce Practice Site |
| Tester Name | FarayAgent |
| Date | 2026-09-23 |
| Version | 1.0 |

## 2. Objective
Validate all user flows of the QA Brains e-commerce practice application: login, product browsing, sorting, product details, cart management, checkout, favorites, and logout. Ensure functional correctness, UI integrity, and error handling.

## 3. Scope of Testing
### In Scope
- Login with valid/invalid credentials
- Product listing and sorting (A-Z, Z-A, Price Low-High, Price High-Low)
- Product detail view with quantity controls
- Add to cart from listing and detail page
- Cart management (add, remove, quantity update)
- Checkout flow (info form, overview, confirmation)
- Favorites (add, view, sort)
- User menu and logout
- Navigation between pages

### Out of Scope
- Payment gateway integration
- Mobile responsive testing
- Performance/load testing
- Security penetration testing
- API-level testing
- Email notification verification

## 4. Test Strategy
- Manual exploratory testing of all flows
- Playwright E2E automation for critical paths
- Form validation testing (empty fields, invalid data)
- State persistence testing (cart across page navigation)
- Cross-page navigation verification

## 5. Test Deliverables
- QA Test Plan document (this document)
- Structured test cases (.cases.json)
- Playwright test specs per area
- Test execution results (all green)

## 6. Test Environment
| Environment | Value |
| --- | --- |
| URL | https://practice.qabrains.com/ecommerce |
| Browser | Chromium (Playwright) |
| Test Account | test@qabrains.com / Password123 |
| Framework | Playwright + TypeScript |

## 7. Roles & Responsibilities
| Role | Name | Responsibility |
| --- | --- | --- |
| QA Engineer | FarayAgent | Test planning, case design, automation, execution, and reporting |

## 8. Schedule
| Event | Start Date | End Date |
| --- | --- | --- |
| Exploration & Planning | 2026-09-23 | 2026-09-23 |
| Test Case Design | 2026-09-23 | 2026-09-23 |
| Automation (Playwright) | 2026-09-23 | 2026-09-23 |
| Execution & Fix | 2026-09-23 | 2026-09-23 |

## 9. Risk & Mitigation
| Risk | Mitigation |
| --- | --- |
| Session timeout during checkout flow | Login at start of each test; use beforeEach hook |
| Flaky sort behavior (client-side vs server-side) | Assert first/last product names rather than full list order |
| Cart state leak between tests | Each test starts with fresh login; clear cart if needed |
| Dynamic element selectors (Radix UI) | Use role-based locators and text content matching |

## 10. Approval
| Name | Role | Signature |
| --- | --- | --- |
| FarayAgent | QA Engineer | Automated |
