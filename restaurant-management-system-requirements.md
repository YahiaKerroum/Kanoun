---
id: RMS-REQUIREMENTS
status: approved
version: 0.2
owner: product
last_reviewed: 2026-07-27
source_of_truth_for:
  - product-behavior
  - acceptance-criteria
depends_on:
  - MVP-SCOPE
  - PRODUCT-DECISIONS
---

# Restaurant Management System

## Software Requirements and User Stories

**Document status:** Approved MVP baseline  
**Version:** 0.2  
**Product type:** Multi-restaurant, multi-branch management platform  
**Initial focus:** Dine-in restaurant operations  
**Release scope:** `docs/product/mvp-scope.yaml`  
**Product decisions:** `docs/product/decision-register.md`

---

## 1. Purpose

This document defines the functional and non-functional requirements for a configurable restaurant management system.

The product is intended to serve both:

- Small restaurants where a few employees perform several responsibilities.
- Larger restaurants where work is divided between managers, cashiers, waiters, cooks, inventory staff, and cleaners.

The system must support operational complexity without forcing it on every restaurant. New restaurants should receive a simple working configuration and should be able to enable more advanced capabilities as they grow.

---

## 2. Product Vision

The product will allow restaurant businesses to manage one or more restaurants and branches from a single platform. It will connect customer ordering, table management, kitchen preparation, order delivery, payment recording, inventory availability, staff access, and management reporting.

Customers will be able to scan a table QR code, view the available menu, customize dishes, place an order, follow its progress, and request cancellation or a bill. Staff record payments; the MVP does not process funds online. Assistance requests and reviews are post-MVP capabilities.

Restaurant employees will receive access based on their actual responsibilities rather than being restricted to fixed job titles. Restaurant administrators will also be able to enable or disable complete product features and configure how enabled features behave.

---

## 3. Design Principles

### 3.1 Simple by default

A small restaurant must be able to begin operating without configuring specialized roles, complex workflows, or unnecessary employee accounts.

### 3.2 Progressive complexity

Advanced workflows such as order approval, individual cook assignment, waiter assignment, restocking approval, and cleaning tasks must be optional.

### 3.3 Responsibilities instead of mandatory job titles

Terms such as *waiter*, *cashier*, and *inventory manager* describe common responsibilities. They do not require separate employees. One employee may hold several responsibilities.

### 3.4 Individual permissions

Access will be granted to specific users through action-level permissions such as:

- `orders.view`
- `orders.accept`
- `orders.assign`
- `orders.complete`
- `payments.record`
- `inventory.edit`
- `employees.manage_permissions`

Permission templates may be provided for convenience, but administrators must be able to customize permissions for each employee.

### 3.5 Feature-level configuration

Restaurant administrators must be able to enable or disable complete modules, including inventory, customer reviews, cleaning tasks, and cook assignments.

### 3.6 Configurable workflows

An enabled feature may include configurable behavior. For example, a restaurant may enable kitchen operations while disabling individual cook assignment.

### 3.7 Data preservation

Disabling a feature must not delete its historical data. Data should become available again if the feature is re-enabled.

### 3.8 Branch isolation

Employees must only access restaurants and branches assigned to them, unless explicitly given broader access.

---

## 4. Scope

### 4.1 MVP scope

- Management of multiple restaurants and branches.
- Restaurant and branch configuration.
- Bounded feature configuration using the approved catalogue.
- Employee accounts and individual permissions.
- Permission templates.
- Branch-specific access.
- Menu, category, dish, option, and customization management.
- QR-based customer access.
- Customer ordering without a required customer account.
- Table-session assignment and derived table availability.
- Automatic order acceptance and a fixed MVP workflow.
- Kitchen preparation without stations or individual cook assignment.
- In-application operational notifications.
- Order serving and completion.
- Payment recording.
- Operational dashboards and reports.
- Audit history for sensitive actions.

The exact story-level release boundary is authoritative in `docs/product/mvp-scope.yaml`.

### 4.2 Potential future scope

- Delivery and takeaway.
- Table reservations.
- Supplier integrations.
- Full purchasing and accounting.
- Payroll and employee scheduling.
- Customer loyalty programs.
- Promotions and coupons.
- Native mobile applications.
- Third-party point-of-sale integrations.
- Online payment gateways.
- Tax authority or fiscal device integrations.
- Quantity-based inventory, recipes, deductions, and restocking.
- Customer reviews.
- Cleaning-task workflow.
- Partial or split payments.
- Table reservations and table combining.
- Kitchen stations, cook assignment, and partial serving.

### 4.3 Initially out of scope

Unless later prioritized, the first release will not attempt to replace:

- Full accounting software.
- Payroll systems.
- Human-resources platforms.
- Enterprise supply-chain systems.
- Delivery marketplace platforms.

---

## 5. Terminology

| Term | Definition |
|---|---|
| Business account | The top-level organization that owns or operates restaurants. |
| Tenant | The security boundary represented by one business account. |
| Restaurant | A restaurant brand or business managed by the account. |
| Branch | A physical restaurant location. |
| Module | A complete product capability that can be enabled or disabled. |
| Workflow setting | A setting that changes how an enabled module behaves. |
| Permission | Authorization to perform a specific action on a resource. |
| Permission template | A reusable starting collection of permissions, sometimes presented as a role. |
| Customer session | A temporary session created when a customer opens the menu or scans a QR code. |
| Table session | One dining party's occupancy of a table. It can contain several customer sessions and orders. |
| Order | A customer request containing one or more order items. |
| Order item | A snapshot of a selected dish, its price, quantity, and customizations at ordering time. |
| Kitchen station | An optional preparation area such as grill, pizza, drinks, or desserts. |
| Required ingredient | An ingredient whose unavailability prevents a dish from being prepared. |
| Configuration version | An immutable snapshot reference used by active workflows when settings later change. |

---

## 6. Actors

The following actors represent responsibilities, not mandatory separate employees.

### 6.1 Business owner

Manages one or more restaurants, branches, administrators, and combined reporting.

### 6.2 Restaurant administrator

Configures restaurant features, workflows, employees, permissions, menus, and operational settings.

### 6.3 Branch manager

Manages authorized operations for one or more assigned branches.

### 6.4 Staff user

Uses the system according to individually assigned permissions. A staff user may act as a cashier, order coordinator, waiter, kitchen coordinator, cook, inventory worker, cleaner, or a combination of these.

### 6.5 Staff member without an account

Represents an employee who participates in restaurant operations without using an individual portal. An authorized user may assign work to or record work for this employee.

### 6.6 Customer

Uses a QR-accessible interface to browse the menu, customize dishes, order, track progress, request cancellation, and request a bill.

### 6.7 Platform administrator

Operates the overall software platform. This actor is separate from restaurant administrators and must not normally access restaurant operational data without a legitimate support or administrative reason.

---

## 7. Authorization and Configuration Model

An employee action is allowed only when all applicable conditions are satisfied:

```text
The module is enabled
AND the user account is active
AND the user has access to the restaurant and branch
AND the user has the required action permission
AND the target resource is in a valid state
```

For example, an employee may have `orders.complete`, but the system may still prevent completion when the order has an unpaid balance.

The product will use four distinct configuration layers:

| Layer | Question answered | Example |
|---|---|---|
| Module availability | Does the restaurant use this feature? | Inventory is enabled. |
| Workflow configuration | How does the feature operate? | Incoming orders require approval. |
| Individual permission | Who may perform the action? | Samir may approve orders. |
| Branch scope | Where may the user perform it? | Samir may approve orders in Branch A only. |

