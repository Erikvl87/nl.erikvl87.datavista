---
sidebar_position: 5
title: Toggle Switch
---

import FlowCard from '@site/src/components/FlowCard';

# Toggle Switch

The **Toggle Switch** widget provides a minimal display for boolean states such as on/off, open/closed, or active/inactive. Supply the value from device capabilities, Homey variables, or DataVista action cards.

![Toggle switch animation](/img/docs/toggle-switch-widget-animation.gif)

## Add the widget to your dashboard

1. Open the Homey app and go to **Dashboards**.
2. Enter **Edit Mode** and select **Add Widget**.
3. Choose **Apps** and select **DataVista**.
4. Pick the **Toggle switch** widget.
5. Click the preview to add it to your dashboard.

![Toggle switch widget preview](/img/docs/toggle-switch-widget-preview.png)

## Configure the widget

| Setting | Description |
| --- | --- |
| **Datasource** | Select a DataVista boolean value*, device capability, or Homey variable. |
| **Refresh interval** | Polling frequency when using device capabilities or variables. |
| **Overwrite name** | Replace the datasource name with custom text. |
| **Color if true** | Color when the value is `true`. |
| **Color if false** | Color when the value is `false`. |
| **FA icon code if true** | Font Awesome 6 (free, solid) Unicode for the `true` state icon. |
| **FA icon code if false** | Font Awesome 6 (free, solid) Unicode for the `false` state icon. |
| **Show icon** | Display the capability or device icon (capability takes priority). |

:::warning
To use a **DataVista boolean value**, run the DataVista action card that sets the value at least once so it appears in the widget settings.

<FlowCard source="actions/set-boolean.json" />
:::

## FAQ

### Why does the switch animate between on and off?

The datasource is missing or unavailable. Reconfigure the datasource setting and select a valid source.

### Why is my toggle icon a square box?

Ensure you entered a valid Unicode value for a free Font Awesome v6 solid icon.
