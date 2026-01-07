---
title: Visualizing Hourly Energy Prices
---

import FlowCard from '@site/src/components/FlowCard';

# Tutorial: Visualizing Hourly Energy Prices with a Gauge

The [Gauge](./index.md) widget can display hourly energy prices. This guide walks through configuring a gauge that updates with real-time price data.

![Gauge showing hourly prices](/img/docs/gauge-hourly-price-example.jpg)

:::info
You need a Homey capability or variable that provides the lowest price of the day, the highest price of the day, and the price for the current hour. The **Power by the Hour** app is one option.
:::

Each flow card in the sequence should connect to the previous card to ensure the actions run in order.

## 1. Create a periodic trigger

Create a Homey flow triggered every hour (or when a new price hour starts).

## 2. (Optional) Format the price token

Optionally run an action card (for example from [Better Logic Library](https://homey.app/a/net.i-dev.betterlogic/)) to format the price token, such as rounding to two decimals.

## 3. Set the range and current price

Use the DataVista range action card to define the datasource.

<FlowCard source="actions/set-range.json" />

1. Choose an identifier, such as **Hourly energy price**.
2. Set the minimum and maximum values using the lowest and highest prices, or fixed values like `0` and `2`.
3. Assign the current price token to **Value**.
4. Set the unit to your currency (for example `€`) and choose whether it appears before or after the value.
5. Keep the default label unless you plan to show a custom text value.

:::info
Overwrite the label when you want to show qualitative values (for example *Low*, *Moderate*, *High*). Add logic before this card to map the numeric price to a text token, then select that token in **Overwrite label**.
:::

## 4. Configure the visualization

Use the DataVista gauge configuration action card to define the color bands.

<FlowCard source="actions/set-gauge-configuration.json" />

1. Create an identifier such as **Visualization for hourly energy price**.
2. Add axes colors for your thresholds, for example green at `0`, yellow at `0.10`, orange at `0.30`, and red at `1`.
3. Leave any unused offsets blank—they will be ignored.

:::info
You can populate the color offsets dynamically with tokens. This lets you adapt thresholds (for example, higher red thresholds during winter).
:::

## 5. Add the widget to the dashboard

Follow the [Gauge widget setup](./index.md#add-the-widget-to-your-dashboard) to add an **Advanced Gauge**. Select the datasource from step 3 as the value source and the configuration from step 4 as the visualization.