Permission templates are shortcuts and must not be the only authorization mechanism.

---

# 8. Functional Requirements and User Stories

Each story's release and readiness are defined in `docs/product/mvp-scope.yaml`. Acceptance criteria are normative only for stories marked `mvp` and `ready`. Canonical states, permissions, features, and business rules live in their linked catalogues and must not be redefined by an implementation.

## Epic A — Business, Restaurant, and Branch Management

### US-A01 — Create and manage restaurants

**As a business owner, I want to create and manage multiple restaurants so that I can operate them from one account.**

#### Acceptance criteria

- **AC-US-A01-01:** The owner can create, view, edit, activate, and deactivate a restaurant.
- **AC-US-A01-02:** Each restaurant can have independent branding, settings, menus, employees, and branches.
- **AC-US-A01-03:** Restaurant data is isolated from other restaurants.
- **AC-US-A01-04:** Deactivation does not delete historical records.

### US-A02 — Create and manage branches

**As a business owner or authorized administrator, I want to create branches so that each physical location can be managed independently.**

#### Acceptance criteria

- **AC-US-A02-01:** A branch contains a name, address, contact information, time zone, currency, and opening hours.
- **AC-US-A02-02:** Each branch can maintain its own tables, employees, orders, menu availability, and inventory.
- **AC-US-A02-03:** Authorized users can switch between assigned branches.
- **AC-US-A02-04:** Users without cross-branch access cannot view other branches.

### US-A03 — View combined business information

**As a business owner, I want to view information across restaurants and branches so that I can understand the overall business.**

#### Acceptance criteria

- **AC-US-A03-01:** The owner can filter information by restaurant, branch, and date range.
- **AC-US-A03-02:** Combined values must not hide the originating restaurant or branch.
- **AC-US-A03-03:** Access remains subject to the owner’s assigned scope.

### US-A04 — Configure branch operating information

**As an authorized administrator, I want to configure branch information so that customers and employees receive accurate operational details.**

#### Acceptance criteria

- **AC-US-A04-01:** The administrator can configure opening hours, contact information, currency, and service status.
- **AC-US-A04-02:** A closed or temporarily unavailable branch cannot accept new customer orders unless an override is configured.

---

## Epic B — Feature and Workflow Configuration

### US-B01 — Enable or disable modules

**As a restaurant administrator, I want to enable or disable complete product modules so that the system matches the restaurant’s needs.**

#### Acceptance criteria

- **AC-US-B01-01:** The administrator can see available modules and their current states.
- **AC-US-B01-02:** Disabled modules are removed from normal employee and customer navigation.
- **AC-US-B01-03:** Related automated actions and notifications stop when a module is disabled.
- **AC-US-B01-04:** Disabling a module does not delete its data.
- **AC-US-B01-05:** Re-enabling a module restores access to preserved data.
- **AC-US-B01-06:** The system warns the administrator about affected workflows and dependencies.

### US-B02 — Configure module behavior

**As a restaurant administrator, I want to configure the behavior of enabled modules so that the system matches the restaurant’s operational process.**

#### Acceptance criteria

- **AC-US-B02-01:** Configuration options are presented only for enabled modules.
- **AC-US-B02-02:** The administrator can configure whether orders require approval.
- **AC-US-B02-03:** The administrator can configure customer or employee table assignment.
- **AC-US-B02-04:** The administrator can enable or disable individual cook assignment.
- **AC-US-B02-05:** The administrator can configure whether ready orders require waiter assignment.
- **AC-US-B02-06:** The administrator can configure whether customer names are required.

### US-B03 — Start with a default configuration

**As a new restaurant administrator, I want a usable default configuration so that I can start without understanding every advanced setting.**

#### Acceptance criteria

- **AC-US-B03-01:** A new restaurant receives a documented default workflow.
- **AC-US-B03-02:** Optional advanced steps are disabled by default.
- **AC-US-B03-03:** The administrator can change the configuration later.
- **AC-US-B03-04:** Setup does not require creating every possible employee type.

### US-B04 — Validate feature dependencies

**As an administrator, I want the system to identify module dependencies so that I do not create an invalid configuration.**

#### Acceptance criteria

- **AC-US-B04-01:** The system explains why a dependent feature cannot be enabled or disabled.
- **AC-US-B04-02:** The administrator receives a confirmation warning when a change affects active workflows.
- **AC-US-B04-03:** Existing active orders cannot be left in an impossible state.

---

## Epic C — Employee Accounts, Permissions, and Access

### US-C01 — Add and manage employees

**As an authorized administrator, I want to add employees so that they can participate in restaurant operations.**

#### Acceptance criteria

- **AC-US-C01-01:** The administrator can create, view, edit, activate, and deactivate an employee.
- **AC-US-C01-02:** An employee can be assigned to one or more permitted branches.
- **AC-US-C01-03:** Deactivating an employee prevents future login without deleting historical activity.
- **AC-US-C01-04:** Employee records can exist with or without login accounts.

### US-C02 — Grant individual permissions

**As an authorized administrator, I want to grant permissions to a specific employee so that access reflects the employee’s actual responsibilities.**

#### Acceptance criteria

- **AC-US-C02-01:** Permissions are grouped by module and resource.
- **AC-US-C02-02:** Permissions can be granted or revoked independently.
- **AC-US-C02-03:** Changes take effect without requiring a new employee account.
- **AC-US-C02-04:** Changes are recorded in an audit log.
- **AC-US-C02-05:** An administrator cannot grant access beyond the administrator’s own authority.

### US-C03 — Assign multiple responsibilities

**As an administrator, I want one employee to hold multiple responsibilities so that the system supports small teams.**

#### Acceptance criteria

- **AC-US-C03-01:** A user can receive permissions from several functional areas.
- **AC-US-C03-02:** The employee sees a unified interface containing only accessible features.
- **AC-US-C03-03:** The system does not require separate accounts for each responsibility.

### US-C04 — Apply a permission template

**As an administrator, I want to apply a predefined permission template so that common employees can be configured quickly.**

#### Acceptance criteria

- **AC-US-C04-01:** MVP templates are Administrator, General Staff, Cashier, and Kitchen Staff as defined in `docs/security/permissions.yaml`.
- **AC-US-C04-02:** Applying a template grants its configured permissions.
- **AC-US-C04-03:** The administrator can customize an employee after applying a template.
- **AC-US-C04-04:** Later changes to a template do not silently change existing users unless explicitly confirmed.

### US-C05 — Create custom permission templates

**Release:** Post-MVP.

**As an administrator, I want to create reusable permission templates so that similar employees can be configured consistently.**

#### Acceptance criteria

- **AC-US-C05-01:** The administrator can name, create, edit, duplicate, and deactivate a template.
- **AC-US-C05-02:** Templates are scoped to the appropriate business or restaurant.
- **AC-US-C05-03:** Template changes clearly indicate whether existing users will be affected.

### US-C06 — Configure branch scope

**As an administrator, I want to control which branches an employee can access so that the employee only sees relevant locations.**

#### Acceptance criteria

- **AC-US-C06-01:** Branch access can be assigned per employee.
- **AC-US-C06-02:** Permission grants can be independently scoped to each assigned branch.
- **AC-US-C06-03:** Every branch-scoped query and action enforces the assigned scope.

### US-C07 — Represent employees without portals

**As a manager, I want to register employees who do not need system accounts so that the recorded workforce reflects actual operations.**

#### Acceptance criteria

