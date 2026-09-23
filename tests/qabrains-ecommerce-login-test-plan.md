# QA Practice Site - E-commerce Login

## 1. Project Information
| Field | Value |
| --- | --- |
| Project Name | QA Practice Site - E-commerce Login |
| Tester Name | FarayAgent |
| Date | 2026-09-23 |
| Version | 1.0 |

## 2. Objective
Verify login functionality on https://practice.qabrains.com/ecommerce/login including valid login, invalid credentials, empty fields, and edge cases.

## 3. Scope of Testing
### In Scope
- Valid login with correct email and password
- Invalid login with wrong password
- Invalid login with wrong email
- Invalid login with unregistered email
- Empty email field validation
- Empty password field validation
- Both fields empty validation
- Password visibility toggle
- SQL injection prevention
- XSS prevention in email field
- Case sensitivity of email
- Special character handling in email
- Navigation after successful login
- Logout flow

### Out of Scope
- Payment processing
- Product catalog browsing
- Cart functionality
- API testing
- Performance testing
- Mobile responsiveness

## 4. Test Strategy
- Manual exploratory testing
- Automated E2E testing with Playwright
- Boundary value analysis for email and password fields
- Negative testing for invalid credentials
- Security testing for injection attacks

## 5. Test Deliverables
- Test plan document
- Test cases (JSON format)
- Playwright automation spec
- Bug reports (if any)

## 6. Test Environment
| Environment | Value |
| --- | --- |
| URL | https://practice.qabrains.com/ecommerce/login |
| Browser | Chromium (latest) |
| OS | Linux |
| Test Credentials | test@qabrains.com / Password123 |

## 7. Roles & Responsibilities
| Role | Name | Responsibility |
| --- | --- | --- |
| Tester | FarayAgent | Execute test cases, report bugs, automate tests |

## 8. Schedule
| Event | Start Date | End Date |
| --- | --- | --- |
| Exploration & Test Planning | 2026-09-23 | 2026-09-23 |
| Test Case Creation | 2026-09-23 | 2026-09-23 |
| Automation Scripting | 2026-09-23 | 2026-09-23 |
| Test Execution | 2026-09-23 | 2026-09-23 |

## 9. Risk & Mitigation
| Risk | Mitigation |
| --- | --- |
| Site may be down or slow | Retry with backoff, report if unreachable |
| Test credentials may expire | Verify credentials before full run, check hint on page |
| Anti-bot protection may block automation | Use standard Playwright with realistic delays |

## 10. Approval
| Name | Role | Signature |
| --- | --- | --- |
| FarayAgent | QA Engineer | Pending |
