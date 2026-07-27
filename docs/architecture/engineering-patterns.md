---
id: ENGINEERING-PATTERNS
status: proposed
version: 1.0
owner: architecture
last_reviewed: 2026-07-27
source_of_truth_for:
  - non-normative-pattern-guidance
---

# Engineering Pattern Guide

This guide is explanatory and non-normative. Use a pattern only when it solves an observed problem. Mandatory architecture rules remain in `restaurant-management-system-architecture.md`, `docs/architecture/modules.yaml`, `docs/architecture/consistency.md`, and accepted ADRs.
This section is explanatory, not a requirement to instantiate every pattern. Normative constraints live in the module catalogue, consistency model, contracts, and accepted ADRs. Patterns should solve observed problems and should not be added merely to make the architecture appear sophisticated.

## 13.1 Modular Monolith pattern

### Use for

Separating business capabilities while retaining one deployable application.

### Apply to

- Identity and Access.
- Restaurant Configuration.
- Menu.
- Ordering.
- Kitchen.
- Payments.
- Inventory.
- Operations.
- Notifications.
- Reporting.

### Important rule

A module owns its behavior and data changes. Other modules do not reach into its internals.

---

## 13.2 Dependency Inversion

### Use for

Keeping business logic independent from databases, providers, and frameworks.

Example:

```text
Application defines: IPaymentGateway
Infrastructure implements: SelectedProviderPaymentGateway
```

This is a post-MVP example. If online payments are selected later, the Payments application layer depends on `IPaymentGateway`, not on a particular provider SDK.

Other candidates:

- Notification sender.
- File storage.
- QR-code generator.
- Current time provider.
- Current user/authorization context.
- Export storage.

---

## 13.3 Aggregate pattern

### Use for

Protecting consistency boundaries and business invariants.

Likely aggregates:

- `Order`
- `TableSession`
- `RestockRequest`
- `PermissionTemplate`
- Possibly `RestaurantConfiguration`

Example responsibilities of the `Order` aggregate:

- Validate legal state transitions.
- Preserve item snapshots.
- Prevent invalid item changes.
- Calculate or verify totals.
- Record cancellation reasons.
- Produce domain events.

Avoid creating one enormous `Restaurant` aggregate containing branches, employees, menus, orders, and stock. Such an aggregate would be difficult to load and update concurrently.

---

## 13.4 Value Object pattern

### Use for

Representing small concepts that require validation and should be compared by value.

Candidates:

- `Money`
- `Quantity`
- `EmailAddress`
- `BranchId`
- `OrderNumber`
- `DateRange`
- `PermissionKey`
- `CustomerNote`

Example:

```text
Money
├── Amount
└── Currency
```

A `Money` value object prevents accidental addition of amounts using different currencies and centralizes rounding behavior.

---

## 13.5 Explicit State Machine

### Use for

Processes with valid states and controlled transitions.

Apply to:

- Order approval, fulfilment, financial state, and closure as separate machines.
- Order-item preparation.
- Table sessions.
- Restocking requests.
- Cleaning tasks.

MVP state dimensions:

```text
Approval:    Submitted → Accepted
Fulfilment:  NotStarted → Preparing → Ready → Served
Financial:   Unpaid → Paid → PartiallyRefunded/Refunded
Closure:     Active → Completed or Cancelled
```

`Rejected` belongs to approval; `Refunded` belongs to financial state; neither is a generic order status. The canonical guards, permissions, side effects, and events are defined in `docs/domain/workflows.yaml`.

The state machine should:

- Define allowed transitions centrally.
- Check required permissions.
- Check enabled workflow steps.
- Record transition time and actor.
- Produce appropriate domain events.
- Store the configuration version for active records.

Do not allow clients to assign arbitrary status values.

---

## 13.6 Strategy pattern

### Use for

Selecting one of several supported business algorithms based on restaurant configuration.

Good candidates:

### Order acceptance strategy

```text
AutomaticAcceptance
ManualAcceptance (post-MVP)
```

### Table assignment strategy

```text
TableFromQrCode
CustomerSelectsTable (post-MVP)
EmployeeAssignsTable (staff order entry only in MVP)
```

### Readiness strategy

```text
AllItemsReady
PartialServingAllowed (post-MVP)
```

### Inventory deduction strategy

```text
NoAutomaticDeduction
DeductOnAcceptance (post-MVP)
DeductOnPreparation (post-MVP)
```

### Delivery strategy

```text
DirectDelivery
WaiterAssignment (post-MVP)
CounterCollection
```

Strategies should be selected from supported alternatives. Administrators should not be allowed to upload code or construct arbitrary algorithms.

---

## 13.7 Policy pattern

### Use for

Encapsulating business or authorization decisions that involve several conditions.

Examples:

- `CanAcceptOrderPolicy`
- `CanModifyOrderPolicy`
- `CanCompleteOrderPolicy`
- `CanAssignTablePolicy`
- `CanOverrideAvailabilityPolicy`
- `CanGrantPermissionPolicy`

Example:

```text
CanCompleteOrder =
    Orders module enabled
    AND user has orders.complete
    AND user can access the branch
    AND order is served
    AND balance is zero
```

Policies keep these decisions out of controllers and prevent inconsistent checks across use cases.

---

## 13.8 Command–Query Separation

### Use for

Separating operations that change state from operations that return information.

Commands:

```text
SubmitOrder
AcceptOrder
AssignKitchenItem
RecordPayment
CompleteOrder
GrantPermission
```

Queries:

```text
GetCustomerMenu
GetKitchenQueue
GetActiveOrders
GetAvailableTables
GetBranchDashboard
```

This does not initially require:

- Separate databases.
- Event sourcing.
- A message broker for every command.
- A complex CQRS framework.