- **AC-US-C07-01:** The employee can be referenced in assignments and reports without login credentials.
- **AC-US-C07-02:** Authorized users can update tasks on the employee’s behalf.
- **AC-US-C07-03:** Adding an account later preserves the employee’s identifier and complete history.

### US-C08 — View a permission-aware portal

**As an employee, I want to see only relevant modules and actions so that the interface remains simple and understandable.**

#### Acceptance criteria

- **AC-US-C08-01:** Unauthorized pages and actions are not displayed.
- **AC-US-C08-02:** Direct access to an unauthorized endpoint is also rejected.
- **AC-US-C08-03:** Employees with several responsibilities see all authorized capabilities in one account.

---

## Epic D — Menu Management

### US-D01 — Manage menu categories

**As an authorized employee, I want to organize dishes into categories so that customers can browse the menu easily.**

#### Acceptance criteria

- **AC-US-D01-01:** Categories can be created, edited, ordered, hidden, and deactivated.
- **AC-US-D01-02:** Categories belong to the restaurant menu; branches may override dish visibility but do not own separate category definitions in the MVP.
- **AC-US-D01-03:** Deactivation does not remove historical order information.

### US-D02 — Manage dishes

**As an authorized employee, I want to create and maintain dishes so that the digital menu remains accurate.**

#### Acceptance criteria

- **AC-US-D02-01:** A dish must include a name, category, base price, currency, and availability; description and image are optional.
- **AC-US-D02-02:** Branch-specific price and availability overrides are supported.
- **AC-US-D02-03:** A dish can be temporarily unavailable without being deleted.
- **AC-US-D02-04:** Price changes do not alter previously submitted orders.

### US-D03 — Configure dish options

**As an authorized employee, I want to define structured dish options so that customers can customize orders clearly.**

#### Acceptance criteria

- **AC-US-D03-01:** Options can be required or optional.
- **AC-US-D03-02:** Options can support single or multiple selection.
- **AC-US-D03-03:** Options can add or subtract from the base price.
- **AC-US-D03-04:** Minimum and maximum selections can be configured.
- **AC-US-D03-05:** The configured minimum cannot exceed the maximum.
- **AC-US-D03-06:** A valid option combination cannot produce a negative item price.

### US-D04 — Accept customer notes

**As a customer, I want to add preparation notes so that I can communicate preferences not covered by predefined options.**

#### Acceptance criteria

- **AC-US-D04-01:** Notes are displayed clearly to relevant employees.
- **AC-US-D04-02:** The restaurant can enable or disable free-text notes.
- **AC-US-D04-03:** The interface states that free-text notes are requests, do not change price or declared availability, and are not guaranteed.

### US-D05 — Preserve an order-item snapshot

**As a restaurant operator, I want submitted order items to preserve their original details so that historical orders remain financially accurate.**

#### Acceptance criteria

- **AC-US-D05-01:** Each submitted item stores the dish name, unit price, selected options, option prices, tax-inclusive treatment, currency, quantity, and notes at ordering time.
- **AC-US-D05-02:** Later menu changes do not modify submitted or completed orders.

---

## Epic E — QR Access and Customer Menu

### US-E01 — Generate QR codes

**As an authorized administrator, I want to generate QR codes so that customers can access the correct branch menu.**

#### Acceptance criteria

- **AC-US-E01-01:** A QR code identifies the restaurant and branch.
- **AC-US-E01-02:** An ordering QR code identifies one branch and table; a branch-only QR code is browse-only.
- **AC-US-E01-03:** Authorized users can download or print QR codes.
- **AC-US-E01-04:** Deactivated QR codes no longer create valid ordering sessions.

### US-E02 — Browse the available menu

**As a customer, I want to scan a QR code and browse the current menu so that I can choose available dishes.**

#### Acceptance criteria

- **AC-US-E02-01:** A customer account is not required.
- **AC-US-E02-02:** The menu belongs to the correct restaurant and branch.
- **AC-US-E02-03:** Categories, dishes, prices, and availability are displayed.
- **AC-US-E02-04:** Unavailable dishes are hidden or clearly marked according to restaurant settings.

### US-E03 — Create a customer session

**As a customer, I want the system to remember my current table and order activity so that I can continue ordering from my device.**

#### Acceptance criteria

- **AC-US-E03-01:** The session is associated with the correct branch.
- **AC-US-E03-02:** A table-specific QR associates the session with its table.
- **AC-US-E03-03:** Sessions expire after 4 hours of inactivity and an absolute maximum of 12 hours.
- **AC-US-E03-04:** Expired sessions cannot modify active or historical orders.

### US-E04 — Provide customer identification

**As a customer, I want to provide my name when needed so that staff can identify my order.**

#### Acceptance criteria

- **AC-US-E04-01:** The restaurant can make the customer name optional or required.
- **AC-US-E04-02:** The customer is not required to create a permanent account.
- **AC-US-E04-03:** The name is stored only where operationally necessary.

---

## Epic F — Table and Seating Management

### US-F01 — Manage tables

**As an authorized employee, I want to manage restaurant tables so that orders and seating can be coordinated.**

#### Acceptance criteria

- **AC-US-F01-01:** A table has a unique identifier within its branch.
- **AC-US-F01-02:** Tables can be activated, deactivated, and optionally grouped by area.
- **AC-US-F01-03:** MVP states are Available, Occupied, Out of Service, and Inactive.
- **AC-US-F01-04:** Occupied is derived from an open table session; the other states follow the precedence in `docs/domain/workflows.yaml`.
- **AC-US-F01-05:** Reservations and cleaning states are not part of the MVP.

### US-F02 — Automatically identify a table

**As a customer, I want my table to be identified from its QR code so that I do not need to choose it manually.**

#### Acceptance criteria

- **AC-US-F02-01:** The customer can verify the detected table before ordering.
- **AC-US-F02-02:** The system prevents using a QR code for a different branch.
- **AC-US-F02-03:** Changing the detected table follows restaurant policy.

### US-F03 — Let a customer choose a table

**Release:** Post-MVP. MVP ordering requires a table-specific QR code.

**As a customer, I want to select an available table when the restaurant permits it so that I can choose where to sit.**

#### Acceptance criteria

- **AC-US-F03-01:** Only selectable tables are displayed.
- **AC-US-F03-02:** The selection is confirmed before submission.
- **AC-US-F03-03:** Concurrent selection conflicts are handled safely.

### US-F04 — Assign a table as an employee

**As an authorized employee, I want to assign or change an order’s table so that seating can be controlled by staff.**

#### Acceptance criteria

- **AC-US-F04-01:** The employee can see current table states.
- **AC-US-F04-02:** Assignments are recorded with time and responsible user.
- **AC-US-F04-03:** The system warns about occupied or conflicting tables.

### US-F05 — Support multiple orders at one table

**As restaurant staff, I want a table to support multiple orders so that customers can order separately or add more items later.**

#### Acceptance criteria

- **AC-US-F05-01:** Orders remain individually identifiable.
- **AC-US-F05-02:** Payment is handled per order in the MVP.
- **AC-US-F05-03:** The system does not mix customer notes or item ownership unintentionally.

---

## Epic G — Customer Ordering

### US-G01 — Build an order

**As a customer, I want to add, update, and remove menu items before submission so that I can review my choices.**

#### Acceptance criteria

- **AC-US-G01-01:** Quantities and customizations can be changed before submission.
- **AC-US-G01-02:** The running total updates when selections change.
- **AC-US-G01-03:** Unavailable items cannot be newly added.

### US-G02 — Review and submit an order

**As a customer, I want to review and submit my order so that the restaurant can begin processing it.**

