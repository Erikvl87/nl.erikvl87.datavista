---
sidebar_position: 2
title: Visualizing Temperature
---

import FlowCard from '@site/src/components/FlowCard';

# Tutorial: Visualizing Temperature with a Progress Bar

The [Progress Bar](./index.md) widget can display temperatures when you provide a numeric range through flows.

![Progress bar showing temperature](/img/docs/progress-bar-temperature-example.jpg)

A progress bar renders values within a defined range—for example, 50% when the current value sits halfway between the minimum and maximum.

## 1. Decide the temperature range

Choose appropriate minimum and maximum values. For example, `-15 °C` as the minimum and `50 °C` as the maximum.

## 2. Trigger on temperature changes

Create a flow that fires when your temperature sensor reports a new value. If the device lacks a temperature-change trigger, use a periodic trigger (for example every 3 minutes) to keep the progress bar updated.

## 3. Set the range and current temperature

Add the DataVista range action card and link it to the trigger from step 2.

<FlowCard source="actions/set-range.json" />

1. Choose an identifier such as **Living room temperature**.
2. Enter the minimum and maximum values selected in step 1.
3. Assign the current temperature token to **Value**.
4. Set the unit to `°C` and place it after the value.
5. Leave **Overwrite label** blank unless you want to show a custom text (for example *Cold*, *Warm*, *Hot*).

## 4. Save and run the flow

Save and enable the flow, then ensure it runs at least once so the DataVista range becomes available in widget settings.

## 5. Add the widget to the dashboard

Follow the [Progress Bar setup](./index.md#add-the-widget-to-your-dashboard) and select the datasource created in step 3.
