# NoteDri Technical Bible v7

# Vehicle Data → Knowledge Mapping

## Mission

Every piece of vehicle data collected by NoteDri must create value.

Raw sensor values should never be shown without context.

Vehicle Data ↓ Knowledge ↓ Insight ↓ Recommendation ↓ Action

------------------------------------------------------------------------

# Vehicle Data Flow

BLE ↓ ELM327 ↓ OBD2 Core ↓ Vehicle Data Layer ↓ Vehicle Timeline ↓
Knowledge Engine ↓ Rule Engine ↓ Recommendation Engine ↓ Vehicle Health
↓ Mobile App

------------------------------------------------------------------------

# Mapping Principles

Each input must answer:

1.  What does it mean?
2.  Is it normal?
3.  Is it changing?
4.  Should the user care?
5.  What action should be taken?

------------------------------------------------------------------------

# Data Mapping Examples

## RPM

Used for:

-   Engine idle analysis
-   Driving pattern
-   Engine hours
-   Vehicle timeline

Features:

-   Driving Score
-   Idle Detection
-   Engine Health

------------------------------------------------------------------------

## Speed

Used for:

-   Trip analysis
-   Average speed
-   Driving style

Features:

-   Trip History
-   Fuel Analysis
-   Driving Behaviour

------------------------------------------------------------------------

## Coolant Temperature

Used for:

-   Warm-up analysis
-   Cooling system health
-   Overheating detection
-   Trend analysis

Features:

-   Cooling Health
-   Overheat Warning
-   Predictive Maintenance

------------------------------------------------------------------------

## Engine Load

Used for:

-   Engine stress
-   Driving habits

Features:

-   Driving Score
-   Fuel Efficiency

------------------------------------------------------------------------

## Battery Voltage

Used for:

-   Battery aging
-   Charging system health

Features:

-   Battery Health
-   Battery Replacement Prediction

------------------------------------------------------------------------

## Fuel Trim

Used for:

-   Fuel system diagnosis
-   Air/Fuel mixture analysis

Features:

-   Fuel System Health
-   Smart Diagnosis

------------------------------------------------------------------------

## MAF / MAP

Used for:

-   Air intake analysis
-   Engine efficiency

Features:

-   Intake Health
-   MAF Cleaning Recommendation

------------------------------------------------------------------------

## DTC

Used for:

-   Diagnosis
-   Repair workflow
-   Timeline history

Features:

-   Smart Diagnosis
-   Repair Cost
-   Related Blogs
-   Repair Checklist
-   FAQ

------------------------------------------------------------------------

# Timeline Features

Every connection updates:

-   Health Score
-   Timeline
-   Trends
-   Recommendations
-   Maintenance Forecast

No data is wasted.

------------------------------------------------------------------------

# Vehicle Health Modules

Health Score is composed of:

-   Engine
-   Cooling
-   Fuel
-   Electrical
-   Ignition
-   Emissions
-   Transmission (future)

Each module has:

-   Current Score
-   Trend
-   Confidence
-   Recommendations

------------------------------------------------------------------------

# Recommendation Examples

Battery voltage decreasing ↓ Battery Health ↓ ↓ Recommend battery
inspection

Coolant temperature rising over months ↓ Cooling Health ↓ ↓ Recommend
coolant inspection

Repeated P0420 ↓ Catalyst diagnosis ↓ Show repair guide + cost

------------------------------------------------------------------------

# Future Intelligence

As timeline grows, enable:

-   Predictive Maintenance
-   Vehicle Aging
-   Personalized Health Score
-   Community Comparison
-   AI Insights

The objective is not to display sensor values.

The objective is to continuously improve the owner's understanding of
the vehicle and help prevent failures before they occur.