#### Acceptance criteria

- **AC-US-G02-01:** The customer sees items, quantities, customizations, prices, and total.
- **AC-US-G02-02:** Required customer or table information is validated.
- **AC-US-G02-03:** The order receives a unique branch-level reference.
- **AC-US-G02-04:** The customer receives confirmation that submission succeeded.
- **AC-US-G02-05:** Relevant employees are notified according to configuration.

### US-G03 — Add items after an initial order

**As a customer, I want to place an additional order during the same table session so that I can request more items without restarting.**

#### Acceptance criteria

- **AC-US-G03-01:** Additional items always create a new traceable order in the same table session.
- **AC-US-G03-02:** Previously accepted items are not silently modified.
- **AC-US-G03-03:** Staff can identify that orders belong to the same table session.

### US-G04 — Track order progress

**As a customer, I want to see a simplified order status so that I know whether my order has been received, prepared, or served.**

#### Acceptance criteria

- **AC-US-G04-01:** Internal operational details that are not customer-relevant remain hidden.
- **AC-US-G04-02:** Status updates appear without requiring a new order.
- **AC-US-G04-03:** Cancelled or rejected orders display a customer-safe reason that contains no internal or personal data.

### US-G05 — Cancel or request cancellation

**As a customer, I want to cancel or request cancellation when permitted so that mistakes can be corrected.**

#### Acceptance criteria

- **AC-US-G05-01:** Cancellation availability depends on order state and restaurant policy.
- **AC-US-G05-02:** A customer cannot cancel an item already beyond the allowed stage.
- **AC-US-G05-03:** Staff receive the request when approval is required.
- **AC-US-G05-04:** Cancellation history and reason are preserved.

### US-G06 — Create an order as staff

**As an authorized employee, I want to create an order for a seated customer so that guests without a usable device can still be served.**

#### Acceptance criteria

- **AC-US-G06-01:** The employee must have `orders.create` for the branch.
- **AC-US-G06-02:** The employee selects an available or currently occupied table in the same branch.
- **AC-US-G06-03:** Menu availability, option rules, prices, and totals are validated by the server.
- **AC-US-G06-04:** The order follows the same snapshot, idempotency, kitchen, audit, and state rules as a guest order.

---

## Epic H — Order Processing

### US-H01 — Review incoming orders

**Release:** Post-MVP. The MVP uses automatic acceptance.

**As an authorized employee, I want to review incoming orders so that the restaurant can confirm they are valid and can be prepared.**

#### Acceptance criteria

- **AC-US-H01-01:** Approval can be enabled or disabled by restaurant configuration.
- **AC-US-H01-02:** An employee can accept or reject an order when authorized.
- **AC-US-H01-03:** Rejection requires a reason.
- **AC-US-H01-04:** The customer receives an appropriate status update.

### US-H02 — Use a configurable order lifecycle

**As an administrator, I want to configure optional order-processing steps so that the workflow matches the restaurant’s operation.**

#### Acceptance criteria

- **AC-US-H02-01:** Approval, fulfilment, financial, and closure are separate state machines.
- **AC-US-H02-02:** The canonical transitions are defined in `docs/domain/workflows.yaml`.
- **AC-US-H02-03:** The MVP automatically moves approval from Submitted to Accepted during successful submission.
- **AC-US-H02-04:** Refunded is financial state, not an order fulfilment or closure state.
- **AC-US-H02-05:** Invalid state transitions are rejected.
- **AC-US-H02-06:** Active orders retain their configuration version and remain valid when configuration changes.

### US-H03 — View active orders

**As an authorized employee, I want to view active orders relevant to my responsibilities so that I know what requires attention.**

#### Acceptance criteria

- **AC-US-H03-01:** Orders can be filtered by state, table, employee, station, and time.
- **AC-US-H03-02:** Branch scope and permissions are enforced.
- **AC-US-H03-03:** Urgent or delayed orders are visually distinguishable.

### US-H04 — Modify an active order

**As an authorized employee, I want to correct an active order so that customer or staff mistakes can be resolved.**

#### Acceptance criteria

- **AC-US-H04-01:** Modification is limited by order state and permission.
- **AC-US-H04-02:** Price-changing modifications recalculate the outstanding amount.
- **AC-US-H04-03:** Removed or changed items remain visible in audit history.
- **AC-US-H04-04:** Relevant kitchen staff are notified of changes.

### US-H05 — Cancel an order

**As an authorized employee, I want to cancel an order with a reason so that exceptional cases are handled transparently. Manual rejection is post-MVP with manual acceptance.**

#### Acceptance criteria

- **AC-US-H05-01:** The user must have the required permission.
- **AC-US-H05-02:** A reason is mandatory.
- **AC-US-H05-03:** The creating guest session and branch users with `orders.view` receive the customer-safe cancellation or rejection update.
- **AC-US-H05-04:** Related payment handling is triggered when money has already been recorded.

---

## Epic I — Kitchen Operations

### US-I01 — View the kitchen queue

**As an authorized kitchen employee, I want to see items waiting for preparation so that the kitchen can process orders efficiently.**

#### Acceptance criteria

- **AC-US-I01-01:** Items display quantity, dish name, options, notes, order number, and relevant timing.
- **AC-US-I01-02:** MVP kitchen items are grouped by order; preparation-station grouping is post-MVP.
- **AC-US-I01-03:** New and changed items are clearly identified.

### US-I02 — Assign items to a cook or station

**Release:** Post-MVP.

**As an authorized coordinator, I want to assign order items to a cook or kitchen station so that preparation responsibility is clear.**

#### Acceptance criteria

- **AC-US-I02-01:** Assignment is optional and controlled by restaurant configuration.
- **AC-US-I02-02:** Different items from one order may be assigned separately.
- **AC-US-I02-03:** Assignment to an employee without a portal is supported.
- **AC-US-I02-04:** Authorized employees can reassign work.

### US-I03 — Start preparation

**As an authorized kitchen employee, I want to mark an item as preparing so that others can see that work has started.**

#### Acceptance criteria

- **AC-US-I03-01:** The start time is recorded.
- **AC-US-I03-02:** Duplicate preparation starts are handled safely.
- **AC-US-I03-03:** The transition records the authenticated user and, when acting on behalf of an employee without an account, that employee reference separately.

### US-I04 — Mark an item as ready

**As an authorized kitchen employee, I want to mark an item as ready so that it can be delivered.**

#### Acceptance criteria

- **AC-US-I04-01:** The completion time is recorded.
- **AC-US-I04-02:** The overall order becomes ready according to the configured readiness rule.
- **AC-US-I04-03:** Relevant staff receive a notification.

### US-I05 — Handle partial readiness

**Release:** Post-MVP. The MVP requires all kitchen items to be ready before the order is ready.

**As restaurant staff, I want to see when only part of an order is ready so that the restaurant can decide whether to serve items together or separately.**

#### Acceptance criteria

- **AC-US-I05-01:** Each order item maintains an independent preparation state.
- **AC-US-I05-02:** The restaurant can configure whether partial delivery is allowed.
- **AC-US-I05-03:** Staff can distinguish partially ready from fully ready orders.

---

## Epic J — Serving and Customer Assistance

### US-J01 — Receive a ready-order notification

**As the employee responsible for delivery, I want to receive a notification when an order is ready so that it reaches the correct table promptly.**

#### Acceptance criteria

- **AC-US-J01-01:** The notification contains the order reference and table.
- **AC-US-J01-02:** Notifications respect branch scope and assignments.
- **AC-US-J01-03:** The employee can acknowledge or collect the order.

