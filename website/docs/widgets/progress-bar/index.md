---
sidebar_position: 1
title: Progress Bar
---

import FlowCard from '@site/src/components/FlowCard';

# Progress Bar

The **Progress Bar** widget offers a minimal way to display percentage-based values such as battery level or capacity. Advanced users can supply percentages through DataVista action cards. Configure up to three colors to visualize low, medium, and high values with smooth transitions.

![Progress bar animation](/img/docs/progress-bar-widget-animation.gif)

## Add the widget to your dashboard

1. Open the Homey app and go to **Dashboards**.
2. Enter **Edit Mode** and select **Add Widget**.
3. Choose **Apps** and select **DataVista**.
4. Pick the **Progress bar** widget.
5. Click the preview to add it to your dashboard.

![Progress bar widget preview](/img/docs/progress-bar-widget-preview.png)

## Configure the widget

| Setting | Description |
| --- | --- |
| **Datasource** | Select a DataVista percentage value*, DataVista range value*, device capability, or Homey variable. |
| **Refresh interval** | Polling frequency when using device capabilities. |
| **Show icon** | Display the capability or device icon (capability takes priority). |
| **Show name** | Display the datasource name. |
| **Overwrite name** | Replace the datasource name with custom text. |
| **Configuration source\*** | Use a DataVista configuration to drive the color scheme. |
| **Color 1** | Color for 0%. |
| **Color 2** | Color for 50%. |
| **Color 3** | Color for 100%. |

:::warning
To use DataVista percentage or range values, run the corresponding DataVista action card at least once so the value appears in the widget settings list.

<FlowCard source="actions/set-percentage.json" />
<FlowCard source="actions/set-range.json" />

:::

:::warning
The **configuration source** requires a DataVista action card that defines colors and offsets. Run it once before selecting it in the widget settings. When used, it overwrites the manual color settings.

<FlowCard source="actions/set-progress-bar-configuration.json" />
:::

:::info
You can specify any combination of one, two, or three colors. Missing colors are interpolated evenly across the progress bar.
:::

## Tutorials

- [Visualize temperature with a progress bar](tutorial-visualizing-temperature-with-a-progress-bar.md)

## FAQ

### Why does the bar animate through 0, 25, 50, 75, and 100?

The datasource is missing or unavailable. Reconfigure the datasource setting and select a valid source.

### How do I show a single color?

Select the same color for **Color 1** and **Color 2**.

### Why is the color list limited?

Homey widget settings do not support arbitrary color inputs, so the dropdown provides a curated set of options.

### Why do I see the device icon?

The widget displays the capability icon when available. If none is found, it falls back to the device icon.

### Why is there no icon?

Icons are currently available only for device capabilities. Ensure **Show icon** is enabled.
