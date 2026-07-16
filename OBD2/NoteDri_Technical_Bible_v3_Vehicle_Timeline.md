# NoteDri Technical Bible v3

# Vehicle Timeline & Vehicle Health

## 1. Core Idea

The goal is NOT to display ECU values.

The goal is to understand how a vehicle changes over time.

Every OBD connection adds a new chapter to the vehicle's health history.

------------------------------------------------------------------------

## 2. Vehicle Timeline

Every session creates a Timeline Event.

Example:

-   Connect
-   Engine Start
-   Warm-up
-   Driving
-   Idle
-   Engine Stop
-   Disconnect

Each event contains:

-   Timestamp
-   VIN
-   Odometer (if available)
-   Engine Hours (if available)
-   Sensor Snapshot
-   DTC Snapshot
-   Health Snapshot

------------------------------------------------------------------------

## 3. Sensor Snapshot

Each snapshot stores normalized values.

Example:

{ "rpm": 820, "speed": 0, "coolant": 92, "engineLoad": 34,
"batteryVoltage": 13.9, "throttle": 15 }

Never store raw PID responses.

------------------------------------------------------------------------

## 4. Vehicle Memory

The vehicle should remember:

-   First connection
-   Last connection
-   Total sessions
-   Total engine hours
-   Maintenance history
-   DTC history
-   Health history
-   Repair history

Knowledge Engine uses this memory instead of a single reading.

------------------------------------------------------------------------

## 5. Vehicle Health

Health is calculated by systems, not one score.

Example:

Engine ............ 94/100 Cooling ........... 88/100 Electrical
........ 81/100 Fuel System ....... 91/100 Transmission ...... 96/100

Overall Health .... 90/100

Health must be explainable.

------------------------------------------------------------------------

## 6. Trend Analysis

Detect trends instead of thresholds.

Examples:

-   Coolant slowly increasing over weeks.
-   Battery voltage decreasing every month.
-   Fuel trim becoming higher after maintenance.
-   Idle RPM becoming unstable.

Trend detection is more valuable than a single sensor value.

------------------------------------------------------------------------

## 7. Predictive Maintenance

Knowledge Engine should predict maintenance using:

-   Vehicle age
-   Mileage
-   Engine hours
-   Driving style
-   Timeline history
-   Previous repairs

Do not rely only on mileage.

------------------------------------------------------------------------

## 8. Daily User Value

Each daily connection should provide:

-   Updated Vehicle Health
-   Health changes since last scan
-   New recommendations
-   Upcoming maintenance
-   Newly detected abnormalities
-   Timeline summary

The user should feel the vehicle is being monitored continuously.

------------------------------------------------------------------------

## 9. Data Flow

OBD2 ↓ Vehicle Data Layer ↓ Timeline Recorder ↓ Knowledge Engine ↓
Trend Analysis ↓ Health Calculation ↓ Recommendations ↓ Mobile App

------------------------------------------------------------------------

## 10. Future Vision

After hundreds of connections, NoteDri should know the vehicle better
than the owner.

The application should answer:

-   Is my vehicle healthier than last month?
-   What changed?
-   What should I repair first?
-   Which maintenance can wait?
-   What problems are likely to happen next?

Vehicle Timeline is the foundation of every intelligent feature in
NoteDri.