### US-J02 — Assign a ready order for delivery

**Release:** Post-MVP.

**As an authorized employee, I want to assign a ready order to a waiter so that delivery responsibility is clear.**

#### Acceptance criteria

- **AC-US-J02-01:** Waiter assignment is optional.
- **AC-US-J02-02:** Only eligible employees are selectable.
- **AC-US-J02-03:** The assigned employee receives a notification.
- **AC-US-J02-04:** Reassignment is recorded.

### US-J03 — Mark an order as served

**As an authorized employee, I want to mark an order as served so that its operational state is accurate.**

#### Acceptance criteria

- **AC-US-J03-01:** The serving time and responsible employee are recorded.
- **AC-US-J03-02:** Partial serving is supported when enabled.
- **AC-US-J03-03:** Invalid transitions are prevented.

### US-J04 — Request staff assistance

**Release:** Post-MVP.

**As a customer, I want to request assistance from my table so that I can contact staff without leaving my seat.**

#### Acceptance criteria

- **AC-US-J04-01:** The request identifies the table and request type.
- **AC-US-J04-02:** Relevant employees receive the request.
- **AC-US-J04-03:** An employee can acknowledge and complete it.
- **AC-US-J04-04:** Repeated accidental requests are rate-limited.

---

## Epic K — Payments and Completion

### US-K01 — Request the bill

**As a customer, I want to request the bill so that staff know I am ready to pay.**

#### Acceptance criteria

- **AC-US-K01-01:** The request identifies one order in the MVP.
- **AC-US-K01-02:** Active branch users with `payments.view` receive the notification.
- **AC-US-K01-03:** At most one open bill request exists per order; repeated requests return the existing request.
- **AC-US-K01-04:** The order records one open bill request; the table remains Occupied while its table session is open.

### US-K02 — Record a payment

**As an authorized employee, I want to record a payment so that revenue and outstanding balances are accurate.**

#### Acceptance criteria

- **AC-US-K02-01:** The payment includes amount, method, time, currency, responsible employee, and an optional external reference.
- **AC-US-K02-02:** Supported MVP methods are manually recorded cash and card.
- **AC-US-K02-03:** The payment must equal the order's outstanding balance; partial, split, and table-level combined payments are post-MVP.
- **AC-US-K02-04:** A recorded payment cannot be modified or deleted. Corrections use an append-only reversal or refund with specific permission, reason, and audit.

### US-K03 — Complete an order

**As an authorized employee, I want to complete a paid order so that it moves from active operations to history.**

#### Acceptance criteria

- **AC-US-K03-01:** Completion requires fulfilment state Served and financial state Paid.
- **AC-US-K03-02:** An authorized override requires a reason.
- **AC-US-K03-03:** The final total, payment status, completion time, and employee are preserved.
- **AC-US-K03-04:** Completed orders remain searchable.

### US-K04 — Refund a payment

**As an authorized employee, I want to record a refund so that financial history remains accurate.**

#### Acceptance criteria

- **AC-US-K04-01:** Refunds require a reason and specific permission.
- **AC-US-K04-02:** Partial and full refunds can be distinguished.
- **AC-US-K04-03:** The original payment remains visible.
- **AC-US-K04-04:** Refunds are append-only and cannot exceed the amount recorded against the original payment.
- **AC-US-K04-05:** The action is included in the audit log and reports.

---

## Epic L — Customer Reviews

**Release:** Post-MVP.

### US-L01 — Submit a review

**As a customer, I want to review a completed experience so that I can provide feedback to the restaurant.**

#### Acceptance criteria

- **AC-US-L01-01:** Reviews are available only when the feature is enabled.
- **AC-US-L01-02:** A review is linked to a valid completed order or table session.
- **AC-US-L01-03:** The customer can provide a rating and optional comment.
- **AC-US-L01-04:** Duplicate reviews for the same review invitation are prevented.

### US-L02 — View customer feedback

**As an authorized manager, I want to view customer reviews so that I can identify service improvements.**

#### Acceptance criteria

- **AC-US-L02-01:** Reviews can be filtered by branch, date, and rating.
- **AC-US-L02-02:** Access follows branch permissions.
- **AC-US-L02-03:** Review records identify the related order without unnecessarily exposing customer information.

---

## Epic M — Ingredients and Inventory

**Release:** Post-MVP. MVP availability is managed directly on dishes and branch overrides.

### US-M01 — Manage ingredients

**As an authorized employee, I want to manage ingredients so that dish availability and stock can be monitored.**

#### Acceptance criteria

- **AC-US-M01-01:** Ingredients can be created, edited, activated, and deactivated.
- **AC-US-M01-02:** Branch-level stock and availability are supported.
- **AC-US-M01-03:** Units of measurement are recorded consistently.

### US-M02 — Link ingredients to dishes

**As an authorized employee, I want to define the ingredients required by a dish so that availability can be calculated.**

#### Acceptance criteria

- **AC-US-M02-01:** Ingredients can be marked required or optional.
- **AC-US-M02-02:** A quantity and unit may be recorded for stock deduction.
- **AC-US-M02-03:** Dish recipes are not exposed to customers unless explicitly configured.

### US-M03 — Update ingredient availability

**As an authorized employee, I want to mark an ingredient as available or unavailable so that the menu reflects kitchen capability.**

#### Acceptance criteria

- **AC-US-M03-01:** The change applies to the selected branch.
- **AC-US-M03-02:** Affected dishes are identified before confirmation.
- **AC-US-M03-03:** The action is recorded with user and time.

### US-M04 — Automatically update dish availability

**As a restaurant operator, I want dishes to become unavailable when required ingredients are unavailable so that customers cannot order food that cannot be prepared.**

#### Acceptance criteria

- **AC-US-M04-01:** Required ingredient unavailability affects the dish automatically.
- **AC-US-M04-02:** Optional ingredient unavailability does not disable the dish unless configured.
- **AC-US-M04-03:** Staff can see the reason for automatic unavailability.
- **AC-US-M04-04:** Authorized manual overrides are supported and audited.
- **AC-US-M04-05:** Customer menus update promptly.

### US-M05 — Deduct ingredient stock

**As an inventory operator, I want ingredient quantities to be adjusted from accepted orders so that stock estimates remain useful.**

#### Acceptance criteria

- **AC-US-M05-01:** Automatic deduction is optional.
- **AC-US-M05-02:** Deduction timing is configurable, such as on acceptance or preparation.
- **AC-US-M05-03:** Cancellation and refund behavior is defined.
- **AC-US-M05-04:** Manual corrections require permission and a reason.

### US-M06 — Receive low-stock warnings

**As an authorized employee, I want to receive low-stock warnings so that ingredients can be replenished before they run out.**

#### Acceptance criteria

- **AC-US-M06-01:** Each ingredient may have a branch-specific threshold.
- **AC-US-M06-02:** Warnings identify the ingredient, branch, and current estimated quantity.
- **AC-US-M06-03:** Authorized employees can acknowledge the warning.

### US-M07 — Submit a restocking request

**As an authorized employee, I want to request restocking so that the responsible manager knows what must be ordered.**

#### Acceptance criteria

- **AC-US-M07-01:** The request includes ingredient, branch, requested quantity, unit, urgency, and optional notes.
- **AC-US-M07-02:** Authorized recipients are notified.
- **AC-US-M07-03:** Request states may include Requested, Approved, Ordered, Received, and Rejected.

### US-M08 — Process a restocking request

**As an authorized manager, I want to approve, reject, and update restocking requests so that replenishment work can be tracked.**