It is a code and responsibility separation that allows read models to evolve independently from write behavior.

---

## 13.9 Repository pattern

### Use for

Loading and saving aggregates while keeping persistence details out of domain logic.

Prefer aggregate-specific repositories:

```text
IOrderRepository
ITableSessionRepository
IRestockRequestRepository
```

Avoid exposing a generic repository such as:

```text
IRepository<TEntity>
```

as the primary domain abstraction. A generic repository often exposes database-shaped operations and makes it easy to bypass aggregate rules.

Read-heavy queries may use dedicated query services or direct read models rather than forcing every query through an aggregate repository.

---

## 13.10 Unit of Work and Transaction Boundary

### Use for

Ensuring changes belonging to one use case succeed or fail together.

Most modern object-relational mappers already implement unit-of-work behavior. A custom abstraction should only be introduced when it provides meaningful application value.

Example transaction:

```text
AcceptOrder
├── Update order state
├── Create kitchen work
├── Apply configured stock effect
└── Add outbox messages
```

If any required part fails, the transaction should roll back.

Do not use one transaction for slow external calls such as sending email or contacting a remote payment provider.

---

## 13.11 Domain Event pattern

### Use for

Representing a meaningful fact that occurred inside a domain.

Examples:

- `OrderAccepted`
- `OrderReady`
- `PaymentRecorded`
- `StockThresholdReached`

Domain events allow the originating aggregate to express what happened without knowing every reaction.

Events should use past-tense names and should represent completed facts rather than instructions.

---

## 13.12 Observer/Publisher–Subscriber pattern

### Use for

Allowing multiple handlers to react to domain or integration events.

Example:

```text
OrderReady
├── Notification handler
├── Reporting projection handler
└── Timing metrics handler
```

Inside the monolith, an in-process dispatcher may be sufficient. Reliable asynchronous work should use the transactional outbox.

---

## 13.13 Adapter pattern

### Use for

Integrating external technologies without leaking provider-specific details into the application.

Candidate adapters:

- Online payment gateway.
- Email provider.
- SMS provider.
- Push-notification provider.
- File or image storage.
- Receipt printer.
- Accounting export.

Example:

```text
Application contract: INotificationChannel

Infrastructure adapters:
├── InAppNotificationChannel
├── EmailNotificationChannel
└── SmsNotificationChannel
```

---

## 13.14 Factory pattern

### Use for

Creating aggregates or objects that require several invariants, snapshots, or configuration-dependent values.

Candidates:

- Creating an order from a customer cart and current menu.
- Creating a table session from a QR code.
- Creating kitchen work from accepted order items.
- Creating a payment attempt for an external provider.

A factory is unnecessary for simple entity construction. Use it when creation itself contains meaningful rules.

---

## 13.15 Decorator/Pipeline Behavior pattern

### Use for

Applying consistent behavior around application commands and queries.

Useful pipeline behaviors:

- Input validation.
- Authentication.
- Branch and tenant authorization.
- Transaction management.
- Idempotency.
- Audit collection.
- Logging and tracing.
- Performance measurement.

Example:

```text
Request
→ Correlation
→ Authentication
→ Authorization
→ Validation
→ Idempotency
→ Transaction
→ Handler
→ Audit/Outbox
→ Response
```

Ordering matters. For example, authorization should occur before sensitive data is loaded or returned.

---

## 13.16 Specification pattern

### Use selectively for

Reusable domain predicates or complex query criteria.

Potential examples:

- Dishes available for a branch.
- Orders visible to an employee.
- Restocking requests awaiting approval.
- Tables eligible for assignment.

Avoid building a large generic specification framework before repeated criteria actually appear. Simple named query methods are often clearer.

---

## 13.17 Result pattern

### Use for

Returning expected business failures without using exceptions as normal control flow.

Examples:

```text
OrderAlreadyCompleted
DishUnavailable
TableAlreadyOccupied
InsufficientPermission
InvalidStateTransition
PaymentExceedsOutstandingBalance
```

Unexpected infrastructure or programming failures may still use exceptions and centralized error handling.

The API translates results into the `application/problem+json` contract defined in `docs/contracts/openapi.yaml`.

---

## 13.18 Idempotency pattern

### Use for

Preventing repeated requests from duplicating important actions.

Apply to:

- Customer order submission.
- Payment recording and gateway callbacks.
- Refund requests.
- Outbox event handlers.
- External integration webhooks.

An idempotency key should be scoped to the tenant and operation. Reusing a key with a different request payload must be rejected.

---

## 13.19 Optimistic Concurrency pattern

### Use for

Detecting concurrent changes without locking records for long periods.

Apply to:

- Active orders.
- Table sessions.
- Inventory balances.
- Restaurant workflow settings.

The client or application supplies an expected version. If another process has already updated the record, the operation fails with a conflict and current state can be reloaded.

---

## 13.20 Feature Toggle pattern

### Use for

Controlling whether a restaurant module or capability is operational.

There are two distinct types:

### Product/restaurant module configuration

Examples:

- Inventory enabled for Restaurant A.
- Cleaning tasks disabled for Restaurant B.

These are durable business settings and may affect permissions, UI, and workflow rules.

### Deployment feature flags

Examples:

- Gradually releasing a new kitchen screen.
- Enabling a new implementation for internal testing.

These are operational delivery controls and should not be mixed with restaurant business configuration.

Disabling either type must have explicitly defined behavior.

---

## 13.21 Projection pattern

### Use for

Creating read-optimized views for dashboards and operational screens.

Potential projections:

- Active branch order board.
- Kitchen queue.
- Table occupancy board.
- Daily branch sales.
- Low-stock dashboard.

The operational source of truth remains in the owning module. Projections can be rebuilt or corrected from source data when designed accordingly.

---