#### Acceptance criteria

- **AC-US-M08-01:** Approval workflow is optional.
- **AC-US-M08-02:** Rejection requires a reason.
- **AC-US-M08-03:** Receiving stock updates the appropriate branch quantity when enabled.
- **AC-US-M08-04:** Every state change is recorded.

---

## Epic N — Cleaning Tasks

**Release:** Post-MVP. Table-session closure makes the table available directly in the MVP.

### US-N01 — Request table cleaning

**As an authorized employee, I want to request table cleaning so that the table can be prepared for the next customer.**

#### Acceptance criteria

- **AC-US-N01-01:** The request identifies the branch and table.
- **AC-US-N01-02:** The table changes to Needs Cleaning when configured.
- **AC-US-N01-03:** The task may be unassigned or assigned to an employee.
- **AC-US-N01-04:** Relevant staff are notified.

### US-N02 — Complete table cleaning

**As an authorized employee, I want to complete a cleaning task so that the table becomes available again.**

#### Acceptance criteria

- **AC-US-N02-01:** Completion records the time and responsible user or employee.
- **AC-US-N02-02:** The table returns to Available unless another restriction applies.
- **AC-US-N02-03:** Relevant employees can see that the table is ready.

### US-N03 — Skip formal cleaning tasks

**As a small restaurant manager, I want to disable cleaning-task workflows so that table status can be handled directly by general staff.**

#### Acceptance criteria

- **AC-US-N03-01:** Disabling cleaning tasks removes assignments and cleaning notifications.
- **AC-US-N03-02:** Authorized staff can still change table availability directly.
- **AC-US-N03-03:** Historical cleaning records remain available when the feature is re-enabled.

---

## Epic O — Notifications

### US-O01 — Receive operational notifications

**As an employee, I want relevant real-time notifications so that I can respond to changes requiring my attention.**

#### Acceptance criteria

- **AC-US-O01-01:** MVP notification types are new order, order correction/cancellation, ready order, bill request, payment/refund, and configuration or permission change.
- **AC-US-O01-02:** Notifications respect module configuration, branch scope, permissions, and assignment.
- **AC-US-O01-03:** Users can mark notifications as read or acknowledged.

### US-O02 — Configure notification recipients

**As an administrator, I want to configure who receives operational notifications so that alerts reach the appropriate employees.**

#### Acceptance criteria

- **AC-US-O02-01:** MVP recipients are resolved by branch scope and the permission associated with the notification type.
- **AC-US-O02-02:** The system provides sensible defaults.
- **AC-US-O02-03:** Critical workflows warn the administrator when no eligible recipient exists.

### US-O03 — Avoid duplicate or excessive alerts

**As an employee, I want notifications to be grouped and controlled so that important events are not hidden by noise.**

#### Acceptance criteria

- **AC-US-O03-01:** Duplicate events do not create uncontrolled repeated alerts.
- **AC-US-O03-02:** Acknowledged tasks remain distinguishable from unhandled tasks.
- **AC-US-O03-03:** Notification inbox history is retained for 30 days; audit and source business records follow their own retention rules.

---

## Epic P — Dashboards and Reporting

### US-P01 — View a branch dashboard

**As an authorized manager, I want to view current branch activity so that I can monitor operations.**

#### Acceptance criteria

- **AC-US-P01-01:** The dashboard can show active orders, order states, occupied tables, delayed items, pending requests, and daily sales.
- **AC-US-P01-02:** Only enabled modules contribute module-specific widgets.
- **AC-US-P01-03:** Data is restricted to authorized branches.

### US-P02 — View sales reports

**As an authorized manager, I want to view sales information so that I can understand restaurant performance.**

#### Acceptance criteria

- **AC-US-P02-01:** Reports can be filtered by restaurant, branch, date range, payment method, and order state.
- **AC-US-P02-02:** Cancelled and refunded amounts are distinguishable.
- **AC-US-P02-03:** Totals can be traced back to underlying orders.

### US-P03 — View menu performance

**As an authorized manager, I want to see dish performance so that I can make menu decisions.**

#### Acceptance criteria

- **AC-US-P03-01:** Reports can show item quantity, gross sales, cancellations, and average preparation time where data exists.
- **AC-US-P03-02:** Historical dish names and prices come from order snapshots.

### US-P04 — Export authorized data

**As an authorized manager, I want to export report data so that I can perform further analysis or record keeping.**

#### Acceptance criteria

- **AC-US-P04-01:** Export permission is separate from view permission when appropriate.
- **AC-US-P04-02:** Exports respect active filters and branch scope.
- **AC-US-P04-03:** Sensitive exports are audited.

---

## Epic Q — Audit and Administration

### US-Q01 — View audit history

**As an authorized administrator, I want to view sensitive system changes so that operational and security actions are traceable.**

#### Acceptance criteria

- **AC-US-Q01-01:** Audited actions include permission changes, feature changes, workflow changes, payment changes, refunds, order overrides, inventory corrections, and relevant deletions.
- **AC-US-Q01-02:** Records include actor, action, target, timestamp, branch, and available before/after values.
- **AC-US-Q01-03:** Audit records cannot be edited through normal restaurant interfaces.

### US-Q02 — Deactivate records safely

**As an administrator, I want to deactivate records instead of deleting important history so that completed operations remain understandable.**

#### Acceptance criteria

- **AC-US-Q02-01:** Employees, dishes, tables, templates, and branches with historical references can be deactivated.
- **AC-US-Q02-02:** Historical orders continue to display meaningful snapshot information.
- **AC-US-Q02-03:** Referenced operational and financial records cannot be hard-deleted; privacy deletion and anonymization follow `docs/data/model.md`.

---

## Epic R — Identity and Account Lifecycle

### US-R01 — Bootstrap an owner and invite staff

**As a business owner, I want to establish the first protected owner account and invite staff so that access begins from a controlled identity.**

#### Acceptance criteria

- **AC-US-R01-01:** Tenant creation establishes one verified owner without exposing a public owner-creation endpoint afterward.
- **AC-US-R01-02:** An authorized administrator can invite a staff user to an existing employee profile.
- **AC-US-R01-03:** Invitations are single-use, expire, and are stored without retaining the raw token.
- **AC-US-R01-04:** Accepting an invitation does not grant permissions beyond those already approved for the employee.

### US-R02 — Authenticate and revoke sessions

**As a staff user, I want to log in, log out, and have compromised sessions revoked so that access remains controlled.**

#### Acceptance criteria

- **AC-US-R02-01:** Successful authentication creates a server-managed, revocable session.
- **AC-US-R02-02:** Logout invalidates the current session.
- **AC-US-R02-03:** Deactivation, critical permission revocation, or credential reset invalidates affected sessions before the administrative command succeeds.
- **AC-US-R02-04:** Authentication errors do not reveal whether an account exists.

### US-R03 — Recover credentials

**As a staff user, I want a secure credential-recovery flow so that I can regain access without administrator knowledge of my credential.**

#### Acceptance criteria

- **AC-US-R03-01:** Recovery tokens are single-use, expire, and are stored only as hashes.
- **AC-US-R03-02:** Completing recovery invalidates existing sessions.
- **AC-US-R03-03:** Recovery requests are rate-limited and do not disclose account existence.
- **AC-US-R03-04:** Recovery activity is audited without logging secrets.

### US-R04 — Protect the last administrator

**As a business owner, I want the system to prevent removal of the final effective administrator so that the tenant cannot be locked out accidentally.**

#### Acceptance criteria

- **AC-US-R04-01:** The final active administrator cannot be deactivated or stripped of required administration access.
- **AC-US-R04-02:** A replacement administrator must become active before the final administrator is removed.
- **AC-US-R04-03:** Attempts and successful transfers are audited.

### US-R05 — Use audited platform support access

**As a platform operator, I want time-limited break-glass access so that authorized support can investigate a tenant incident without permanent access.**

#### Acceptance criteria

- **AC-US-R05-01:** Normal platform administrators have no implicit access to tenant operational data.
- **AC-US-R05-02:** Break-glass access requires a tenant, reason, scope, approver or approved emergency policy, and expiry.
- **AC-US-R05-03:** Every access and action is included in a tenant-visible or internally reviewable audit trail.
- **AC-US-R05-04:** Expiry or revocation terminates related sessions and real-time subscriptions.

---

# 9. Non-Functional Requirements

Non-functional requirements describe the quality, safety, performance, and operational characteristics of the product.

## NFR-01 — Usability and progressive disclosure

**As a restaurant employee, I want the interface to show only relevant features and actions so that I can complete work without unnecessary complexity.**

Requirements:

- **AC-NFR-01-01:** Disabled and unauthorized features must not appear in normal navigation.
- **AC-NFR-01-02:** Common actions must be reachable without navigating through unrelated configuration.
- **AC-NFR-01-03:** Advanced settings must be grouped separately from day-to-day operations.
- **AC-NFR-01-04:** The setup end-to-end test must complete the default restaurant configuration without technical intervention.
- **AC-NFR-01-05:** Destructive or financially sensitive actions must require clear confirmation.

## NFR-02 — Responsive operation

**As a customer or employee, I want the system to work on the device available to me so that dedicated hardware is not required.**

Requirements:

- **AC-NFR-02-01:** Customer ordering must support modern mobile browsers.
- **AC-NFR-02-02:** Staff interfaces must support tablets, laptops, and common desktop sizes.
- **AC-NFR-02-03:** The selected kitchen-display layout must keep item name, quantity, note, elapsed time, state, and order reference readable at a one-metre viewing distance.
- **AC-NFR-02-04:** Interactive touch targets must be at least 44 by 44 CSS pixels except where an equivalent accessible control is provided.

## NFR-03 — Accessibility

**As a user with accessibility needs, I want to operate the system using accessible interaction methods so that I am not excluded.**

Requirements:

- **AC-NFR-03-01:** MVP interfaces must meet WCAG 2.2 AA for the critical flows defined in `docs/quality/frontend-quality.md`.
- **AC-NFR-03-02:** Keyboard navigation must be supported for staff web interfaces.
- **AC-NFR-03-03:** Status must not be communicated through color alone.
- **AC-NFR-03-04:** Form controls must have programmatically associated labels.
- **AC-NFR-03-05:** Focus states and validation errors must be clear.
- **AC-NFR-03-06:** Customer and staff critical flows must remain usable at 200% browser zoom.

## NFR-04 — Performance

**As a user, I want routine operations to respond quickly so that the system does not slow restaurant service.**

Initial targets under the PD-025 load profile:

- **AC-NFR-04-01:** Customer menu pages must become usable at p95 within 3 seconds on the agreed mobile test profile.
- **AC-NFR-04-02:** Routine authenticated server-side reads must complete at p95 within 500 milliseconds.
- **AC-NFR-04-03:** Order and payment commands must complete at p95 within 1 second, excluding client network time.
- **AC-NFR-04-04:** Real-time operational updates must reach connected clients at p95 within 2 seconds after transaction commit.
- **AC-NFR-04-05:** Long-running report exports must run asynchronously and expose queued, running, completed, failed, and expired status.

Tests must report p50, p95, and p99. A changed target requires an approved product decision and updated capacity profile.

## NFR-05 — Availability

**As a restaurant operator, I want the system to remain available during service hours so that operations are not interrupted.**

Requirements:

- **AC-NFR-05-01:** The production API must target at least 99.9% monthly availability, excluding pre-announced maintenance.
- **AC-NFR-05-02:** Planned maintenance must be communicated at least seven days in advance; emergency maintenance is documented afterward.
- **AC-NFR-05-03:** Failure of a non-critical module must not unnecessarily block unrelated operations.
- **AC-NFR-05-04:** The system must provide a defined degraded behavior when real-time updates are temporarily unavailable.

## NFR-06 — Reliability and data consistency

**As a restaurant operator, I want orders and payments to remain consistent so that customers are not charged incorrectly and work is not duplicated.**

Requirements:

- **AC-NFR-06-01:** Repeated order-submission requests must not create duplicate orders.
- **AC-NFR-06-02:** Repeated payment-recording requests must be handled idempotently where possible.
- **AC-NFR-06-03:** Order-state transitions must be validated on the server.
- **AC-NFR-06-04:** Concurrent table assignments and inventory changes must be handled safely.
- **AC-NFR-06-05:** Financial totals must use fixed-precision decimal calculations rather than floating-point arithmetic.
- **AC-NFR-06-06:** Timestamps must be stored consistently and displayed in the branch time zone.

## NFR-07 — Security and authorization

**As a business owner, I want restaurant data and actions protected so that unauthorized users cannot access or change them.**

Requirements:

- **AC-NFR-07-01:** Authorization must be enforced on the server for every protected action.
- **AC-NFR-07-02:** Hiding a user-interface element is not considered authorization.
- **AC-NFR-07-03:** Restaurant and branch scope must be applied to every relevant query and mutation.
- **AC-NFR-07-04:** Passwords must be stored using an accepted adaptive password-hashing algorithm.
- **AC-NFR-07-05:** Authentication sessions must be revocable.
- **AC-NFR-07-06:** Permission delegation, refund, unpaid completion, and support break-glass require explicit confirmation; critical permission and support actions require authentication within the previous 15 minutes.
- **AC-NFR-07-07:** Login and permission-management endpoints must be rate-limited.
- **AC-NFR-07-08:** Common web risks, including injection, cross-site scripting, cross-site request forgery, and insecure direct object references, must be addressed.
- **AC-NFR-07-09:** Secrets must not be committed to source control or exposed to browser clients.

## NFR-08 — Multi-tenant isolation

**As a restaurant business, I want my information isolated from other businesses so that competitors or unrelated customers cannot access it.**

Requirements:

- **AC-NFR-08-01:** Every tenant-owned record must be associated with the correct business account.
- **AC-NFR-08-02:** Tenant scope must be enforced in application services and database access patterns.
- **AC-NFR-08-03:** Automated tests must verify that identifiers from one tenant cannot be used to access another tenant’s data.
- **AC-NFR-08-04:** Cache keys, file paths, exports, notifications, and background jobs must preserve tenant isolation.

## NFR-09 — Privacy

**As a customer or employee, I want personal information handled responsibly so that unnecessary data is not collected or exposed.**

Requirements:

- **AC-NFR-09-01:** Customer ordering must not require a permanent account.
- **AC-NFR-09-02:** Guest ordering collects only an optional display name, session security data, order contents, and operational metadata defined in the data model.
- **AC-NFR-09-03:** Personal data must not appear in logs unless operationally necessary and protected.
- **AC-NFR-09-04:** Access to employee and customer information must follow permissions.
- **AC-NFR-09-05:** Retention and deletion rules must follow `docs/data/model.md` and an approved deployment-market policy before production.
- **AC-NFR-09-06:** Platform support access to tenant data must be restricted and auditable.

## NFR-10 — Auditability

**As an administrator, I want sensitive changes to be traceable so that disputes and mistakes can be investigated.**

Requirements:

- **AC-NFR-10-01:** Audit records must be append-only from the perspective of normal restaurant users.
- **AC-NFR-10-02:** Audit timestamps and actors must be reliable.
- **AC-NFR-10-03:** Permission changes, financial overrides, and destructive actions must be audited.
- **AC-NFR-10-04:** Audit retention must be defined before production release.

## NFR-11 — Scalability

**As a growing restaurant business, I want the product to support additional branches, employees, and orders so that growth does not require replacing the system.**

Requirements:

- **AC-NFR-11-01:** The architecture must not assume one restaurant or one branch per account.
- **AC-NFR-11-02:** Operational queries must be paginated where datasets can grow.
- **AC-NFR-11-03:** Real-time subscriptions and notifications must be scoped to relevant branches and users.
- **AC-NFR-11-04:** Reporting uses projections and asynchronous exports so report generation does not hold transactional locks on active order processing.
- **AC-NFR-11-05:** The system must pass the PD-025 capacity profile before production launch.

## NFR-12 — Maintainability and extensibility

**As the product team, we want modules and workflows to be maintainable so that new restaurant capabilities can be added safely.**

Requirements:

- **AC-NFR-12-01:** Feature configuration, permission checks, and workflow validation must use the approved catalogues and shared enforcement mechanisms.
- **AC-NFR-12-02:** Permission identifiers must be stable and documented.
- **AC-NFR-12-03:** Order-state rules must not be duplicated inconsistently across clients.
- **AC-NFR-12-04:** Module ownership and allowed interfaces must conform to `docs/architecture/modules.yaml` and architecture tests.
- **AC-NFR-12-05:** Database migrations must be versioned, backward-compatible during rollout, and use the forward-fix policy in the deployment document when reversal is unsafe.
- **AC-NFR-12-06:** Automated tests must cover critical order, payment, permission, and tenant-isolation behavior.

## NFR-13 — Observability and supportability

**As the product operator, I want failures to be diagnosable so that service can be restored quickly.**

Requirements:

- **AC-NFR-13-01:** Server errors must use structured logging with correlation identifiers.
- **AC-NFR-13-02:** Logs must distinguish restaurant, branch, request, and order context without unnecessarily exposing personal data.
- **AC-NFR-13-03:** Metrics must cover the indicators listed in `docs/operations/observability-and-runbook.md`.
- **AC-NFR-13-04:** Critical and high conditions in the operational runbook must produce routed alerts.
- **AC-NFR-13-05:** Customer-facing errors must provide useful recovery guidance without exposing internal details.

## NFR-14 — Backup and recovery

**As a business owner, I want restaurant data to be recoverable after a failure so that operational history is not permanently lost.**

Requirements:

- **AC-NFR-14-01:** Production data must be backed up automatically.
- **AC-NFR-14-02:** Backup restoration must be tested periodically.
- **AC-NFR-14-03:** Recovery point and recovery time objectives must be verified before production launch.
- **AC-NFR-14-04:** Backups must preserve tenant security and encryption controls.

- **AC-NFR-14-05:** Recovery point objective: no more than 15 minutes of data loss.
- **AC-NFR-14-06:** Recovery time objective: service restored within 4 hours after a major recoverable failure.

## NFR-15 — Localization

**As a restaurant operator, I want the system to support local language and formatting needs so that it can be used in different markets.**

Requirements:

- **AC-NFR-15-01:** User-facing text must be designed for translation.
- **AC-NFR-15-02:** Currency, date, time, number, and tax formatting must be configurable.
- **AC-NFR-15-03:** The MVP language is English. User-facing strings must be externalized; RTL is not a release claim until separately implemented and tested.
- **AC-NFR-15-04:** Stored data must use Unicode.

## NFR-16 — Network resilience

**As a restaurant employee, I want clear behavior during temporary connectivity problems so that I do not unknowingly duplicate actions.**

Requirements:

- **AC-NFR-16-01:** The interface must clearly distinguish pending, successful, and failed actions.
- **AC-NFR-16-02:** Retrying a submission must not create duplicate orders or payments.
- **AC-NFR-16-03:** Users must be told when displayed operational data may be stale.
- **AC-NFR-16-04:** Full offline operation is not required for the initial release unless separately prioritized.

## NFR-17 — Compatibility

**As a user, I want the application to work in supported modern browsers so that I can use existing hardware.**

Requirements:

- **AC-NFR-17-01:** A supported-browser policy must be published.
- **AC-NFR-17-02:** At release, critical flows must support the latest two stable major versions of Chrome, Edge, and Firefox, plus the current stable Safari major version.
- **AC-NFR-17-03:** QR destinations must use standard HTTPS URLs and must not require a proprietary scanning application.

## NFR-18 — Data integrity and historical accuracy

**As a manager, I want historical orders and reports to remain accurate after configuration changes so that business records are trustworthy.**

Requirements:

- **AC-NFR-18-01:** Submitted orders must preserve item and price snapshots.
- **AC-NFR-18-02:** Deactivated employees and dishes must remain identifiable in history.
- **AC-NFR-18-03:** Feature changes must not rewrite historical workflows.
- **AC-NFR-18-04:** Report calculations must use recorded transactions and documented business rules.

---

## 10. Business Rules

The authoritative, individually identified business rules are in `docs/domain/business-rules.md`. State transitions are in `docs/domain/workflows.yaml`. This document describes required outcomes and does not duplicate those catalogues.

---

## 11. Permission Catalogue

Exact permission identifiers, scope, delegation rules, risk, audit behavior, and default templates are authoritative in `docs/security/permissions.yaml`.

---

## 12. Feature and Configuration Catalogue

The authoritative distinction between core modules, optional modules, capabilities, strategies, and integrations is in `docs/config/features.yaml`. It defines scope, defaults, dependencies, supported MVP values, and in-flight disable behavior.

---

## 13. Release Scope

`docs/product/mvp-scope.yaml` is the story-level release source of truth. `docs/delivery/mvp-slices.yaml` defines the dependency-ordered implementation slices and exit criteria. Future capabilities remain documented in this requirements file but are marked `post_mvp`.

---

## 14. Domain and Data Model

The domain glossary, aggregates, cardinalities, and value objects are authoritative in `docs/domain/model.md`. The conceptual database model, constraints, indexes, retention, and tenancy rules are in `docs/data/model.md`.

---

## 15. Product Decisions

The original discovery questions have been resolved for the MVP in `docs/product/decision-register.md`. A future change requires a new or superseding `PD-*` entry and updates to affected requirements, workflows, contracts, and tests.

---

## 16. Success Criteria

The MVP is release-ready when:

- All stories marked `mvp` and `ready` satisfy their acceptance and traceability entries.
- A small restaurant can configure itself and process orders using the approved default feature profile.
- A larger restaurant can distribute responsibilities using individual permissions and branch scopes.
- Customers can scan, order, customize dishes, and follow progress without creating an account.
- Staff can move an order from submission through preparation, serving, payment, and completion.
- Disabled features do not appear or accept new work, and configuration changes do not strand active workflows.
- Permission and tenant boundaries prevent unauthorized access.
- Order and payment history remains accurate after menu, employee, permission, and configuration changes.
- NFR verification and release gates in `docs/quality/test-strategy.md` pass.

---

## 17. Delivery Plan

Implementation order and exit criteria are authoritative in `docs/delivery/mvp-slices.yaml`. `ADR-0001` accepts Express and strict TypeScript; Slice 001 pins exact versions and creates the executable workspace.
